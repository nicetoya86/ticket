import { NextResponse } from 'next/server';

export async function GET(req: Request) {
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
        if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === '1' || detail === 'users') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_users_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (detail === 'texts') {
        const { data, error } = await supabaseAdmin.rpc('inquiries_texts_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
        if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
        const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
        return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data, error } = await supabaseAdmin.rpc('unified_inquiries_by_type', { p_from: from, p_to: to, p_field_title: fieldTitle, p_status: status });
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    const items = (data ?? []).filter((r: any) => r?.inquiry_type && !String(r.inquiry_type).startsWith('병원_'));
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}


