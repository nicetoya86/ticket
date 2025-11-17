import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
    // If Supabase runtime config is missing in hosting env, return empty result instead of 500
    const hasConfig = Boolean(process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_ID));
    if (!hasConfig) {
        return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Lazy-load Supabase client to ensure env is available at runtime in Vercel
    const { supabaseAdmin } = await import('@/lib/supabaseServer');
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
    const fieldTitle = searchParams.get('fieldTitle') ?? '문의유형(고객)';
    const status = searchParams.get('status') ?? 'closed';
    const inquiryTypeParam = searchParams.get('inquiryType') ?? '';
    const source = searchParams.get('source') ?? '';
    const group = searchParams.get('group') === '1' || searchParams.get('group') === 'true';
    const detail = searchParams.get('detail') ?? '';
	const debug = searchParams.get('debug') === '1';
	const ticketIdParam = searchParams.get('ticketId');
	const ticketId = ticketIdParam ? Number(ticketIdParam) : NaN;
	const filterByTicket = Number.isFinite(ticketId) && ticketId > 0;

    // helpers for cleaning texts mode
    const stripBackref = (s: string): string => s.replace(/(^|\n)\s*\\\d+:?\s*/g, '$1');
    const isPhoneCall = (s: string): boolean => /((발신전화\s+to\s+\d+|수신전화\s+\d+)|전화구분\s*:\s*(수신전화|발신전화))/i.test(s);
    const isBotLine = (line: string): boolean => {
        const l = line.trim();
        // Speaker or clear bot markers
        if (/^(\(\d{1,2}:\d{2}:\d{2}\)\s*)?여신BOT\b/i.test(l)) return true;
        if (/\bBOT\b/i.test(l)) return true;
        if (/여신BOT님이\s*업로드함/i.test(l)) return true;
        // Greetings and generic guidance from bot
        if (/여신티켓에\s*관심을\s*가지고\s*이용해\s*주셔서\s*감사드립니다/i.test(l)) return true;
        if (/안녕하세요,?\s*여신티켓입니다\.?/i.test(l)) return true;
        if (/궁금하신\s*내용(을|을요)?\s*남겨주시면\s*꼼꼼하게\s*확인\s*후\s*안내해\s*드리겠습니다/i.test(l)) return true;
        if (/정확한\s*안내를\s*위해\s*아래\s*정보를\s*입력해\s*주세요/i.test(l)) return true;
        if (/\(사진을\s*누르면\s*확대해서?\s*보실\s*수\s*있어요!?\)/i.test(l)) return true;
        if (/운영시간\s*:\s*/.test(l)) return true;
        if (/점심시간\s*:\s*/.test(l)) return true;
        if (/주말\s*및\s*공휴일\s*휴무/.test(l)) return true;
        if (/아래\s*2가지\s*방법/.test(l)) return true;
        if (/아래\s*버튼(을)?\s*눌러\s*내용\s*확인하기/i.test(l)) return true;
        if (/키워드를\s*입력/.test(l)) return true;
        if (/\[처음으로\]/.test(l)) return true;
        if (/처음으로/.test(l)) return true;
        if (/^✅|^✔️|^➡️|^🔍️|^🔎️|^🔊️|^❗️|^👇️/u.test(l)) return true; // lines starting with these emojis
        // Notice/announcement cards recommended by bot
        if (/^\s*\[?\s*공지\s*\]?/i.test(l)) return true;
        if (/공지사항/i.test(l)) return true;
        if (/초대왕\s*발표/i.test(l)) return true;
        if (/보너스\s*포인트|보너스포인트/i.test(l)) return true;
        if (/당첨자(분들)?/i.test(l)) return true;
        if (/SMS를?\s*전달\s*드릴\s*예정입니다?/i.test(l)) return true;
        if (/유의\s*사항/iu.test(l)) return true;
        if (/자세한\s*화면은\s*아래\s*이미지를\s*눌러주세요/iu.test(l)) return true;
        if (/문의하신\s*내용에\s*도움이\s*될만한\s*답을\s*찾아드릴게요/i.test(l)) return true;
        if (/문서\s*보기\s*:\s*/.test(l)) return true;
        if (/궁금하신\s*점이\s*해결되셨나요\??/i.test(l)) return true;
        if (/해결되었어요\.?/i.test(l)) return true;
        if (/해결되지\s*않았어요\.?/i.test(l)) return true;
        if (/:\s*해결되지\s*않았어요\.?$/i.test(l)) return true; // iOS User ...: 해결되지 않았어요.
        if (/자주\s*묻는\s*질문/i.test(l)) return true;
        if (/^\d+\.\s*Q[\.\s]/i.test(l)) return true; // numbered Q.
        if (/^\d+\.\s*A[\.\s]/i.test(l)) return true; // numbered A.
        if (/구매\s*취소\s*시\s*환불은\s*언제\s*되나요\?/i.test(l)) return true;
        if (/구매\s*후\s*1년\s*(이내|경과)\s*취소건/i.test(l)) return true;
        if (/영업일\s*기준\s*최대\s*7일/i.test(l)) return true;
        if (/쿠폰\/?포인트.*환급되나요\?/i.test(l)) return true;
        if (/마이\s*>\s*구매\s*목록\s*>\s*구매\s*취소하기/i.test(l)) return true;
        if (/문의할\s*내용을\s*다시\s*입력하기/i.test(l)) return true;
        if (/순차적으로\s*안내를?\s*드리고\s*있어(\s*다소)?\s*시간이\s*소요될\s*수\s*있는\s*점\s*양해\s*부탁드립니다/i.test(l)) return true;
        if (/^감사합니다\s*:?\s*\)?$/i.test(l)) return true;
        if (/담당\s*매니저를\s*연결해\s*드릴게요/.test(l)) return true;
        if (/정보\s*입력\s*감사합니다/.test(l)) return true;
        // Button-name style labels (examples and generalized heuristics)
        if (/(시술이벤트\s*구매\s*방법|구매가\s*안돼요|구매\s*취소\s*방법|구매\s*취소가\s*되지\s*않았어요|결제방식\s*지원\s*여부)/i.test(l)) return true;
        // short imperative/help labels commonly used for buttons
        if (l.length <= 30 && /(?:방법|여부|안돼요|안되요|안됩니다|안됨|확인하기|다시\s*입력하기|검색하기|연장하기|취소하기|문의하기)$/u.test(l)) return true;
        // comma-separated multiple button labels in one line
        if (/,\s*/.test(l) && /(방법|여부|안돼요|안되요|안됩니다|취소|구매|결제)/.test(l) && l.length <= 80) return true;
        // Purchase / guidance flows
        if (/구매\s*ID는\s*아래\s*경로에서\s*확인이\s*가능해요/i.test(l)) return true;
        if (/마이\s*>\s*구매\s*목록/i.test(l)) return true;
        if (/티켓\s*구매\s*후\s*미사용\s*티켓은\s*앱을\s*통해\s*직접\s*연장/i.test(l)) return true;
        if (/구매\s*일자\s*확인\s*후\s*해당하는\s*구매\s*시점을\s*선택/i.test(l)) return true;
        if (/\[?2023년\s*7월\s*12일\]?\s*(이전|이후)\s*구매\s*티켓\s*연장/i.test(l)) return true;
        if (/미사용\s*티켓은\s*유효기간\s*만료\s*30일\s*전부터\s*6개월\s*단위로\s*최대\s*2번\s*기간\s*연장/i.test(l)) return true;
        if (/기간\s*연장은\s*\[?티켓\/예약\s*>\s*티켓\s*탭\s*>\s*티켓\s*선택\s*>\s*연장하기\]?/i.test(l)) return true;
        // Tabular/help content
        if (/^(회원가입\/계정|티켓\s*사용\/예약|시술\s*후기|쿠폰\/포인트|구매\/환불|앱\s*이용)/.test(l)) return true;
        if (/^(텍스트\/포토\s*후기|영수증\s*후기|후기\s*검토\s*기준|후기\s*소명\s*접수)/.test(l)) return true;
        if (/^검토중$/.test(l)) return true;
        if (/^(URL|유형|크기)\s*:\s*/.test(l)) return true;
        return false;
    };
    const cleanText = (s: string): string => {
        const noRef = stripBackref(s);
        const lines = noRef.split('\n');
        const kept = lines.filter((ln) => !isBotLine(ln));
        // Collapse excessive blank lines and trim spaces for better readability
        let out = kept
            .map((ln) => ln.replace(/[\t ]+/g, ' ').trimEnd())
            .join('\n');
        // remove leading/trailing blank lines and collapse 3+ newlines to 2
        out = out.replace(/\n{3,}/g, '\n\n').replace(/[\t ]*\n[\t ]*/g, '\n').trim();
        return out;
    };
    // Narrow variant for texts mode: remove only speaker lines starting with 여신BOT (optionally prefixed by timestamp)
    const cleanTextBodyOnly = (s: string): string => {
        const noRef = stripBackref(s);
        const lines = noRef.split('\n');
        const kept = lines.filter((ln) => !/^\s*(?:\(\d{1,2}:\d{2}:\d{2}\)\s*)?여신BOT\b/i.test(ln.trim()));
        let out = kept.map((ln) => ln.replace(/[\t ]+/g, ' ').trimEnd()).join('\n');
        out = out.replace(/\n{3,}/g, '\n\n').replace(/[\t ]*\n[\t ]*/g, '\n').trim();
        return out;
    };

    const normalizeType = (v: string): string => {
        const s = (v ?? '').trim();
        try {
            if (/^\s*\[/.test(s)) {
                const parsed = JSON.parse(s);
                if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') return String(parsed[0]).trim();
            }
        } catch {}
        return s;
    };

    // Candidate field titles to improve robustness across sources/forms
    const fieldTitleCandidates = Array.from(new Set<string>([
        fieldTitle,
        '문의유형',
        '문의 유형',
        '문의유형(고객)'
    ])).filter((v) => typeof v === 'string' && v.trim().length > 0);

    // texts: always return raw body-derived texts; ignore group to honor "body only" requirement
	if (detail === 'texts') {
        let all: any[] = [];
        let lastError: string | null = null;
        // Try with provided status first
        for (const ft of fieldTitleCandidates) {
            const { data, error } = await supabaseAdmin.rpc('inquiries_texts_by_type', { p_from: from, p_to: to, p_field_title: ft, p_status: status });
            if (error) { lastError = error.message; continue; }
            all = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
            if (all.length > 0) break;
        }
        // Retry without status restriction if empty
        if (all.length === 0 && status) {
            for (const ft of fieldTitleCandidates) {
                const { data, error } = await supabaseAdmin.rpc('inquiries_texts_by_type', { p_from: from, p_to: to, p_field_title: ft, p_status: '' });
                if (error) { lastError = error.message; continue; }
                all = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
                if (all.length > 0) break;
            }
        }
        if (all.length === 0 && lastError) {
            return NextResponse.json({ items: [], note: 'texts_error', message: lastError }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }
		if (filterByTicket) {
			all = all.filter((r: any) => Number(r?.ticket_id) === ticketId);
		}
		const tnorm = normalizeType(inquiryTypeParam);
		const forType = tnorm ? all.filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === tnorm) : all;
		const preCount = forType.length;
		const cleaned = forType.map((r: any) => ({ ...r, text_value: cleanTextBodyOnly(String(r.text_value ?? '')) }));
		const emptyBodies = cleaned.filter((r: any) => String(r.text_value ?? '').trim().length === 0).length;
		const excludeTickets = new Set<number>();
		for (const r of cleaned) {
			if (isPhoneCall(String(r.text_value ?? ''))) excludeTickets.add(Number(r.ticket_id));
		}
		const items = cleaned
			.filter((r: any) => !excludeTickets.has(Number(r.ticket_id)) && String(r.text_value ?? '').trim().length > 0);

		// Final fallback: if still empty, pull from Zendesk (tickets/comments) when DB rows are missing
		if ((items ?? []).length === 0 && (source === 'zendesk' || source === '')) {
			try {
				const f = await supabaseAdmin.from('zd_ticket_fields').select('id,title').in('title', fieldTitleCandidates).limit(1).maybeSingle();
				let fieldId = f?.data?.id as number | undefined;
				// If field meta missing in DB, fetch from Zendesk live
				if (!fieldId) {
					try {
						const { fetchTicketFields } = await import('@/lib/vendors/zendesk_ext');
						const fields = await fetchTicketFields();
						const ff = fields.find((z: any) => fieldTitleCandidates.includes(String(z?.title ?? '').trim()));
						if (ff?.id) fieldId = Number(ff.id);
					} catch {}
				}
				if (fieldId) {
					const tks = await supabaseAdmin
						.from('raw_zendesk_tickets')
						.select('id, created_at, description, custom_fields')
						.gte('created_at', from)
						.lte('created_at', to)
						.limit(10000);
					let matched: any[] = [];
					const normTarget = tnorm;
					if (!tks.error && (tks.data ?? []).length > 0) {
						matched = (tks.data ?? []).filter((t: any) => {
							const cfs: Array<{ id: number; value: any }> = Array.isArray(t?.custom_fields) ? t.custom_fields : [];
							const cf = cfs.find((c) => Number(c?.id) === Number(fieldId));
							const v = cf?.value;
							const values: string[] = Array.isArray(v) ? v.map((x) => String(x ?? '').trim()) : [String(v ?? '').trim()];
							return values.some((vv) => normalizeType(vv) === normTarget);
						});
					} else {
						try {
							const { fetchIncrementalTickets } = await import('@/lib/vendors/zendesk_ext');
							const zTickets = await fetchIncrementalTickets(from, to);
							matched = zTickets.filter((t: any) => {
								const cfs: Array<{ id: number; value: any }> = Array.isArray(t?.custom_fields) ? t.custom_fields : [];
								const cf = cfs.find((c) => Number(c?.id) === Number(fieldId));
								const v = cf?.value;
								const values: string[] = Array.isArray(v) ? v.map((x) => String(x ?? '').trim()) : [String(v ?? '').trim()];
								return values.some((vv) => normalizeType(vv) === normTarget);
							});
						} catch {}
					}

					// 1) description-as-text items
					const derivedDesc = (matched ?? [])
						.map((t: any) => ({
							inquiry_type: normTarget,
							ticket_id: Number(t.id),
							created_at: String(t.created_at),
							text_type: 'body',
							text_value: cleanTextBodyOnly(String(t.description ?? ''))
						}))
						.filter((r: any) => String(r.text_value ?? '').trim().length > 0 && !isPhoneCall(String(r.text_value ?? '')));

					// 2) comments as separate items
					let derivedComments: any[] = [];
					const ticketIds = (matched ?? []).map((t: any) => Number(t.id)).filter((x: any) => Number.isFinite(x));
					if (ticketIds.length > 0) {
						const chunkSize = 200;
						for (let i = 0; i < ticketIds.length; i += chunkSize) {
							const chunk = ticketIds.slice(i, i + chunkSize);
							let commentRows: any[] = [];
							const comm = await supabaseAdmin
								.from('raw_zendesk_comments')
								.select('ticket_id, comment_id, created_at, body')
								.in('ticket_id', chunk)
								.order('created_at', { ascending: true });
							if (!comm.error && (comm.data ?? []).length > 0) {
								commentRows = comm.data ?? [];
							} else {
								try {
									const { fetchTicketComments } = await import('@/lib/vendors/zendesk');
									for (const tid of chunk) {
										const zc = await fetchTicketComments(Number(tid), 500);
										commentRows.push(...(zc ?? []).map((c: any) => ({
											ticket_id: Number(tid),
											comment_id: Number(c.id),
											created_at: String(c.created_at),
											body: String(c.body ?? '')
										})));
									}
								} catch {}
							}
							if ((commentRows ?? []).length > 0) {
								const rowsOut = commentRows
									.map((c: any) => ({
										inquiry_type: normTarget,
										ticket_id: Number(c.ticket_id),
										created_at: String(c.created_at),
										text_type: 'comment',
										text_value: cleanTextBodyOnly(String(c.body ?? ''))
									}))
									.filter((r: any) => String(r.text_value ?? '').trim().length > 0 && !isPhoneCall(String(r.text_value ?? '')));
								derivedComments.push(...rowsOut);
							}
						}
					}

					const combined = [...derivedComments, ...derivedDesc];
					if (combined.length > 0) {
						return NextResponse.json({ items: combined }, { headers: { 'Cache-Control': 'no-store' } });
					}

					// 3) heuristic fallback when custom field linking fails: match by tags/subject/description
					try {
						const toSlug = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '-');
						const tnormSlug = toSlug(normTarget);
						let zTickets: any[] = [];
						if (!tks.error && (tks.data ?? []).length > 0) {
							zTickets = tks.data ?? [];
						} else {
							const { fetchIncrementalTickets } = await import('@/lib/vendors/zendesk_ext');
							zTickets = await fetchIncrementalTickets(from, to);
						}
						const heuristic = zTickets.filter((t: any) => {
							const tags: string[] = Array.isArray(t?.tags) ? t.tags.map((x: any) => String(x ?? '').toLowerCase()) : [];
							const sub = String(t?.subject ?? '').toLowerCase();
							const desc = String(t?.description ?? '').toLowerCase();
							return tags.includes(tnormSlug) || tags.includes(normTarget.toLowerCase()) || sub.includes(normTarget) || desc.includes(normTarget);
						});
						let hComments: any[] = [];
						const hIds = heuristic.map((t: any) => Number(t.id)).filter((x: any) => Number.isFinite(x));
						if (hIds.length > 0) {
							const chunkSize2 = 200;
							for (let i = 0; i < hIds.length; i += chunkSize2) {
								const chunk2 = hIds.slice(i, i + chunkSize2);
								const comm2 = await supabaseAdmin
									.from('raw_zendesk_comments')
									.select('ticket_id, created_at, body')
									.in('ticket_id', chunk2)
									.order('created_at', { ascending: true });
								let rows2: any[] = [];
								if (!comm2.error && (comm2.data ?? []).length > 0) {
									rows2 = comm2.data ?? [];
								} else {
									const { fetchTicketComments } = await import('@/lib/vendors/zendesk');
									for (const tid of chunk2) {
										const zc2 = await fetchTicketComments(Number(tid), 500);
										rows2.push(...(zc2 ?? []).map((c: any) => ({
											ticket_id: Number(tid),
											created_at: String(c.created_at),
											body: String(c.body ?? '')
										})));
									}
								}
								const grouped2 = new Map<number, string[]>();
								for (const c of rows2) {
									const arr = grouped2.get(Number(c.ticket_id)) ?? [];
									const txt = cleanText(String(c.body ?? ''));
									if (txt.trim().length > 0 && !isPhoneCall(txt)) arr.push(txt);
									grouped2.set(Number(c.ticket_id), arr);
								}
								for (const [tid, arr] of grouped2.entries()) {
									if (arr.length === 0) continue;
									hComments.push({
										inquiry_type: normTarget,
										ticket_id: tid,
										created_at: String((rows2.find((z: any) => Number(z.ticket_id) === tid)?.created_at) ?? from),
										text_type: 'comments_block',
										text_value: arr.join('\n')
									});
								}
							}
						}
						const hDesc = heuristic.map((t: any) => ({
							inquiry_type: normTarget,
							ticket_id: Number(t.id),
							created_at: String(t.created_at),
							text_type: 'body',
							text_value: cleanText(String(t.description ?? ''))
						})).filter((r: any) => String(r.text_value ?? '').trim().length > 0 && !isPhoneCall(String(r.text_value ?? '')));
						const hCombined = [...hComments, ...hDesc];
						if (hCombined.length > 0) {
							return NextResponse.json({ items: hCombined }, { headers: { 'Cache-Control': 'no-store' } });
						}
					} catch {}
				}
			} catch {}
		}

		const payload: any = { items };
		if (debug) {
			payload.debug = {
				preCount,
				afterCleanNonEmpty: items.length,
				emptyBodies,
				phoneExcludedTicketCount: excludeTickets.size,
				phoneExcludedTicketIds: Array.from(excludeTickets.values()),
				distinctTypes: Array.from(new Set(all.map((r: any) => normalizeType(String(r.inquiry_type ?? ''))))).slice(0, 50),
			};
		}
		return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } else if (group) {
        let grouped: any[] = [];
        let lastError: string | null = null;
        for (const ft of fieldTitleCandidates) {
            const { data, error } = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: ft, p_status: status });
            if (error) { lastError = error.message; continue; }
            grouped = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
            if (grouped.length > 0) break;
        }
        if (grouped.length === 0 && status) {
            for (const ft of fieldTitleCandidates) {
                const { data, error } = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: ft, p_status: '' });
                if (error) { lastError = error.message; continue; }
                grouped = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
                if (grouped.length > 0) break;
            }
        }
        if (grouped.length === 0 && lastError) {
            return NextResponse.json({ items: [], note: 'grouped_texts_error', message: lastError }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }
        let items = grouped;
        // optional per-ticket filter for debugging
        if (filterByTicket) items = items.filter((r: any) => Number(r?.ticket_id) === ticketId);
        // inquiry type filter
        const tnorm = normalizeType(inquiryTypeParam);
        if (tnorm) items = items.filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === tnorm);
        // cleaning and phone-call exclusion
        items = items
            .map((r: any) => ({ ...r, text_value: cleanText(String(r.text_value ?? '')) }))
            .filter((r: any) => !isPhoneCall(String(r.text_value ?? '')) && String(r.text_value ?? '').trim().length > 0);

		// Final fallback: use raw Zendesk tickets descriptions if grouped texts are empty
		if ((items ?? []).length === 0 && (source === 'zendesk' || source === '')) {
			try {
				const f = await supabaseAdmin.from('zd_ticket_fields').select('id,title').in('title', fieldTitleCandidates).limit(1).maybeSingle();
				const fieldId = f?.data?.id as number | undefined;
				if (fieldId) {
					const tks = await supabaseAdmin
						.from('raw_zendesk_tickets')
						.select('id, created_at, description, custom_fields')
						.gte('created_at', from)
						.lte('created_at', to)
						.limit(10000);
					if (!tks.error) {
						const normTarget = tnorm;
						const matched = (tks.data ?? []).filter((t: any) => {
							const cfs: Array<{ id: number; value: any }> = Array.isArray(t?.custom_fields) ? t.custom_fields : [];
							const cf = cfs.find((c) => Number(c?.id) === Number(fieldId));
							const v = cf?.value;
							const values: string[] = Array.isArray(v) ? v.map((x) => String(x ?? '').trim()) : [String(v ?? '').trim()];
							return values.some((vv) => normalizeType(vv) === normTarget);
						});
						// 1) 티켓별로 comment들을 시간 순으로 합쳐 한 블록으로 반환(대화 형태에 근접)
						let derivedBlocks: any[] = [];
						const ticketIds = matched.map((t: any) => Number(t.id)).filter((x: any) => Number.isFinite(x));
						if (ticketIds.length > 0) {
							const chunkSize = 200;
							for (let i = 0; i < ticketIds.length; i += chunkSize) {
								const chunk = ticketIds.slice(i, i + chunkSize);
								const comm = await supabaseAdmin
									.from('raw_zendesk_comments')
									.select('ticket_id, created_at, body')
									.in('ticket_id', chunk)
									.order('created_at', { ascending: true });
								if (!comm.error) {
									const grouped = new Map<number, string[]>();
									for (const c of (comm.data ?? [])) {
										const arr = grouped.get(Number(c.ticket_id)) ?? [];
										const txt = cleanText(String(c.body ?? ''));
										if (txt.trim().length > 0 && !isPhoneCall(txt)) arr.push(txt);
										grouped.set(Number(c.ticket_id), arr);
									}
									for (const [tid, arr] of grouped.entries()) {
										if (arr.length === 0) continue;
										derivedBlocks.push({
											inquiry_type: normTarget,
											ticket_id: tid,
											created_at: String((comm.data ?? []).find((z: any) => Number(z.ticket_id) === tid)?.created_at ?? from),
											text_type: 'comments_block',
											text_value: arr.join('\n')
										});
									}
								}
							}
						}
						// 2) description을 보조로 추가
						const derivedDesc = matched.map((t: any) => ({
							inquiry_type: normTarget,
							ticket_id: Number(t.id),
							created_at: String(t.created_at),
							text_type: 'body',
							text_value: cleanText(String(t.description ?? ''))
						})).filter((r: any) => String(r.text_value ?? '').trim().length > 0 && !isPhoneCall(String(r.text_value ?? '')));

						const combined = [...derivedBlocks, ...derivedDesc];
						if (combined.length > 0) {
							return NextResponse.json({ items: combined }, { headers: { 'Cache-Control': 'no-store' } });
						}

						// 3) heuristic fallback by tags/subject/description when field match fails
						try {
							const toSlug = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '-');
							const tnormSlug = toSlug(normTarget);
							let zTickets: any[] = [];
							if (!tks.error && (tks.data ?? []).length > 0) {
								zTickets = tks.data ?? [];
							} else {
								const { fetchIncrementalTickets } = await import('@/lib/vendors/zendesk_ext');
								zTickets = await fetchIncrementalTickets(from, to);
							}
							const heuristic = zTickets.filter((t: any) => {
								const tags: string[] = Array.isArray(t?.tags) ? t.tags.map((x: any) => String(x ?? '').toLowerCase()) : [];
								const sub = String(t?.subject ?? '').toLowerCase();
								const desc = String(t?.description ?? '').toLowerCase();
								return tags.includes(tnormSlug) || tags.includes(normTarget.toLowerCase()) || sub.includes(normTarget) || desc.includes(normTarget);
							});
							let blocks: any[] = [];
							const hIds = heuristic.map((t: any) => Number(t.id)).filter((x: any) => Number.isFinite(x));
							if (hIds.length > 0) {
								const chunkSize2 = 200;
								for (let i = 0; i < hIds.length; i += chunkSize2) {
									const chunk2 = hIds.slice(i, i + chunkSize2);
									const comm2 = await supabaseAdmin
										.from('raw_zendesk_comments')
										.select('ticket_id, created_at, body')
										.in('ticket_id', chunk2)
										.order('created_at', { ascending: true });
									let rows2: any[] = [];
									if (!comm2.error && (comm2.data ?? []).length > 0) {
										rows2 = comm2.data ?? [];
									} else {
										const { fetchTicketComments } = await import('@/lib/vendors/zendesk');
										for (const tid of chunk2) {
											const zc2 = await fetchTicketComments(Number(tid), 500);
											rows2.push(...(zc2 ?? []).map((c: any) => ({
												ticket_id: Number(tid),
												created_at: String(c.created_at),
												body: String(c.body ?? '')
											})));
										}
									}
									const grouped2 = new Map<number, string[]>();
									for (const c of rows2) {
										const arr = grouped2.get(Number(c.ticket_id)) ?? [];
										const txt = cleanText(String(c.body ?? ''));
										if (txt.trim().length > 0 && !isPhoneCall(txt)) arr.push(txt);
										grouped2.set(Number(c.ticket_id), arr);
									}
									for (const [tid, arr] of grouped2.entries()) {
										if (arr.length === 0) continue;
										blocks.push({
											inquiry_type: normTarget,
											ticket_id: tid,
											created_at: String((rows2.find((z: any) => Number(z.ticket_id) === tid)?.created_at) ?? from),
											text_type: 'comments_block',
											text_value: arr.join('\n')
										});
									}
								}
							}
							const desc2 = heuristic.map((t: any) => ({
								inquiry_type: normTarget,
								ticket_id: Number(t.id),
								created_at: String(t.created_at),
								text_type: 'body',
								text_value: cleanText(String(t.description ?? ''))
							})).filter((r: any) => String(r.text_value ?? '').trim().length > 0 && !isPhoneCall(String(r.text_value ?? '')));
							const hCombined = [...blocks, ...desc2];
							if (hCombined.length > 0) {
								return NextResponse.json({ items: hCombined }, { headers: { 'Cache-Control': 'no-store' } });
							}
						} catch {}
					}
				}
			} catch {}
		}

        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === '1' || detail === 'users') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_users_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'users_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Aggregated counts with robust fallbacks
    let items: any[] = [];
    let lastAggError: string | null = null;
    for (const ft of fieldTitleCandidates) {
        const { data, error } = await supabaseAdmin.rpc('unified_inquiries_by_type', { p_from: from, p_to: to, p_field_title: ft, p_status: status });
        if (error) { lastAggError = error.message; continue; }
        items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        if (items.length > 0) break;
    }
    if (items.length === 0 && status) {
        for (const ft of fieldTitleCandidates) {
            const { data, error } = await supabaseAdmin.rpc('unified_inquiries_by_type', { p_from: from, p_to: to, p_field_title: ft, p_status: '' });
            if (error) { lastAggError = error.message; continue; }
            items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
            if (items.length > 0) break;
        }
    }
    if (items.length === 0) {
        for (const ft of fieldTitleCandidates) {
            const fb = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: ft, p_status: status });
            if (!fb.error) {
                const map = new Map<string, number>();
                for (const row of fb.data ?? []) {
                    const t = row?.inquiry_type as string | null;
                    if (!t || String(t).startsWith('병원_')) continue;
                    map.set(t, (map.get(t) ?? 0) + 1);
                }
                const derived = Array.from(map.entries()).map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count })).sort((a, b) => b.ticket_count - a.ticket_count);
                if (derived.length > 0) { items = derived; break; }
            } else {
                lastAggError = fb.error.message;
            }
        }
    }

    // Final fallback for Zendesk: derive "문의유형"을 태그 기반으로 생성 (기간 내 티켓에서 가장 많이 등장한 태그 상위)
    if (items.length === 0 && (source === 'zendesk' || source === '')) {
        const { data: tickets, error: tErr } = await supabaseAdmin
            .from('raw_zendesk_tickets')
            .select('id, created_at, tags')
            .gte('created_at', from)
            .lte('created_at', to)
            .limit(10000);
        if (!tErr && Array.isArray(tickets)) {
            const counter = new Map<string, number>();
            for (const t of tickets) {
                const tags: string[] = Array.isArray((t as any)?.tags) ? (t as any).tags : [];
                for (const tag of tags) {
                    const k = String(tag ?? '').trim();
                    if (!k) continue;
                    counter.set(k, (counter.get(k) ?? 0) + 1);
                }
            }
            const derived = [...counter.entries()]
                .map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count }))
                .sort((a, b) => b.ticket_count - a.ticket_count)
                .slice(0, 200);
            if (derived.length > 0) items = derived;
        }
    }
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}


