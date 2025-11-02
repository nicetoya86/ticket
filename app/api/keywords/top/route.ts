import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
    const sources = searchParams.getAll('source[]');
    const categoryIds = searchParams.getAll('categoryId[]');
    const inquiryType = searchParams.get('inquiryType');
	const metric = searchParams.get('metric') ?? 'tfidf';
	const limit = Number(searchParams.get('limit') ?? 50);

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);

    // Branch 1: On-demand keywords for selected inquiry type from customer texts only
    if (inquiryType) {
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
        const targetType = normalizeType(inquiryType);
        // Fetch grouped texts and derive keywords client-side to honor latest bot/manager filters
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', {
            p_from: fromDate,
            p_to: toDate,
            p_field_title: '문의유형(고객)',
            p_status: 'closed'
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const rows = (data ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === targetType);
        // Extract only customer-authored text from aggregated blocks where speaker prefix appears
        function extractCustomerText(block: string): string {
            const lines = String(block ?? '').split('\n');
            let speaker: 'customer' | 'agent' | 'bot' | null = null;
            const kept: string[] = [];
            for (const raw of lines) {
                const line: string = raw ?? '';
                if (/^고객:\s*/.test(line)) {
                    speaker = 'customer';
                    kept.push(line.replace(/^고객:\s*/, ''));
                    continue;
                }
                if (/^매니저:\s*/.test(line)) { speaker = 'agent'; continue; }
                if (/^여신BOT:\s*/i.test(line)) { speaker = 'bot'; continue; }
                if (speaker === 'customer') kept.push(line);
            }
            return kept.join('\n');
        }

        const customerText = rows
            .map((r: any) => extractCustomerText(String(r.text_value ?? '')))
            .join('\n');
        // Tokenize and aggregate
        const cleaned = customerText
            .replace(/https?:\/\/\S+/g, ' ')
            .replace(/[\p{P}\p{S}]+/gu, ' ')
            .toLowerCase();
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        const stop = new Set<string>(['및','그리고','에서','으로','으로는','에','은','는','이','가','을','를','도','만','과','와','요','게','좀','좀요','이나','나','으로의','으로도']);
        const freq = new Map<string, number>();
        for (const tok of tokens) {
            if (tok.length < 2) continue;
            if (/^\d+$/.test(tok)) continue;
            if (stop.has(tok)) continue;
            freq.set(tok, (freq.get(tok) ?? 0) + 1);
        }
        const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(limit, 10)).map(([keyword, freq]) => ({ keyword, freq }));
        return NextResponse.json(top);
    }

    // Branch 2: legacy aggregated keywords table (fallback)
    let query = supabaseAdmin
        .from('keywords_daily')
        .select('keyword, freq, tfidf')
        .gte('date', fromDate)
        .lte('date', toDate);
    if (sources.length > 0) query = query.in('source', sources);
    if (categoryIds.length > 0) query = query.in('category_id', categoryIds);

    const { data, error } = await query.limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const scoreKey = metric === 'freq' ? 'freq' : 'tfidf';
    const agg = new Map<string, { keyword: string; freq: number; tfidf: number }>();
    for (const row of data ?? []) {
        const cur = agg.get(row.keyword) ?? { keyword: row.keyword, freq: 0, tfidf: 0 };
        cur.freq += row.freq ?? 0;
        cur.tfidf += (row.tfidf ?? 0);
        agg.set(row.keyword, cur);
    }
    const sorted = [...agg.values()].sort((a, b) => (b as any)[scoreKey] - (a as any)[scoreKey]).slice(0, limit);
    return NextResponse.json(sorted);
}
