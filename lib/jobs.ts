type JobResult = { ok: true } | { ok: false; error: string };

async function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

import { supabaseAdmin } from '@/lib/supabaseServer';
import { fetchIncrementalTicketsSince, fetchTicketComments } from '@/lib/vendors/zendesk';

export async function runIngestIncremental(): Promise<JobResult> {
	try {
		// checkpoint
		const { data: ck } = await supabaseAdmin.from('ingestion_checkpoints').select('*').eq('source', 'zendesk').eq('checkpoint_type', 'timestamp').maybeSingle();
		const startUnix = ck ? Math.floor(new Date(ck.value).getTime() / 1000) : Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

		// fetch
		const tickets = await fetchIncrementalTicketsSince(startUnix);
		// upsert raw tickets
		if (tickets.length > 0) {
			const rows = tickets.map((t) => ({
				id: t.id,
				created_at: t.created_at,
				updated_at: t.updated_at,
				subject: t.subject ?? null,
				description: t.description ?? null,
				requester_id: t.requester_id ?? null,
				org_id: t.organization_id ?? null,
				custom_fields: t.custom_fields ? JSON.stringify(t.custom_fields) : null,
				tags: t.tags ?? null,
				status: t.status ?? null,
				priority: t.priority ?? null,
				channel: t.via?.channel ?? null,
				raw_json: JSON.stringify(t)
			}));
			const { error: e1 } = await supabaseAdmin.from('raw_zendesk_tickets').upsert(rows, { onConflict: 'id' });
			if (e1) throw e1;
		}

		// comments (best-effort, limited)
		for (const t of tickets.slice(0, 50)) {
			const comments = await fetchTicketComments(t.id, 200);
			if (comments.length > 0) {
				const crows = comments.map((c) => ({
					ticket_id: t.id,
					comment_id: c.id,
					author_id: c.author_id ?? null,
					created_at: c.created_at,
					body: c.body ?? null,
					raw_json: JSON.stringify(c)
				}));
				const { error: e2 } = await supabaseAdmin.from('raw_zendesk_comments').upsert(crows, { onConflict: 'ticket_id,comment_id' });
				if (e2) throw e2;
			}
			await sleep(50);
		}

		// unify (simplified mapping: use tags as labels, keep category null)
		const unified = tickets.map((t) => ({
			source: 'zendesk' as const,
			source_id: String(t.id),
			created_at: t.created_at,
			updated_at: t.updated_at,
			title: t.subject ?? null,
			body: t.description ?? null,
			requester: t.requester_id ? String(t.requester_id) : null,
			organization: t.organization_id ? String(t.organization_id) : null,
			labels: t.tags ?? null,
			category_id: null,
			keywords: null
		}));
		if (unified.length > 0) {
			const { error: e3 } = await supabaseAdmin.from('unified_interactions').upsert(unified, { onConflict: 'source,source_id' });
			if (e3) throw e3;
		}

		// checkpoint update
		const newest = tickets.reduce((m, t) => Math.max(m, Date.parse(t.updated_at)), 0);
		if (newest > 0) {
			const { error: e4 } = await supabaseAdmin.from('ingestion_checkpoints').upsert({
				source: 'zendesk',
				checkpoint_type: 'timestamp',
				value: new Date(newest).toISOString()
			});
			if (e4) throw e4;
		}
		return { ok: true };
	} catch (e: any) {
		return { ok: false, error: e.message ?? 'ingest_failed' };
	}
}

export async function runAggregateStats(): Promise<JobResult> {
	try {
		// simple daily rollup from unified_interactions
		const { error } = await supabaseAdmin.rpc('upsert_stats_daily');
		if (error) throw error;
		return { ok: true };
	} catch (e: any) {
		return { ok: false, error: e.message ?? 'aggregate_failed' };
	}
}

export async function runKeywordsPipeline(): Promise<JobResult> {
	// TODO: unified_interactions에서 keywords_daily 집계 구현
	return { ok: true };
}

export async function withRetries(fn: () => Promise<JobResult>, max = 3): Promise<JobResult> {
	let attempt = 0;
	while (attempt < max) {
		const res = await fn();
		if (res.ok) return res;
		attempt += 1;
		await sleep(2 ** attempt * 250);
	}
	return { ok: false, error: 'max_retries_exceeded' };
}
