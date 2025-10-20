"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Row = { keyword: string; score?: number; freq?: number; tfidf?: number };

export function KeywordsList() {
	const [rows, setRows] = useState<Row[]>([]);
	const [error, setError] = useState<string | null>(null);
	const sp = useSearchParams();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const qs = sp.toString();
				const query = qs ? `?${qs}&limit=50` : '?limit=50';
				const res = await fetch(`/api/keywords/top${query}`, { signal: controller.signal, cache: 'no-store' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = await res.json();
				setRows(json ?? []);
			} catch (e: any) {
				if (e.name !== 'AbortError') setError(e.message ?? 'failed');
			}
		})();
		return () => controller.abort();
	}, [sp]);

	return (
		<div className="mt-4">
			{error && <div className="text-red-600">에러: {error}</div>}
			<ul className="text-sm space-y-1">
				{rows.map((r, i) => (
					<li key={i} className="flex justify-between">
						<span className="text-gray-700">{r.keyword}</span>
						<span className="text-gray-500">{(r.tfidf ?? r.freq ?? r.score ?? 0).toString()}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
