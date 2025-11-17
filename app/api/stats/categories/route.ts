import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const sources = searchParams.getAll('source[]');
	const categoryIds = searchParams.getAll('categoryId[]');

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);

	let query = supabaseAdmin
		.from('stats_daily')
		.select('category_id, count, source, date')
		.gte('date', fromDate)
		.lte('date', toDate);
	if (sources.length > 0) query = query.in('source', sources);
	if (categoryIds.length > 0) query = query.in('category_id', categoryIds);

	const { data, error } = await query.limit(5000);
	if (error) {
		console.error('[stats/categories] Supabase query error:', error.message);
		return NextResponse.json([], { status: 200, headers: { 'Cache-Control': 'no-store' } });
	}

	const agg = new Map<string, { categoryId: string; count: number; wow: number | null; yoy: number | null }>();
	for (const row of data ?? []) {
		const id = row.category_id ?? 'uncategorized';
		const cur = agg.get(id) ?? { categoryId: id, count: 0, wow: null, yoy: null };
		cur.count += Number(row.count ?? 0);
		agg.set(id, cur);
	}

	const items = [...agg.values()].sort((a, b) => b.count - a.count);
	return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
}
