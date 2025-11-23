import 'dotenv/config';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error('환경 변수가 비어 있습니다.');
	process.exit(1);
}

const start = process.argv[2];
const end = process.argv[3];

if (!start || !end) {
	console.error('사용법: node scripts/check_channel_range.js 2025-10-01 2025-10-02');
	process.exit(1);
}

const url = new URL(`${SUPABASE_URL}/rest/v1/raw_channel_conversations`);
url.searchParams.set('created_at', `gte.${start}T00:00:00Z`);
url.searchParams.append('created_at', `lt.${end}T00:00:00Z`);
url.searchParams.set('select', 'id,created_at');
url.searchParams.set('limit', '5');

const res = await fetch(url, {
	headers: {
		apikey: SUPABASE_SERVICE_ROLE_KEY,
		Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
	},
});

if (!res.ok) {
	console.error('요청 실패', await res.text());
	process.exit(1);
}

const data = await res.json();
console.log(data);

