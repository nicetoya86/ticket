import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const sources = searchParams.getAll('source[]');

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);

	let query = supabaseAdmin
		.from('stats_daily')
		.select('date, count')
		.gte('date', fromDate)
		.lte('date', toDate)
		.order('date', { ascending: true });
	if (sources.length > 0) query = query.in('source', sources);
	const { data: totals, error } = await query;
	if (error) {
		console.error('[stats/overview] Supabase totals error:', error.message);
		return NextResponse.json({ totals: [], byCategory: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
	}

	const { data: byCategory, error: e2 } = await supabaseAdmin
		.from('stats_daily')
		.select('category_id, count')
		.eq('date', toDate)
		.order('count', { ascending: false })
		.limit(50);
	if (e2) {
		console.error('[stats/overview] Supabase byCategory error:', e2.message);
		return NextResponse.json({ totals: totals ?? [], byCategory: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
	}

	return NextResponse.json({ totals, byCategory }, { headers: { 'Cache-Control': 'no-store' } });
}
