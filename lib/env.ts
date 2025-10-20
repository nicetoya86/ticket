import { z } from 'zod';

const serverEnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
	SUPABASE_URL: z.string().url(),
	SUPABASE_ANON_KEY: z.string(),
	SUPABASE_SERVICE_ROLE_KEY: z.string(),
	DB_URL: z.string().url().optional(),
	ZENDESK_SUBDOMAIN: z.string().optional(),
	ZENDESK_EMAIL: z.string().optional(),
	ZENDESK_API_TOKEN: z.string().optional(),
	CHANNEL_ACCESS_KEY: z.string().optional(),
	CHANNEL_ACCESS_SECRET: z.string().optional(),
	JWT_SECRET: z.string(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function sanitize<T extends Record<string, any>>(raw: T): T {
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(raw)) {
		out[k] = typeof v === 'string' ? v.trim() : v;
	}
	return out as T;
}

export const env: ServerEnv = (() => {
	const parsed = serverEnvSchema.safeParse(sanitize(process.env as any));
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Environment variables validation failed.\n${issues}`);
	}
	return parsed.data;
})();
