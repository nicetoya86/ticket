import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const sources = searchParams.getAll('source[]');

	// 기본: 최근 30일
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
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	// byCategory는 샘플: 최근일 기준 집계
	const { data: byCategory, error: e2 } = await supabaseAdmin
		.from('stats_daily')
		.select('category_id, count')
		.eq('date', toDate)
		.order('count', { ascending: false })
		.limit(50);
	if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

	return NextResponse.json({ totals, byCategory });
}
