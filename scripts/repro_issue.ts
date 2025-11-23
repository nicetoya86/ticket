
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const { listUserChats } = await import('../lib/vendors/channeltalk');
    console.log('Starting reproduction script...');

    const ranges = [
        { label: 'Around Oct 1st (2025-09-25 to 2025-10-05)', from: '2025-09-25', to: '2025-10-05' },
        { label: 'Single Day (2025-10-01)', from: '2025-10-01', to: '2025-10-01' },
    ];

    for (const range of ranges) {
        console.log(`\nTesting ${range.label}: ${range.from} to ${range.to}...`);
        try {
            const chats = await listUserChats(range.from, range.to, 10);
            console.log(`Fetched ${chats.length} chats.`);
            if (chats.length > 0) {
                console.log('Sample chat date:', chats[0].createdAt);
            }
        } catch (error) {
            console.error(`Error fetching ${range.label}:`, error);
        }
    }
}

main();
