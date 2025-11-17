export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { runIngestIncremental, runAggregateStats } from '@/lib/jobs';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET() {
    const envPresence = {
        ZENDESK_SUBDOMAIN: Boolean(process.env.ZENDESK_SUBDOMAIN),
        ZENDESK_EMAIL: Boolean(process.env.ZENDESK_EMAIL),
        ZENDESK_API_TOKEN: Boolean(process.env.ZENDESK_API_TOKEN),
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    };

    try {
        // Quick Supabase connectivity sanity check
        const { error: pingError } = await supabaseAdmin.from('categories').select('category_id').limit(1);
        if (pingError) {
            return NextResponse.json({ ok: false, stage: 'supabase', error: pingError.message, envPresence }, { status: 500 });
        }

        // Run ingestion once without retries to expose the immediate cause
        const a = await runIngestIncremental();
        if (!a.ok) return NextResponse.json({ ok: false, stage: 'ingest', error: a.error, envPresence }, { status: 500 });

        const b = await runAggregateStats();
        if (!b.ok) return NextResponse.json({ ok: false, stage: 'aggregate', error: b.error, envPresence }, { status: 500 });

        return NextResponse.json({ ok: true, debug: true, envPresence });
    } catch (e: any) {
        const msg = e?.message ?? String(e ?? 'unknown_error');
        return NextResponse.json({ ok: false, stage: 'unhandled', error: msg, envPresence }, { status: 500 });
    }
}


