import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
        // 1차: 상태 제한 없이 전체 상태에서 조회 (일부 기간은 closed 기준으로 비어있음)
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', {
            p_from: fromDate,
            p_to: toDate,
            p_field_title: '문의유형(고객)',
            p_status: ''
        });
        if (error) {
            console.error('[keywords/top] RPC inquiries_texts_grouped_by_ticket error:', error.message);
            return NextResponse.json([], { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }
        let rows = (data ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === targetType);
        // Fallback: if no grouped rows, try non-grouped texts
        if (rows.length === 0) {
            // 2차: closed 한정으로 다시 시도(그룹형만 사용해 발화자 구분을 보장)
            const retry = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', {
                p_from: fromDate,
                p_to: toDate,
                p_field_title: '문의유형(고객)',
                p_status: 'closed'
            });
            if (!retry.error) {
                rows = (retry.data ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === targetType);
            }
        }
        // Extract only customer-authored text from aggregated blocks (robust speaker-aware)
        function extractCustomerText(block: string): string {
            const lines = String(block ?? '').split('\n');
            const isBotName = (name: string) => /(여신BOT|\bBOT\b)/i.test(name);
            // 상담사 표기 또는 한글 2~4글자 단일 이름은 에이전트로 간주 (예: 조수민)
            const isAgentName = (name: string) => /(매니저|Manager|관리자|Agent|상담사)/i.test(name) || /^[가-힣]{2,4}$/.test(name);
            const isUserName = (name: string) => /(iOS|Android|Web)\s*User|End[\s-]*user|Visitor|고객|사용자|유저|손님/i.test(name);
            let current: 'customer' | 'agent' | 'bot' | null = null;
            const out: string[] = [];
            for (const raw of lines) {
                const line = String(raw ?? '');
                const m = line.match(/^\s*(?:\(\d{1,2}:\d{2}:\d{2}\)\s*)?([^:]+):\s*(.*)$/);
                if (m) {
                    const name = m[1].trim();
                    const text = m[2];
                    if (isBotName(name)) { current = 'bot'; continue; }
                    if (isAgentName(name)) { current = 'agent'; continue; }
                    // 명시적 사용자 패턴만 고객으로 인정, 그 외 모호한 이름은 에이전트로 간주
                    if (isUserName(name)) { current = 'customer'; } else { current = 'agent'; continue; }
                    out.push(text);
                    continue;
                }
                if (current === 'customer') out.push(line);
            }
            return out.join('\n');
        }
        const blocks: string[] = rows.map((r: any) => String(r.text_value ?? ''));
        // 접두사(이름:)가 한 줄이라도 존재하면 스피커 인식 파서를 사용
        const hasSpeakerPrefixes = blocks.some((b) => /^[^:\n]+:/m.test(b));
        const customerText = hasSpeakerPrefixes
            ? blocks.map((b) => extractCustomerText(b)).join('\n')
            : '';
        // Prefer GPT-based keyword extraction when available
        const textForLLM = customerText.slice(0, 12000); // guard tokens
        if (env.OPENAI_API_KEY && textForLLM.trim().length > 0) {
            try {
                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: '당신은 한국어 고객 상담 텍스트에서 핵심 키워드를 추출하는 데이터 분석가입니다.' },
                            { role: 'user', content: [
                                { type: 'text', text: `다음 고객 텍스트에서 의미 있는 키워드 상위 ${Math.min(limit, 10)}개를 추출하세요.
요구사항:
- 한국어 형태소 기준으로 의미 있는 단어/구를 선정
- 브랜드명/운영체제/플랫폼 일반 용어(iOS, Android 등)와 조사/어미/숫자/URL 제거
- 각 키워드에 중요도 점수를 0~1 사이로 부여
- JSON 배열로만 응답: [{"keyword":"...","score":0.XX}]
텍스트:
${textForLLM}` }
                            ] }
                        ],
                        temperature: 0.2
                    })
                });
                if (resp.ok) {
                    const j = await resp.json();
                    const content = j?.choices?.[0]?.message?.content ?? '';
                    // try parse json from content
                    const match = content.match(/\[[\s\S]*\]/);
                    if (match) {
                        const parsed = JSON.parse(match[0]) as { keyword: string; score?: number }[];
                        const items = parsed
                            .filter((x) => typeof x?.keyword === 'string' && x.keyword.trim())
                            .slice(0, Math.min(limit, 10))
                            .map((x) => ({ keyword: x.keyword.trim(), tfidf: Math.round(((x.score ?? 0) * 1000)) / 1000 }));
                        if (items.length > 0) return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
                    }
                }
            } catch (e) {
                console.error('[keywords/top] OpenAI error', (e as any)?.message ?? e);
            }
        }
        // Fallback: rule-based token frequency
        const cleaned = customerText
            .replace(/https?:\/\/\S+/g, ' ')
            .replace(/[\p{P}\p{S}]+/gu, ' ')
            .toLowerCase();
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        const stop = new Set<string>([
            '및','그리고','에서','으로','으로는','에','은','는','이','가','을','를','도','만','과','와','요','게','좀','좀요','이나','나','으로의','으로도',
            'ios','android','user','iosuser','androiduser'
        ]);
        const freq = new Map<string, number>();
        for (const tok of tokens) {
            if (tok.length < 2) continue;
            if (/^\d+$/.test(tok)) continue;
            if (stop.has(tok)) continue;
            freq.set(tok, (freq.get(tok) ?? 0) + 1);
        }
        const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(limit, 10)).map(([keyword, freq]) => ({ keyword, freq }));
        return NextResponse.json(top, { headers: { 'Cache-Control': 'no-store' } });
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
    if (error) {
        console.error('[keywords/top] keywords_daily query error:', error.message);
        return NextResponse.json([], { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    const scoreKey = metric === 'freq' ? 'freq' : 'tfidf';
    const agg = new Map<string, { keyword: string; freq: number; tfidf: number }>();
    for (const row of data ?? []) {
        const cur = agg.get(row.keyword) ?? { keyword: row.keyword, freq: 0, tfidf: 0 };
        cur.freq += row.freq ?? 0;
        cur.tfidf += (row.tfidf ?? 0);
        agg.set(row.keyword, cur);
    }
    const sorted = [...agg.values()].sort((a, b) => (b as any)[scoreKey] - (a as any)[scoreKey]).slice(0, limit);
    return NextResponse.json(sorted, { headers: { 'Cache-Control': 'no-store' } });
}
