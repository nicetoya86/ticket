"use client";

import { useEffect, useState } from 'react';

export default function TicketJsonPage({ params }: { params: { id: string } }) {
    const id = params.id;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/zendesk/ticket?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!ignore) setData(json);
            } catch (e: any) {
                if (!ignore) setError(e.message ?? 'failed');
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [id]);

    return (
        <main className="container-page py-8">
            <h1 className="text-xl font-semibold mb-4">티켓 #{id} JSON</h1>
            {loading && <div className="text-gray-600">로딩 중...</div>}
            {error && <div className="text-red-600">{error}</div>}
            <pre className="card p-4 overflow-auto text-xs whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
        </main>
    );
}


