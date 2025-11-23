import 'dotenv/config';
import fetch from 'node-fetch';
import { Pool } from 'pg';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');

function formatDate(date) {
	return date.toISOString().slice(0, 10);
}

function buildDateRanges() {
	const today = new Date();
	const oneYearAgo = new Date(today);
	oneYearAgo.setFullYear(today.getFullYear() - 1);

	const ranges = [];
	let cursor = new Date(oneYearAgo);

	while (cursor <= today) {
		const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
		const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
		if (start < oneYearAgo) start.setTime(oneYearAgo.getTime());
		if (end > today) end.setTime(today.getTime());
		ranges.push([formatDate(start), formatDate(end)]);
		cursor.setMonth(cursor.getMonth() + 1);
	}
	return ranges;
}

const DATE_RANGES = buildDateRanges();
const pool = new Pool({
	connectionString: process.env.SUPABASE_DB_URL || `postgresql://${process.env.SUPABASE_DB_USER}:${encodeURIComponent(process.env.SUPABASE_DB_PASS)}@${process.env.SUPABASE_DB_HOST}:${process.env.SUPABASE_DB_PORT}/${process.env.SUPABASE_DB_NAME}?options=project%3D${process.env.SUPABASE_PROJECT_ID}`,
	ssl: { rejectUnauthorized: false },
});

async function fetchJson(url, params = {}) {
	const res = await fetch(url, {
		...params,
		headers: {
			'Content-Type': 'application/json',
			'X-Access-Key': process.env.CHANNEL_ACCESS_KEY,
			'X-Access-Secret': process.env.CHANNEL_ACCESS_SECRET,
			...(params.headers || {}),
		},
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
	return res.json();
}

async function backfillRange(from, to) {
	console.log(`▶ ${from} ~ ${to}`);
	let cursor = '';
	const client = await pool.connect();
	try {
		for (let page = 0; page < 200; page++) {
			const qs = new URLSearchParams({
				limit: '200',
				cursor,
				startDate: from,
				endDate: to,
				createdAtFrom: `${from}T00:00:00+09:00`,
				createdAtTo: `${to}T23:59:59+09:00`,
			});
			const json = await fetchJson(`https://api.channel.io/open/v5/user-chats?${qs}`);
			const chats = json.userChats ?? [];
			for (const chat of chats) {
				await client.query(
					`insert into raw_channel_conversations
             (id, created_at, updated_at, tags, status, source, raw_json)
           values ($1,$2,$3,$4,$5,'channel',$6)
           on conflict (id) do nothing`,
					[
						chat.id,
						new Date(chat.createdAt).toISOString(),
						new Date(chat.updatedAt ?? chat.createdAt).toISOString(),
						chat.tags ?? [],
						chat.status ?? null,
						chat,
					],
				);

				let msgCursor = '';
				for (let i = 0; i < 50; i++) {
					const msgJson = await fetchJson(
						`https://api.channel.io/open/v5/user-chats/${chat.id}/messages?limit=200&cursor=${msgCursor}`,
					);
					const messages = msgJson.messages ?? [];
					for (const msg of messages) {
						await client.query(
							`insert into raw_channel_messages
                 (conversation_id, message_id, created_at, sender, text, raw_json)
               values ($1,$2,$3,$4,$5,$6)
               on conflict (conversation_id, message_id) do nothing`,
							[
								chat.id,
								msg.id,
								new Date(msg.createdAt).toISOString(),
								msg.personType ?? null,
								msg.plainText ?? null,
								msg,
							],
						);
					}
					if (!msgJson.next) break;
					msgCursor = msgJson.next;
				}
			}
			if (!json.next) break;
			cursor = json.next;
		}
	} finally {
		client.release();
	}
}

(async () => {
	for (const [from, to] of DATE_RANGES) {
		await backfillRange(from, to);
	}
	await pool.end();
	console.log('✅ 백필 완료');
})();

