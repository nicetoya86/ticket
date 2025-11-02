import { NextResponse } from 'next/server';

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
    const group = searchParams.get('group') === '1' || searchParams.get('group') === 'true';
    const detail = searchParams.get('detail') ?? '';

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

    if (group || detail === 'texts') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'grouped_texts_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        let items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        // texts-specific filters
        items = items
            .map((r: any) => ({ ...r, text_value: cleanText(String(r.text_value ?? '')) }))
            .filter((r: any) => !isPhoneCall(String(r.text_value ?? '')) && String(r.text_value ?? '').trim().length > 0);
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === '1' || detail === 'users') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_users_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'users_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === 'texts') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'texts_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        let items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        // compute exclusion set by ticket_id if any row indicates phone call classification, and drop empty rows
        const cleaned = items.map((r: any) => ({ ...r, text_value: cleanText(String(r.text_value ?? '')) }));
        const excludeTickets = new Set<number>();
        for (const r of cleaned) {
            if (isPhoneCall(String(r.text_value ?? ''))) excludeTickets.add(Number(r.ticket_id));
        }
        items = cleaned.filter((r: any) => !excludeTickets.has(Number(r.ticket_id)) && String(r.text_value ?? '').trim().length > 0);
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data, error } = await supabaseAdmin.rpc('unified_inquiries_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
    let items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
    if (error || items.length === 0) {
        // Fallback: derive counts from grouped texts
        const fb = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (!fb.error) {
            const map = new Map<string, number>();
            for (const row of fb.data ?? []) {
                const t = row?.inquiry_type as string | null;
                if (!t || String(t).startsWith('병원_')) continue;
                map.set(t, (map.get(t) ?? 0) + 1);
            }
            items = Array.from(map.entries()).map(([inquiry_type, ticket_count]) => ({ inquiry_type, ticket_count })).sort((a, b) => b.ticket_count - a.ticket_count);
        }
    }
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}


