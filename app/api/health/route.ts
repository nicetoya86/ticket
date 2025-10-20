import { NextResponse } from 'next/server';
import { supabasePublic, supabaseAdmin } from '@/lib/supabaseServer';
import { env } from '@/lib/env';

function extractRef(jwt: string | undefined | null) {
	try {
		if (!jwt) return null;
		const parts = jwt.split('.');
		if (parts.length < 2) return null;
		const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as any;
		return { ref: payload?.ref ?? null, role: payload?.role ?? null };
	} catch {
		return null;
	}
}

export async function GET() {
	const urlRef = (() => {
		try {
			const u = new URL(env.SUPABASE_URL);
			return u.host.split('.')[0];
		} catch {
			return null;
		}
	})();

	const anonMeta = extractRef(env.SUPABASE_ANON_KEY);
	const serviceMeta = extractRef(env.SUPABASE_SERVICE_ROLE_KEY);

	const pubPing = await supabasePublic.from('categories').select('category_id').limit(1);
	const adminPing = await supabaseAdmin.from('categories').select('category_id').limit(1);

	return NextResponse.json({
		status: pubPing.error && adminPing.error ? 'error' : 'ok',
		public: { ok: !pubPing.error, error: pubPing.error?.message ?? null },
		admin: { ok: !adminPing.error, error: adminPing.error?.message ?? null },
		projectRefFromUrl: urlRef,
		projectRefFromAnon: anonMeta,
		projectRefFromService: serviceMeta,
		envPresence: {
			SUPABASE_URL: Boolean(env.SUPABASE_URL),
			SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY),
			SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
		}
	});
}
