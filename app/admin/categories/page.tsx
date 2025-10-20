"use client";

import { useEffect, useState } from 'react';

export default function AdminCategoriesPage() {
	const [rows, setRows] = useState<any[]>([]);
	const [name, setName] = useState('');
	const [sortOrder, setSortOrder] = useState(0);
	const [error, setError] = useState<string | null>(null);

	async function load() {
		setError(null);
		const res = await fetch('/api/categories');
		if (!res.ok) { setError(`HTTP ${res.status}`); return; }
		setRows(await res.json());
	}

	useEffect(() => { void load(); }, []);

	async function onAdd() {
		setError(null);
		const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, sortOrder }) });
		if (!res.ok) { setError('생성 실패'); return; }
		setName(''); setSortOrder(0);
		await load();
	}

	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">카테고리 관리</h1>
			<div className="mt-4 p-3 border rounded bg-white">
				<div className="flex gap-2 items-end">
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">이름</span>
						<input className="border rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
					</label>
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">정렬</span>
						<input type="number" className="border rounded px-2 py-1 w-24" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value||0))} />
					</label>
					<button onClick={onAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded">추가</button>
				</div>
				{error && <div className="text-red-600 mt-2">{error}</div>}
			</div>
			<div className="mt-4 overflow-x-auto">
				<table className="min-w-full text-sm">
					<thead><tr className="text-left text-gray-600"><th className="py-2 pr-4">ID</th><th className="py-2 pr-4">이름</th><th className="py-2 pr-4">정렬</th></tr></thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.category_id} className="border-t"><td className="py-2 pr-4">{r.category_id}</td><td className="py-2 pr-4">{r.name}</td><td className="py-2 pr-4">{r.sort_order}</td></tr>
						))}
					</tbody>
				</table>
			</div>
		</main>
	);
}
