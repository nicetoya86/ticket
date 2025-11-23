
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const { listUserChats } = await import('../lib/vendors/channeltalk');
    console.log('Starting reproduction script...');

    const ranges = [
        { label: 'Recent (Last 30 days)', from: '2025-10-20', to: '2025-11-20' },
        { label: '1 Year Ago (Oct 2024)', from: '2024-10-01', to: '2024-11-01' },
        { label: '2 Years Ago (Oct 2023)', from: '2023-10-01', to: '2023-11-01' }
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
