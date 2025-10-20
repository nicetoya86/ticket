import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET() {
	const { data, error } = await supabaseAdmin.from('stopwords').select('*');
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data);
}

export async function POST(req: Request) {
	const { locale, token } = await req.json();
	if (!locale || !token) return NextResponse.json({ error: 'locale, token required' }, { status: 400 });
	const { error } = await supabaseAdmin.from('stopwords').insert({ locale, token });
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true }, { status: 201 });
}
