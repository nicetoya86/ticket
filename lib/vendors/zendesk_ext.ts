import { env } from '@/lib/env';

function getBaseUrl(): string {
	if (!env.ZENDESK_SUBDOMAIN) throw new Error('ZENDESK_SUBDOMAIN missing');
	return `https://${env.ZENDESK_SUBDOMAIN}.zendesk.com`;
}

function getAuthHeader(): string {
	if (!env.ZENDESK_EMAIL || !env.ZENDESK_API_TOKEN) throw new Error('ZENDESK_EMAIL or ZENDESK_API_TOKEN missing');
	const raw = `${env.ZENDESK_EMAIL}/token:${env.ZENDESK_API_TOKEN}`;
	const b64 = Buffer.from(raw).toString('base64');
	return `Basic ${b64}`;
}

export async function fetchTicketFields(): Promise<any[]> {
	const base = getBaseUrl();
	const headers = { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } as const;
	const url = `${base}/api/v2/ticket_fields.json`;
	const res = await fetch(url, { headers, cache: 'no-store' });
	if (!res.ok) throw new Error(`Zendesk ticket_fields HTTP ${res.status}`);
	const json = (await res.json()) as { ticket_fields?: any[] };
	return json.ticket_fields ?? [];
}

export async function fetchIncrementalTickets(from: string, to: string): Promise<any[]> {
	const base = getBaseUrl();
	const headers = { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } as const;
	const startUnix = Math.floor(new Date(from).getTime() / 1000);
	let url = `${base}/api/v2/incremental/tickets/cursor.json?start_time=${startUnix}`;
	const results: any[] = [];
	for (let i = 0; i < 50; i++) {
		const res = await fetch(url, { headers, cache: 'no-store' });
		if (!res.ok) throw new Error(`Zendesk incremental HTTP ${res.status}`);
		const json = await res.json();
		const page = (json?.tickets ?? []) as any[];
		results.push(...page);
		if (!json?.after_url || json?.end_of_stream) break;
		const nextCreated = page.length > 0 ? Date.parse(page[page.length - 1]?.updated_at ?? page[page.length - 1]?.created_at) : 0;
		if (nextCreated > 0 && nextCreated > new Date(to).getTime()) break;
		url = json.after_url;
	}
	// 최종 상한선으로 to를 적용
	const toMs = new Date(to).getTime();
	return results.filter((t) => Date.parse(t?.created_at) <= toMs);
}


