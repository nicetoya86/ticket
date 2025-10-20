"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Row = { categoryId?: string; category_id?: string; count: number; wow?: number | null; yoy?: number | null };

export function CategoriesTable() {
	const [rows, setRows] = useState<Row[]>([]);
	const [error, setError] = useState<string | null>(null);
	const sp = useSearchParams();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const qs = sp.toString();
				const res = await fetch(`/api/stats/categories${qs ? `?${qs}` : ''}`, { signal: controller.signal, cache: 'no-store' });
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
		<div className="mt-4 overflow-x-auto">
			{error && <div className="text-red-600">에러: {error}</div>}
			<table className="min-w-full text-sm">
				<thead>
					<tr className="text-left text-gray-600">
						<th className="py-2 pr-4">카테고리</th>
						<th className="py-2 pr-4">Count</th>
						<th className="py-2 pr-4">WoW</th>
						<th className="py-2 pr-4">YoY</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={i} className="border-t">
							<td className="py-2 pr-4">{r.category_id ?? r.categoryId ?? 'uncategorized'}</td>
							<td className="py-2 pr-4">{r.count}</td>
							<td className="py-2 pr-4">{r.wow ?? '-'}</td>
							<td className="py-2 pr-4">{r.yoy ?? '-'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
