export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { withRetries, runIngestIncremental, runAggregateStats } from '@/lib/jobs';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const debug = url.searchParams.get('debug');
    if (debug === '1' || debug === 'true') {
        // Run once without retries to expose immediate error
        const a = await runIngestIncremental();
        if (!a.ok) return NextResponse.json({ ok: false, stage: 'ingest', error: a.error, envPresence: {
            ZENDESK_SUBDOMAIN: Boolean(process.env.ZENDESK_SUBDOMAIN),
            ZENDESK_EMAIL: Boolean(process.env.ZENDESK_EMAIL),
            ZENDESK_API_TOKEN: Boolean(process.env.ZENDESK_API_TOKEN)
        } }, { status: 500 });
        const b = await runAggregateStats();
        if (!b.ok) return NextResponse.json({ ok: false, stage: 'aggregate', error: b.error }, { status: 500 });
        return NextResponse.json({ ok: true, debug: true });
    }

    const res = await withRetries(async () => {
        const a = await runIngestIncremental();
        if (!a.ok) return a;
        const b = await runAggregateStats();
        return b;
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
    return GET(req);
}
