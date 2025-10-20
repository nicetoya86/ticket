import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET() {
	const { data, error } = await supabaseAdmin.from('categories').select('*').order('sort_order', { ascending: true });
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data);
}

export async function POST(req: Request) {
	const body = await req.json();
	const { name, parentId, sortOrder } = body ?? {};
	if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
	const categoryId = (body?.categoryId as string | undefined) ?? name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9가-힣]+/g, '-')
		.toLowerCase();

	const { error } = await supabaseAdmin.from('categories').insert({
		category_id: categoryId,
		name,
		parent_id: parentId ?? null,
		sort_order: sortOrder ?? 0,
	});
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ categoryId }, { status: 201 });
}
