"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Totals = { date: string; count: number }[];

type OverviewResp = {
	totals: Totals;
	byCategory: { category_id: string | null; count: number }[] | { categoryId: string; count: number }[];
};

export function OverviewStats() {
	const [data, setData] = useState<OverviewResp | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const sp = useSearchParams();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				setLoading(true);
				const qs = sp.toString();
				const res = await fetch(`/api/stats/overview${qs ? `?${qs}` : ''}`, { signal: controller.signal, cache: 'no-store' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = await res.json();
				setData(json);
			} catch (e: any) {
				if (e.name !== 'AbortError') setError(e.message ?? 'failed');
			} finally {
				setLoading(false);
			}
		})();
		return () => controller.abort();
	}, [sp]);

	if (loading) return <div className="text-gray-500">로딩 중...</div>;
	if (error) return <div className="text-red-600">에러: {error}</div>;
	if (!data) return null;

	return (
		<div className="grid gap-6 md:grid-cols-2">
			<section>
				<h2 className="font-semibold mb-2">인입 추이(일)</h2>
				<ul className="text-sm space-y-1">
					{(data.totals ?? []).map((t) => (
						<li key={t.date} className="flex justify-between">
							<span className="text-gray-600">{t.date}</span>
							<span className="font-medium">{t.count}</span>
						</li>
					))}
				</ul>
			</section>
			<section>
				<h2 className="font-semibold mb-2">최근일 카테고리 TOP</h2>
				<ul className="text-sm space-y-1">
					{(data.byCategory ?? []).slice(0, 10).map((c: any, idx: number) => (
						<li key={idx} className="flex justify-between">
							<span className="text-gray-600">{c.category_id ?? c.categoryId ?? 'uncategorized'}</span>
							<span className="font-medium">{c.count}</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
