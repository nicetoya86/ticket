export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { withRetries, runSyncZendeskFields } from '@/lib/jobs';

export async function GET() {
    const res = await withRetries(() => runSyncZendeskFields(), 3);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    return NextResponse.json({ ok: true });
}

export async function POST() {
    return GET();
}


