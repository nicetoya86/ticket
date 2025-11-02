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

    if (group || detail === 'texts') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'grouped_texts_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === '1' || detail === 'users') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_users_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'users_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === 'texts') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ items: [], note: 'texts_error', message: error.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
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


