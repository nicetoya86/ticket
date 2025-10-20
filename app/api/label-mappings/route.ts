import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const source = searchParams.get('source') as 'zendesk' | 'channel' | null;
	let query = supabaseAdmin.from('label_mappings').select('*');
	if (source) query = query.eq('source', source);
	const { data, error } = await query;
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data);
}

export async function POST(req: Request) {
	const { source, label, categoryId, confidence } = await req.json();
	if (!source || !label || !categoryId)
		return NextResponse.json({ error: 'source, label, categoryId are required' }, { status: 400 });
	const { error } = await supabaseAdmin.from('label_mappings').insert({
		source,
		label,
		category_id: categoryId,
		confidence: typeof confidence === 'number' ? confidence : 1.0,
	});
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true }, { status: 201 });
}
