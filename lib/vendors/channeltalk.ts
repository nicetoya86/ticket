import { env } from '@/lib/env';

export type ChannelTalkUserChat = {
	id: number | string;
	name?: string | null;
	profile?: { name?: string | null } | null;
	tags?: string[] | null;
	createdAt?: string | null;
};

export type ChannelTalkMessage = {
	id: number | string;
	chatId: number | string;
	plainText?: string | null;
	personType?: 'user' | 'manager' | string | null;
	createdAt?: string | null;
};

function getBaseUrl(): string {
	// 공식 문서 기준 기본 호스트: https://api.channel.io
	// 프로젝트별로 프록시를 두고 싶으면 CHANNEL_TALK_BASE_URL로 재정의 가능
	const base = process.env.CHANNEL_TALK_BASE_URL?.trim();
	if (base) return base.replace(/\/+$/, '');
	return 'https://api.channel.io';
}

async function apiGet(path: string, query?: Record<string, any>): Promise<any> {
	if (!env.CHANNEL_ACCESS_KEY || !env.CHANNEL_ACCESS_SECRET) {
		throw new Error('CHANNEL_ACCESS_KEY/CHANNEL_ACCESS_SECRET missing');
	}
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(query ?? {})) {
		if (v === undefined || v === null || v === '') continue;
		if (Array.isArray(v)) {
			for (const vv of v) q.append(k, String(vv));
		} else {
			q.set(k, String(v));
		}
	}
	const url = `${getBaseUrl()}${path}${q.toString() ? `?${q.toString()}` : ''}`;
	const res = await fetch(url, {
		headers: {
			'Content-Type': 'application/json',
			'X-Access-Key': env.CHANNEL_ACCESS_KEY,
			'X-Access-Secret': env.CHANNEL_ACCESS_SECRET,
		},
		cache: 'no-store',
	});
	if (!res.ok) {
		throw new Error(`ChannelTalk GET ${path} HTTP ${res.status}`);
	}
	return await res.json();
}

function toIsoDateTime(v: any): string | null {
	try {
		if (typeof v === 'number' && Number.isFinite(v)) {
			return new Date(v).toISOString();
		}
		const s = String(v ?? '').trim();
		if (!s) return null;
		const d = new Date(s);
		if (Number.isFinite(d.getTime())) return d.toISOString();
		return null;
	} catch {
		return null;
	}
}

const KST_OFFSET = '+09:00';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const userChatsCache = new Map<string, { updatedAt: number; data: ChannelTalkUserChat[] }>();
const messagesCache = new Map<string, { updatedAt: number; data: ChannelTalkMessage[] }>();

function toEpochMs(dateStr: string | null, endOfDay = false): number | null {
	if (!dateStr) return null;
	const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
	const ms = Date.parse(`${dateStr}${suffix}${KST_OFFSET}`);
	return Number.isFinite(ms) ? ms : null;
}

const toKstDateString = (ms: number | null): string | undefined => {
	if (ms == null || !Number.isFinite(ms)) return undefined;
	const shifted = new Date(ms + KST_OFFSET_MS);
	return shifted.toISOString().slice(0, 10);
};

export async function listUserChats(from: string, to: string, limit = 5000): Promise<ChannelTalkUserChat[] | []> {
	const results: ChannelTalkUserChat[] = [];
	const fromMs = toEpochMs(from, false);
	const toMs = toEpochMs(to, true);
	const states: Array<'opened' | 'closed'> = ['opened', 'closed'];
	const pageSize = 200;
	const cacheKey = `${from ?? ''}|${to ?? ''}|${limit}`;
	const cached = userChatsCache.get(cacheKey);
	if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
		return cached.data.slice(0, limit);
	}

	function extractTags(chat: any): string[] {
		const out: string[] = [];
		const addString = (value: string) => {
			const s = String(value ?? '').trim();
			if (!s) return;
			if (/^\s*\[/.test(s)) {
				try {
					const arr = JSON.parse(s);
					if (Array.isArray(arr)) {
						for (const part of arr) addString(part);
						return;
					}
				} catch { }
			}
			const split = s.split(/[;,|]/g).map((part) => part.trim()).filter(Boolean);
			if (split.length > 1) {
				for (const part of split) addString(part);
				return;
			}
			out.push(s);
		};
		const push = (v: any) => {
			if (v == null) return;
			if (typeof v === 'string') {
				addString(v);
				return;
			}
			if (typeof v === 'object') {
				const candidate = (v as any).name ?? (v as any).value ?? (v as any).key;
				if (candidate) {
					addString(candidate);
				}
			}
		};
		// Common shapes:
		// - tags: string[] | {name}|{value}|{key}
		// - tagNames: string[]
		// - labels / labelNames: string[]
		// - string with separators
		const tags = (chat as any)?.tags;
		if (Array.isArray(tags)) {
			for (const t of tags) {
				if (typeof t === 'string') push(t);
				else if (t && typeof t === 'object') push((t as any).name ?? (t as any).value ?? (t as any).key);
			}
		} else if (typeof tags === 'string') {
			for (const s of String(tags).split(/[;,|]/g)) push(s);
		}
		const tagNames = (chat as any)?.tagNames ?? (chat as any)?.tag_names ?? (chat as any)?.labelNames ?? (chat as any)?.labels;
		if (Array.isArray(tagNames)) {
			for (const t of tagNames) push(t);
		}
		// nested profile containers
		const p = (chat as any)?.profile ?? {};
		const pTags = (p as any)?.tags ?? (p as any)?.tagNames;
		if (Array.isArray(pTags)) {
			for (const t of pTags) push(t);
		} else if (typeof pTags === 'string') {
			for (const s of String(pTags).split(/[;,|]/g)) push(s);
		}
		// dedupe
		return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)));
	}

	const dateWindows: Array<{ startMs: number | null; endMs: number | null; startDate?: string; endDate?: string }> = [];
	const ONE_DAY_MS = 24 * 3600 * 1000;
	const WINDOW_DAYS = 30;
	const windowSpan = WINDOW_DAYS * ONE_DAY_MS;
	if (fromMs != null && toMs != null && Number.isFinite(fromMs) && Number.isFinite(toMs)) {
		let cursorStart = fromMs;
		while (cursorStart <= toMs && results.length < limit) {
			const cursorEnd = Math.min(cursorStart + windowSpan, toMs);
			dateWindows.push({
				startMs: cursorStart,
				endMs: cursorEnd,
				startDate: toKstDateString(cursorStart),
				endDate: toKstDateString(cursorEnd + 1000), // Ensure end date includes the full day
			});
			cursorStart = cursorEnd + ONE_DAY_MS;
		}
	} else {
		dateWindows.push({ startMs: fromMs, endMs: toMs, startDate: from ?? undefined, endDate: toKstDateString((toMs ?? 0) + 1000) ?? to ?? undefined });
	}

	for (const window of dateWindows) {
		for (const state of states) {
			let cursor = '';
			for (let i = 0; i < 200 && results.length < limit * 3; i++) {
				const params: any = {
					limit: pageSize,
					state,
					cursor,
				};

				// Add date parameters only if they exist (like channel_backfill_http.js)
				if (window.startDate) {
					params.startDate = window.startDate;
					params.createdAtFrom = `${window.startDate}T00:00:00+09:00`;
				}
				if (window.endDate) {
					params.endDate = window.endDate;
					params.createdAtTo = `${window.endDate}T23:59:59+09:00`;
				}

				const json: any = await apiGet('/open/v5/user-chats', params);
				const rows = Array.isArray(json?.userChats) ? json.userChats : [];

				for (const c of rows) {
					const createdAtRaw = Number((c as any)?.createdAt ?? 0);
					if (window.startMs && createdAtRaw && createdAtRaw < window.startMs) continue;
					if (window.endMs && createdAtRaw && createdAtRaw > window.endMs) continue;
					const id = (c as any)?.id ?? (c as any)?.chatId ?? (c as any)?._id ?? null;
					if (!id) continue;
					if (results.find((r) => r.id === id)) continue;
					results.push({
						id,
						createdAt: toIsoDateTime((c as any)?.createdAt),
						tags: (c as any)?.tags ?? [],
					});
					if (results.length >= limit * 3) break;
				}
				const nextCursor = json?.next ?? null;
				if (!nextCursor) break;
				cursor = nextCursor;
			}
			if (results.length >= limit) break;
		}
		if (results.length >= limit) break;
	}
	const sliced = results.slice(0, limit);
	userChatsCache.set(cacheKey, { updatedAt: Date.now(), data: sliced });
	return sliced;
}

export async function listMessagesByChatIds(chatIds: Array<number | string>, limitPerChat = 1000): Promise<ChannelTalkMessage[]> {
	const results: ChannelTalkMessage[] = [];
	for (const chatId of chatIds) {
		const cacheKey = `${chatId}|${limitPerChat}`;
		const cached = messagesCache.get(cacheKey);
		if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
			results.push(...cached.data);
			continue;
		}
		const perChat: ChannelTalkMessage[] = [];
		let next: string | null = null;
		for (let i = 0; i < 20 && results.length < 200000; i++) {
			// 공식 문서 기준: GET /open/v5/user-chats/{id}/messages
			const json: any = await apiGet(`/open/v5/user-chats/${encodeURIComponent(String(chatId))}/messages`, {
				limit: Math.min(200, limitPerChat),
				cursor: next ?? '',
			});
			const arr = Array.isArray(json?.messages) ? json.messages : (Array.isArray(json) ? json : []);
			for (const m of arr) {
				const id = (m as any)?.id ?? (m as any)?.messageId ?? (m as any)?._id ?? null;
				const plainText = (m as any)?.plainText ?? (m as any)?.text ?? (m as any)?.content ?? null;
				const personType = (m as any)?.personType ?? (m as any)?.type ?? null;
				const createdAt = toIsoDateTime((m as any)?.createdAt ?? (m as any)?.created_at);
				if (id != null) {
					const msg = {
						id,
						chatId,
						plainText: plainText != null ? String(plainText) : null,
						personType: personType != null ? String(personType) : null,
						createdAt,
					};
					results.push(msg);
					perChat.push(msg);
				}
			}
			next = (json as any)?.next ?? (json as any)?.cursor ?? (json as any)?.nextCursor ?? null;
			if (!next) break;
		}
		messagesCache.set(cacheKey, { updatedAt: Date.now(), data: perChat });
	}
	return results;
}

export async function listChatTags(limit = 1000): Promise<{ name: string; key: string }[]> {
	const json: any = await apiGet('/open/v5/chat-tags', { limit });
	const rows = Array.isArray(json?.chatTags) ? json.chatTags : [];
	return rows
		.map((r: any) => ({
			name: String(r?.name ?? '').trim(),
			key: String(r?.key ?? r?.name ?? '').trim(),
		}))
		.filter((r: { key: string }) => r.key.length > 0);
}


