"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Item = {
	source: string;
	source_id: string;
	created_at: string;
	title?: string | null;
	body?: string | null;
	labels?: string[] | null;
	category_id?: string | null;
	keywords?: string[] | null;
};

type Resp = { items: Item[]; total: number };

export function InteractionsList() {
	const [page, setPage] = useState(1);
	const [pageSize] = useState(20);
	const [resp, setResp] = useState<Resp | null>(null);
	const [error, setError] = useState<string | null>(null);
	const sp = useSearchParams();

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				const baseQs = sp.toString();
				const qs = new URLSearchParams(baseQs);
				qs.set('page', String(page));
				qs.set('pageSize', String(pageSize));
				const res = await fetch(`/api/interactions?${qs.toString()}`, { signal: controller.signal, cache: 'no-store' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = await res.json();
				setResp(json);
			} catch (e: any) {
				if (e.name !== 'AbortError') setError(e.message ?? 'failed');
			}
		})();
		return () => controller.abort();
	}, [sp, page, pageSize]);

	const totalPages = resp ? Math.max(1, Math.ceil(resp.total / pageSize)) : 1;

	return (
		<div className="mt-4">
			{error && <div className="text-red-600">에러: {error}</div>}
			<ul className="divide-y">
				{resp?.items?.map((it, i) => (
					<li key={`${it.source}-${it.source_id}-${i}`} className="py-3">
						<div className="text-xs text-gray-500">{new Date(it.created_at).toLocaleString('ko-KR')}</div>
						<div className="font-medium">{it.title ?? '(제목 없음)'}</div>
						<div className="text-gray-600 text-sm line-clamp-2">{it.body ?? ''}</div>
						<div className="text-xs text-gray-500 mt-1">
							카테고리: {it.category_id ?? '-'} / 키워드: {(it.keywords ?? []).join(', ')}
						</div>
					</li>
				))}
			</ul>
			<div className="flex items-center gap-2 mt-4">
				<button className="px-2 py-1 border rounded disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</button>
				<span className="text-sm">{page} / {totalPages}</span>
				<button className="px-2 py-1 border rounded disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button>
			</div>
		</div>
	);
}
