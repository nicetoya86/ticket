import { z } from 'zod';

const serverEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    // Derived from SUPABASE_PROJECT_ID if not explicitly provided
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_PROJECT_ID: z.string().optional(),
    SUPABASE_ANON_KEY: z.string(),
    SUPABASE_SERVICE_ROLE_KEY: z.string(),
    DB_URL: z.string().url().optional(),
    ZENDESK_SUBDOMAIN: z.string().optional(),
    ZENDESK_EMAIL: z.string().optional(),
    ZENDESK_API_TOKEN: z.string().optional(),
    CHANNEL_ACCESS_KEY: z.string().optional(),
    CHANNEL_ACCESS_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    // Optional tuning for Zendesk comments ingestion
    ZENDESK_COMMENTS_TICKET_LIMIT: z.string().optional(),
    ZENDESK_COMMENTS_PER_TICKET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function stripQuotes(v: string): string {
	const t = v.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
		return t.slice(1, -1).trim();
	}
	return t;
}

function sanitize<T extends Record<string, any>>(raw: T): T {
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(raw)) {
		out[k] = typeof v === 'string' ? stripQuotes(v) : v;
	}
	return out as T;
}

export const env: ServerEnv = (() => {
	const raw = sanitize(process.env as any) as Record<string, any>;

    // If SUPABASE_URL is missing but SUPABASE_PROJECT_ID is provided, derive the URL.
    if (!raw.SUPABASE_URL && typeof raw.SUPABASE_PROJECT_ID === 'string' && raw.SUPABASE_PROJECT_ID.trim()) {
        raw.SUPABASE_URL = `https://${raw.SUPABASE_PROJECT_ID}.supabase.co`;
    }
    // Provide a fallback JWT secret in case it's not set in hosting env (used only for non-auth features)
    if (!raw.JWT_SECRET) {
        raw.JWT_SECRET = 'fallback-secret-not-for-auth';
    }

	const parsed = serverEnvSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Environment variables validation failed.\n${issues}`);
	}

	const data = parsed.data;

	// Optional safety check: if SUPABASE_PROJECT_ID is set, ensure URL host ref matches it,
	// and also validate that provided keys belong to the same project when possible.
	const urlProjectRef = (() => {
		try {
			const u = new URL(data.SUPABASE_URL);
			return u.host.split('.')[0] || null;
		} catch {
			return null;
		}
	})();

	if (data.SUPABASE_PROJECT_ID && urlProjectRef && data.SUPABASE_PROJECT_ID !== urlProjectRef) {
		throw new Error(`SUPABASE_URL host ref (${urlProjectRef}) does not match SUPABASE_PROJECT_ID (${data.SUPABASE_PROJECT_ID}).`);
	}

	function extractRef(jwt: string | undefined | null): string | null {
		try {
			if (!jwt) return null;
			const parts = jwt.split('.');
			if (parts.length < 2) return null;
			const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as any;
			return typeof payload?.ref === 'string' ? payload.ref : null;
		} catch {
			return null;
		}
	}

    // In production hosting environments, strict cross-validation can be problematic if not all vars are set.
    // Run strict checks only in development to avoid crashing API routes at runtime.
    if (data.NODE_ENV !== 'production' && data.SUPABASE_PROJECT_ID) {
		const anonRef = extractRef(data.SUPABASE_ANON_KEY);
		const serviceRef = extractRef(data.SUPABASE_SERVICE_ROLE_KEY);
		const mismatches: string[] = [];
		if (anonRef && anonRef !== data.SUPABASE_PROJECT_ID) mismatches.push(`ANON_KEY→${anonRef}`);
		if (serviceRef && serviceRef !== data.SUPABASE_PROJECT_ID) mismatches.push(`SERVICE_ROLE_KEY→${serviceRef}`);
		if (urlProjectRef && urlProjectRef !== data.SUPABASE_PROJECT_ID) mismatches.push(`URL→${urlProjectRef}`);
		if (mismatches.length > 0) {
			throw new Error(`Supabase configuration mismatch. Expected ${data.SUPABASE_PROJECT_ID}, got: ${mismatches.join(', ')}.`);
		}
	}

	return data;
})();
