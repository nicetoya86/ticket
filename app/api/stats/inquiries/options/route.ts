import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
	// Always prefer DB → RPC 집계 → 텍스트 그룹 → 마지막으로 Zendesk 원천(API) 및 필드 옵션 폴백
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
	const source = searchParams.get('source') ?? 'zendesk';
	const fieldTitle = searchParams.get('fieldTitle') ?? '문의유형(고객)';

	// 1) DB 경로 (있으면 가장 빠름)
	try {
		const hasConfig = Boolean(process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_ID));
		if (hasConfig) {
			const { supabaseAdmin } = await import('@/lib/supabaseServer');

			// unified counts
			const fieldTitleCandidates = Array.from(new Set<string>([fieldTitle, '문의유형', '문의 유형', '문의유형(고객)']));
			for (const ft of fieldTitleCandidates) {
				const { data, error } = await supabaseAdmin.rpc('unified_inquiries_by_type', { p_from: from, p_to: to, p_field_title: ft, p_status: '' });
				const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
				if (!error && items.length > 0) {
					return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
				}
			}

			// derive from grouped texts if counts empty
			for (const ft of fieldTitleCandidates) {
				const fb = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: ft, p_status: '' });
				if (!fb.error) {
					const map = new Map<string, number>();
					for (const row of fb.data ?? []) {
						const t = row?.inquiry_type as string | null;
						if (!t || String(t).startsWith('병원_')) continue;
						map.set(t, (map.get(t) ?? 0) + 1);
					}
					const derived = Array.from(map.entries()).map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count })).sort((a, b) => b.ticket_count - a.ticket_count);
					if (derived.length > 0) {
						return NextResponse.json({ items: derived }, { headers: { 'Cache-Control': 'no-store' } });
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
						if (!val) continue;
						counts.set(val, (counts.get(val) ?? 0) + 1);
					}
				}
			}

			// 우선순위: 기간 내 등장값 → 필드 옵션
			const byCount = [...counts.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count }));
			if (byCount.length > 0) {
				return NextResponse.json({ items: byCount }, { headers: { 'Cache-Control': 'no-store' } });
			}
			if (options.length > 0) {
				return NextResponse.json({ items: options.map((v) => ({ inquiry_type: v, ticket_count: 0 })) }, { headers: { 'Cache-Control': 'no-store' } });
			}
		} catch (e: any) {
			// Fall through
		}
	}

	// 3) 최종 빈 결과
	return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
}


