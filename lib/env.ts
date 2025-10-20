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

export const env: ServerEnv = (() => {
	const parsed = serverEnvSchema.safeParse(process.env);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Environment variables validation failed.\n${issues}`);
	}
	return parsed.data;
})();
