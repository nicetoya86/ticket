import { NextResponse } from 'next/server';
import { getAllowedInquiryType, isAllowedInquiryType, normalizeInquiryType } from '@/lib/inquiries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 5 * 60 * 1000;
const optionsCache = new Map<string, { updatedAt: number; items: Array<{ inquiry_type: string; ticket_count: number }> }>();
const hasSupabaseConfig = Boolean(
	process.env.SUPABASE_ANON_KEY &&
		process.env.SUPABASE_SERVICE_ROLE_KEY &&
		(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_ID)
);
let supabaseAdminPromise: Promise<any> | null = null;
const getSupabaseAdmin = async () => {
	if (!hasSupabaseConfig) return null;
	if (!supabaseAdminPromise) {
		supabaseAdminPromise = import('@/lib/supabaseServer').then((mod) => mod.supabaseAdmin);
	}
	return supabaseAdminPromise;
};
const extractTagParts = (tagsIn?: string[] | null): string[] => {
	const out: string[] = [];
	const add = (value: any) => {
		if (value == null) return;
		const s = normalizeInquiryType(String(value ?? ''));
		if (!s) return;
		if (/^\s*\[/.test(String(value ?? ''))) {
			try {
				const arr = JSON.parse(String(value ?? ''));
				if (Array.isArray(arr)) {
					for (const part of arr) add(part);
					return;
				}
			} catch {}
		}
		const split = s.split(/[;,|]/g).map((part) => part.trim()).filter(Boolean);
		if (split.length > 1) {
			for (const part of split) add(part);
			return;
		}
		out.push(s);
	};
	if (Array.isArray(tagsIn)) {
		for (const tag of tagsIn) add(tag);
	}
	return Array.from(new Set(out));
};
const pickPrimaryTag = (tagsIn?: string[] | null): string | null => {
	const parts = extractTagParts(tagsIn);
	for (const part of parts) {
		if (isAllowedInquiryType(part)) return part;
	}
	return parts.length > 0 ? parts[0] : null;
};

export async function GET(req: Request) {
	// Always prefer DB → RPC 집계 → 텍스트 그룹 → 마지막으로 외부 API 폴백
	const { searchParams } = new URL(req.url);
	const supabaseAdmin = await getSupabaseAdmin();
	const channelDbAvailable = Boolean(supabaseAdmin && process.env.CHANNEL_DB_ENABLED === 'true');
	const clampDateRange = (start: string, end: string): { from: string; to: string } => {
		const fromDate = new Date(start);
		const toDate = new Date(end);
		if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
			return { from: start, to: end };
		}
		if (toDate.getTime() < fromDate.getTime()) {
			return {
				from: toDate.toISOString().slice(0, 10),
				to: fromDate.toISOString().slice(0, 10)
			};
		}
		const ONE_DAY_MS = 24 * 3600 * 1000;
		const maxSpanMs = 365 * ONE_DAY_MS;
		if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
			const adjustedTo = new Date(fromDate.getTime() + maxSpanMs);
			return {
				from: fromDate.toISOString().slice(0, 10),
				to: adjustedTo.toISOString().slice(0, 10)
			};
		}
		return {
			from: fromDate.toISOString().slice(0, 10),
			to: toDate.toISOString().slice(0, 10)
		};
	};
	const rawFrom = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const rawTo = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
	const { from, to } = clampDateRange(rawFrom, rawTo);
	const source = searchParams.get('source') ?? 'channel';
	const fieldTitle = searchParams.get('fieldTitle') ?? '문의유형(고객)';
	const cacheKey = `${source}|${from}|${to}|${fieldTitle}`;

	const normalizeItems = (items: Array<{ inquiry_type: string; ticket_count: number }>) => {
		const seen = new Set<string>();
		const normalized: Array<{ inquiry_type: string; ticket_count: number }> = [];
		for (const item of items ?? []) {
			const inquiry = normalizeInquiryType(item?.inquiry_type ?? '');
			const count = Number(item?.ticket_count ?? 0);
			if (!inquiry) continue;
			if (!isAllowedInquiryType(inquiry)) continue;
			if (seen.has(inquiry)) continue;
			seen.add(inquiry);
			normalized.push({ inquiry_type: inquiry, ticket_count: count });
		}
		return normalized;
	};
	const respond = (items: Array<{ inquiry_type: string; ticket_count: number }>) => {
		const normalizedItems = normalizeItems(items);
		if (normalizedItems.length > 0) {
			optionsCache.set(cacheKey, { updatedAt: Date.now(), items: normalizedItems });
		}
		return NextResponse.json({ items: normalizedItems }, { headers: { 'Cache-Control': 'no-store' } });
	};
	const fetchChannelTagCounts = async (): Promise<Array<{ inquiry_type: string; ticket_count: number }>> => {
		try {
			if (channelDbAvailable && supabaseAdmin) {
				const start = `${from}T00:00:00+09:00`;
				const end = `${to}T23:59:59.999+09:00`;
				const { data: msgs, error: msgsError } = await supabaseAdmin
					.from('raw_channel_messages')
					.select('conversation_id')
					.gte('created_at', start)
					.lte('created_at', end)
					.eq('sender', 'user')
					.limit(50000);
				if (!msgsError && Array.isArray(msgs) && msgs.length > 0) {
					const convIds = Array.from(new Set(msgs.map((m: any) => String(m?.conversation_id ?? '')).filter(Boolean)));
					if (convIds.length > 0) {
						const chunkSize = 500;
						const conversations: any[] = [];
						for (let i = 0; i < convIds.length; i += chunkSize) {
							const chunk = convIds.slice(i, i + chunkSize);
							const { data, error } = await supabaseAdmin
								.from('raw_channel_conversations')
								.select('id, tags')
								.in('id', chunk);
							if (!error && Array.isArray(data)) conversations.push(...data);
						}
						const counter = new Map<string, number>();
						for (const conv of conversations) {
							const tag = pickPrimaryTag(conv?.tags ?? null);
							if (!tag || !isAllowedInquiryType(tag)) continue;
							counter.set(tag, (counter.get(tag) ?? 0) + 1);
						}
						const derived = [...counter.entries()]
							.map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count }))
							.sort((a, b) => b.ticket_count - a.ticket_count);
						if (derived.length > 0) {
							return derived;
						}
					}
				}
			}
		} catch (err) {
			console.error('ChannelTalk DB tag fetch failed', err);
		}
		try {
			const { listUserChats } = await import('@/lib/vendors/channeltalk');
			const chats = await listUserChats(from, to, 50000);
			const counts = new Map<string, number>();
			for (const c of chats) {
				const rawTags: string[] = Array.isArray(c?.tags) ? (c?.tags as string[]) : [];
				for (const tag of rawTags) {
					const normalized = normalizeInquiryType(String(tag ?? '').trim());
					if (!normalized || !isAllowedInquiryType(normalized)) continue;
					counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
				}
			}
			return [...counts.entries()]
				.filter(([, count]) => count > 0)
				.sort((a, b) => b[1] - a[1])
				.map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count }));
		} catch (err) {
			console.error('ChannelTalk tag fetch failed', err);
			return [];
		}
	};

	const cached = optionsCache.get(cacheKey);
	if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
		return NextResponse.json({ items: cached.items }, { headers: { 'Cache-Control': 'no-store' } });
	}

	// 1) DB 경로 (있으면 가장 빠름)
	try {
		if (supabaseAdmin) {
			// unified counts
			const fieldTitleCandidates = Array.from(new Set<string>([fieldTitle, '문의유형', '문의 유형', '문의유형(고객)']));
			for (const ft of fieldTitleCandidates) {
				const { data, error } = await supabaseAdmin.rpc('unified_inquiries_by_type', { p_from: from, p_to: to, p_field_title: ft, p_status: null });
				const items = (data ?? []).filter((r: any) => isAllowedInquiryType(r?.inquiry_type));
				if (!error && items.length > 0) {
					return respond(items);
				}
			}

			// derive from grouped texts if counts empty
			for (const ft of fieldTitleCandidates) {
				const fb = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: ft, p_status: null });
				if (!fb.error) {
					const map = new Map<string, number>();
					for (const row of fb.data ?? []) {
						const t = getAllowedInquiryType(row?.inquiry_type);
						if (!t) continue;
						map.set(t, (map.get(t) ?? 0) + 1);
					}
					const derived = Array.from(map.entries()).map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count })).sort((a, b) => b.ticket_count - a.ticket_count);
					if (derived.length > 0) {
						return respond(derived);
					}
				}
			}
		}
	} catch {}

	// 2) Zendesk 원천 API 경로 (필드 정의와 기간 내 등장값 기반)
	if (source === 'zendesk') {
		try {
			const { fetchTicketFields, fetchIncrementalTickets } = await import('@/lib/vendors/zendesk_ext');
			const fields = await fetchTicketFields();
			const candidates = Array.from(new Set<string>([fieldTitle, '문의유형', '문의 유형', '문의유형(고객)']));
			const field = fields.find((f: any) => candidates.includes(String(f?.title ?? '').trim()));

			let options: string[] = [];
			if (field && Array.isArray(field?.custom_field_options)) {
				options = (field.custom_field_options as any[])
					.map((o: any) => String(o?.value ?? '').trim())
					.filter((v) => v.length > 0);
			}

			// 기간 내 티켓에서 실제 등장한 값 집계
			let counts: Map<string, number> = new Map();
			if (field?.id) {
				const tickets = await fetchIncrementalTickets(from, to);
				for (const t of tickets) {
					const cfs: Array<{ id: number; value: any }> = Array.isArray((t as any)?.custom_fields) ? (t as any).custom_fields : [];
					const cf = cfs.find((c) => Number(c?.id) === Number(field.id));
					const v = cf?.value;
					const values: string[] = Array.isArray(v) ? v.map((x) => String(x ?? '').trim()) : [String(v ?? '').trim()];
					for (const val of values) {
						const normalized = getAllowedInquiryType(val);
						if (!normalized) continue;
						counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
					}
				}
			}

			// 우선순위: 기간 내 등장값 → 필드 옵션
			const byCount = [...counts.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count }));
			if (byCount.length > 0) {
				return respond(byCount);
			}
			if (options.length > 0) {
				return respond(options.map((v) => ({ inquiry_type: v, ticket_count: 0 })));
			}
		} catch (e: any) {
			// Fall through
		}
	}

	// 3) ChannelTalk 원천 API (DB·Zendesk 모두 비었을 때 최종 폴백)
	if (source === 'channel') {
		const channelItems = await fetchChannelTagCounts();
		if (channelItems.length > 0) {
			return respond(channelItems);
		}
	}

	// 4) 최종 빈 결과
	return respond([]);
}


