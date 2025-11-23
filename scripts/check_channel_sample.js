import 'dotenv/config';

async function main() {
	const url = `${process.env.SUPABASE_URL}/rest/v1/raw_channel_conversations?select=id,created_at,tags,status&limit=5`;
	const res = await fetch(url, {
		headers: {
			apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
			Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
		},
	});
	console.log(res.status, await res.text());
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

