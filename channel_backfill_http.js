import 'dotenv/config';
import fetch from 'node-fetch';

const ON_CONFLICT = {
	raw_channel_conversations: 'id',
	raw_channel_messages: 'conversation_id,message_id',
};

const supabaseFetch = (table, rows) => {
	const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);
	const conflictKey = ON_CONFLICT[table];
	if (conflictKey) url.searchParams.set('on_conflict', conflictKey);
	return fetch(url, {
		method: 'POST',
		headers: {
			apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
			Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
			'Content-Type': 'application/json',
			Prefer: 'return=minimal,resolution=ignore-duplicates',
		},
		body: JSON.stringify(rows),
	});
};

async function insertRows(table, rows) {
	if (!rows.length) return;
	const res = await supabaseFetch(table, rows);
	if (!res.ok) throw new Error(`${table} insert failed: ${res.status} ${await res.text()}`);
}

async function fetchChats(from, to, state, cursor = '') {
	const qs = new URLSearchParams({
		limit: '200',
		cursor,
		state,
	});
	if (from) {
		qs.set('startDate', from);
		qs.set('createdAtFrom', `${from}T00:00:00+09:00`);
	}
	if (to) {
		qs.set('endDate', to);
		qs.set('createdAtTo', `${to}T23:59:59+09:00`);
	}
	const res = await fetch(`https://api.channel.io/open/v5/user-chats?${qs}`, {
		headers: {
			'X-Access-Key': process.env.CHANNEL_ACCESS_KEY,
			'X-Access-Secret': process.env.CHANNEL_ACCESS_SECRET,
			'Content-Type': 'application/json',
		},
	});
	if (!res.ok) throw new Error(`ChannelTalk chats ${res.status}`);
	return res.json();
}

async function fetchMessages(chatId, cursor = '') {
	const res = await fetch(
		`https://api.channel.io/open/v5/user-chats/${chatId}/messages?limit=200&cursor=${cursor}`,
		{
			headers: {
				'X-Access-Key': process.env.CHANNEL_ACCESS_KEY,
				'X-Access-Secret': process.env.CHANNEL_ACCESS_SECRET,
				'Content-Type': 'application/json',
			},
		},
	);
	if (!res.ok) throw new Error(`ChannelTalk messages ${res.status}`);
	return res.json();
}

function buildRanges() {
	const today = new Date();
	const start = new Date(today);
	start.setFullYear(today.getFullYear() - 1);
	start.setDate(1); // 해당 월의 1일부터 채우기
	const ranges = [];
	while (start <= today) {
		const from = new Date(start);
		const to = new Date(start.getFullYear(), start.getMonth() + 1, 0); // 월말
		if (to > today) to.setTime(today.getTime());
		ranges.push([from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]);
		start.setMonth(start.getMonth() + 1);
	}
	return ranges;
}

async function backfillRange(from, to) {
	console.log(`▶ ${from} ~ ${to}`);
	const states = ['opened', 'closed'];
	for (const state of states) {
		let cursor = '';
		for (let page = 0; page < 200; page++) {
			const { userChats = [], next } = await fetchChats(from, to, state, cursor);

			if (!userChats.length) break;
			const convRows = userChats.map((chat) => ({
				id: String(chat.id),
				created_at: new Date(chat.createdAt).toISOString(),
				updated_at: new Date(chat.updatedAt ?? chat.createdAt).toISOString(),
				tags: chat.tags ?? [],
				status: chat.status ?? null,
				source: 'channel',
				raw_json: chat,
			}));
			await insertRows('raw_channel_conversations', convRows);

			for (const chat of userChats) {
				let msgCursor = '';
				for (let i = 0; i < 50; i++) {
					const { messages = [], next: msgNext } = await fetchMessages(chat.id, msgCursor);
					if (!messages.length) break;
					const msgRows = messages.map((msg) => ({
						conversation_id: String(chat.id),
						message_id: String(msg.id),
						created_at: new Date(msg.createdAt).toISOString(),
						sender: msg.personType ?? null,
						text: msg.plainText ?? null,
						raw_json: msg,
					}));
					await insertRows('raw_channel_messages', msgRows);
					if (!msgNext) break;
					msgCursor = msgNext;
				}
			}

			if (!next) break;
			cursor = next;
		}
	}
}

(async () => {
	for (const [from, to] of buildRanges()) {
		await backfillRange(from, to);
	}
	console.log('✅ HTTP 백필 완료');
})();



