import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const sources = searchParams.getAll('source[]');
	const categoryIds = searchParams.getAll('categoryId[]');
	const metric = searchParams.get('metric') ?? 'tfidf';
	const limit = Number(searchParams.get('limit') ?? 50);

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);

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
