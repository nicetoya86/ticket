import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabaseServer';
import { env } from '@/lib/env';

function extractRefFromAnon(anon: string | undefined) {
	try {
		if (!anon) return null;
		const parts = anon.split('.');
		if (parts.length < 2) return null;
		const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as any;
		return payload?.ref ?? null;
	} catch {
		return null;
	}
}

export async function GET() {
	const urlHost = (() => {
		try {
			const u = new URL(env.SUPABASE_URL);
			return u.host.split('.')[0];
		} catch {
			return null;
		}
	})();
	const keyRef = extractRefFromAnon(env.SUPABASE_ANON_KEY);

	const ping = await supabasePublic.from('categories').select('category_id').limit(1);
	const ok = !ping.error;
	return NextResponse.json({
		status: ok ? 'ok' : 'error',
		message: ping.error?.message ?? 'healthy',
		projectRefFromUrl: urlHost,
		projectRefFromKey: keyRef,
		envPresence: {
			SUPABASE_URL: Boolean(env.SUPABASE_URL),
			SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY),
		}
	});
}
