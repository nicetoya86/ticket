import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const inquiryType = searchParams.get('inquiryType');
    const limit = Number(searchParams.get('limit') ?? 15);

    if (!inquiryType) return NextResponse.json([], { status: 200 });

    const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const toDate = to ?? new Date().toISOString().slice(0, 10);

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

    // 1) grouped texts without status restriction
    const g1 = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', {
        p_from: fromDate,
        p_to: toDate,
        p_field_title: '문의유형(고객)',
        p_status: ''
    });
    if (g1.error) return NextResponse.json({ error: g1.error.message }, { status: 500 });
    let rows: any[] = (g1.data ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === targetType);
    if (rows.length === 0) {
        const g2 = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', {
            p_from: fromDate,
            p_to: toDate,
            p_field_title: '문의유형(고객)',
            p_status: 'closed'
        });
        if (!g2.error) rows = (g2.data ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === targetType);
    }

    // Extract customer-only text
    function extractCustomerText(block: string): string {
        const lines = String(block ?? '').split('\n');
        const isBotName = (name: string) => /(여신BOT|\bBOT\b)/i.test(name);
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
                if (isUserName(name)) { current = 'customer'; } else { current = 'agent'; continue; }
                out.push(text);
                continue;
            }
            if (current === 'customer') out.push(line);
        }
        return out.join('\n');
    }

    const customerText = rows.map((r: any) => extractCustomerText(String(r.text_value ?? ''))).join('\n');
    if (!customerText.trim()) return NextResponse.json([]);

    // Tokenize and build phrases (bigrams/trigrams) + frequent lines
    const cleaned = customerText
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[\p{P}\p{S}]+/gu, ' ')
        .replace(/[\t ]+/g, ' ')
        .trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const stop = new Set<string>(['및','그리고','에서','으로','에','은','는','이','가','을','를','도','만','과','와','요','게','좀','이나','나','으로의','으로도','합니다','해주세요','같아요']);

    const phrases = new Map<string, number>();
    function addPhrase(p: string) {
        const phrase = p.trim();
        if (phrase.length < 4) return;
        if (/^\d+$/.test(phrase)) return;
        // drop phrases with only stopwords
        const parts = phrase.split(' ');
        if (parts.every((w) => stop.has(w))) return;
        phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
    }

    for (let i = 0; i < tokens.length; i++) {
        const t1 = tokens[i];
        if (!t1 || stop.has(t1) || t1.length < 2) continue;
        if (i + 1 < tokens.length) {
            const t2 = tokens[i + 1];
            if (t2 && t2.length >= 2 && !(stop.has(t1) && stop.has(t2))) addPhrase(`${t1} ${t2}`);
        }
        if (i + 2 < tokens.length) {
            const t2 = tokens[i + 1];
            const t3 = tokens[i + 2];
            if (t2 && t3 && t2.length >= 2 && t3.length >= 2) addPhrase(`${t1} ${t2} ${t3}`);
        }
    }

    // Also count frequent lines (exact repeats)
    for (const rawLine of customerText.split('\n')) {
        const line = rawLine.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/[\t ]+/g, ' ').trim();
        if (line.length >= 6) addPhrase(line);
    }

    const top = [...phrases.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(50, limit)).map(([phrase, freq]) => ({ phrase, freq }));
    return NextResponse.json(top);
}


