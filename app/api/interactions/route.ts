import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const sources = searchParams.getAll('source[]');
	const categoryIds = searchParams.getAll('categoryId[]');
	const q = searchParams.get('q');
	const exclude = searchParams.getAll('exclude[]');
	const page = Number(searchParams.get('page') ?? 1);
	const pageSize = Math.max(1, Math.min(200, Number(searchParams.get('pageSize') ?? 50)));

	let query = supabaseAdmin
		.from('unified_interactions')
		.select('*', { count: 'exact' })
		.order('created_at', { ascending: false });

	if (from) query = query.gte('created_at', from);
	if (to) query = query.lte('created_at', to);
	if (sources.length > 0) query = query.in('source', sources);
	if (categoryIds.length > 0) query = query.in('category_id', categoryIds);
	if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
	if (exclude.length > 0) query = query.not('keywords', 'cs', `{${exclude.join(',')}}`);

	const fromIdx = (page - 1) * pageSize;
	const toIdx = fromIdx + pageSize - 1;
	const { data, count, error } = await query.range(fromIdx, toIdx);
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ items: data, total: count ?? 0 });
}
