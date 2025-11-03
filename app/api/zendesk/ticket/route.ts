import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id') ?? '0');
    const include = searchParams.get('include') ?? 'comments';
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (!env.ZENDESK_SUBDOMAIN || !env.ZENDESK_EMAIL || !env.ZENDESK_API_TOKEN) {
        return NextResponse.json({ error: 'Zendesk env missing' }, { status: 200 });
    }

    const base = `https://${env.ZENDESK_SUBDOMAIN}.zendesk.com`;
    const authRaw = `${env.ZENDESK_EMAIL}/token:${env.ZENDESK_API_TOKEN}`;
    const headers = {
        Authorization: `Basic ${Buffer.from(authRaw).toString('base64')}`,
        'Content-Type': 'application/json',
    } as const;

    const [ticketRes, commentsRes] = await Promise.all([
        fetch(`${base}/api/v2/tickets/${id}.json`, { headers, cache: 'no-store' }),
        include.includes('comments')
            ? fetch(`${base}/api/v2/tickets/${id}/comments.json?page[size]=100`, { headers, cache: 'no-store' })
            : Promise.resolve(new Response(JSON.stringify({ comments: [] }), { status: 200 }))
    ]);

    if (!ticketRes.ok) return NextResponse.json({ error: `ticket HTTP ${ticketRes.status}` }, { status: 500 });
    const ticketJson = await ticketRes.json();
    let commentsJson: any = { comments: [] };
    if (commentsRes.ok) commentsJson = await commentsRes.json();

    return NextResponse.json({ ticket: ticketJson?.ticket ?? ticketJson, comments: commentsJson?.comments ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}


