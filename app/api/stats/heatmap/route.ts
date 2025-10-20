import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const sources = searchParams.getAll('source[]');

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);
	const sourceParam = sources.join(',');

	const { data, error } = await supabasePublic.rpc('unified_interactions_heatmap', {
		p_from: fromDate,
		p_to: toDate,
		p_sources: sourceParam
	});
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data ?? []);
}
