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

export type ZendeskTicket = {
	id: number;
	created_at: string;
	updated_at: string;
	subject?: string | null;
	description?: string | null;
	tags?: string[];
	status?: string | null;
	priority?: string | null;
	via?: { channel?: string } | null;
	requester_id?: number | null;
	organization_id?: number | null;
	custom_fields?: Array<{ id: number; value: any }>;
};

export type ZendeskComment = {
	id: number;
	author_id?: number | null;
	created_at: string;
	body?: string | null;
};

type IncrementalResp = { tickets: ZendeskTicket[]; end_of_stream?: boolean; after_url?: string };

type CommentsResp = { comments: ZendeskComment[]; next_page?: string; end_of_stream?: boolean };

export async function fetchIncrementalTicketsSince(startUnix: number): Promise<ZendeskTicket[]> {
	const base = getBaseUrl();
	const headers = { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } as const;
	let url = `${base}/api/v2/incremental/tickets/cursor.json?start_time=${startUnix}`;
	const results: ZendeskTicket[] = [];
	for (let i = 0; i < 50; i++) {
		const res = await fetch(url, { headers, cache: 'no-store' });
		if (!res.ok) throw new Error(`Zendesk incremental HTTP ${res.status}`);
		const json = (await res.json()) as IncrementalResp;
		results.push(...(json.tickets ?? []));
		if (!json.after_url || json.end_of_stream) break;
		url = json.after_url;
	}
	return results;
}

export async function fetchTicketComments(ticketId: number, limit = 200): Promise<ZendeskComment[]> {
	const base = getBaseUrl();
	const headers = { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } as const;
	let url = `${base}/api/v2/tickets/${ticketId}/comments.json?page[size]=100`;
	const results: ZendeskComment[] = [];
	for (let i = 0; i < 10 && results.length < limit; i++) {
		const res = await fetch(url, { headers, cache: 'no-store' });
		if (!res.ok) throw new Error(`Zendesk comments HTTP ${res.status}`);
		const json = (await res.json()) as CommentsResp;
		results.push(...(json.comments ?? []));
		if (!json.next_page || json.end_of_stream) break;
		url = json.next_page;
	}
	return results.slice(0, limit);
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