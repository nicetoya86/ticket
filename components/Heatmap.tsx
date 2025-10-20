"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Cell = { dow: number; hour: number; count: number };

const days = ['일','월','화','수','목','금','토'];

export function Heatmap() {
	const [cells, setCells] = useState<Cell[]>([]);
	const [error, setError] = useState<string | null>(null);
	const sp = useSearchParams();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const qs = sp.toString();
				const res = await fetch(`/api/stats/heatmap${qs ? `?${qs}` : ''}`, { signal: controller.signal, cache: 'no-store' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = await res.json();
				setCells(json ?? []);
			} catch (e: any) {
				if (e.name !== 'AbortError') setError(e.message ?? 'failed');
			}
		})();
		return () => controller.abort();
	}, [sp]);

	const max = useMemo(() => cells.reduce((m, c) => Math.max(m, c.count || 0), 0) || 1, [cells]);

	return (
		<section className="mt-8">
			<h2 className="font-semibold mb-2">요일/시간대 히트맵</h2>
			{error && <div className="text-red-600">에러: {error}</div>}
			<div className="overflow-x-auto">
				<table className="text-sm">
					<thead>
						<tr>
							<th className="text-left pr-2">요일\시간</th>
							{Array.from({ length: 24 }, (_, h) => (
								<th key={h} className="px-1 text-xs text-gray-500">{h}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{days.map((d, dow) => (
							<tr key={dow}>
								<td className="pr-2 text-gray-600">{d}</td>
								{Array.from({ length: 24 }, (_, hour) => {
									const cell = cells.find((c) => c.dow === dow && c.hour === hour);
									const v = cell?.count ?? 0;
									const ratio = v / max;
									const bg = `rgba(37, 99, 235, ${ratio.toFixed(2)})`;
									return <td key={hour} style={{ backgroundColor: bg }} className="w-6 h-6 text-[10px] text-center text-white">{v || ''}</td>;
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
