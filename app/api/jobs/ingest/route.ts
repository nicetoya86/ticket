export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { withRetries, runIngestIncremental, runAggregateStats } from '@/lib/jobs';

export async function GET() {
	const res = await withRetries(async () => {
		const a = await runIngestIncremental();
		if (!a.ok) return a;
		const b = await runAggregateStats();
		return b;
	});
	if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
	return NextResponse.json({ ok: true });
}

export async function POST() {
	return GET();
}
