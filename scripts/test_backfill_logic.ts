
import 'dotenv/config';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

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

async function testBackfillLogic() {
    const from = '2025-10-01';
    const to = '2025-10-01';
    console.log(`Testing backfill logic for ${from} ~ ${to}`);

    let cursor = '';
    for (let page = 0; page < 5; page++) {
        const params: any = {
            limit: '10',
            state: 'closed',
            since: String(new Date(from).getTime()), // Milliseconds
        };
        if (cursor) params.cursor = cursor;

        const qs = new URLSearchParams(params);
        const url = `https://api.channel.io/open/v5/user-chats?${qs}`;
        console.log(`Fetching: ${url}`);
        const json = await fetchJson(url);
        const chats = json.userChats ?? [];
        console.log(`Fetched ${chats.length} chats.`);
        if (chats.length > 0) {
            console.log(`First chat createdAt: ${chats[0].createdAt} (${new Date(chats[0].createdAt).toISOString()})`);
        }

        if (!json.next) {
            console.log('No next cursor.');
            break;
        }
        cursor = json.next;
        console.log(`Next cursor: ${cursor}`);
    }
}

testBackfillLogic().catch(e => console.error(e));
