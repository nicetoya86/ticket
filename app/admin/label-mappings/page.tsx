"use client";

import { useEffect, useState } from 'react';

export default function AdminLabelMappingsPage() {
	const [rows, setRows] = useState<any[]>([]);
	const [source, setSource] = useState<'zendesk'|'channel'>('zendesk');
	const [label, setLabel] = useState('');
	const [categoryId, setCategoryId] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			setError(null);
			const res = await fetch(`/api/label-mappings?source=${source}`);
			if (!res.ok) { setError(`HTTP ${res.status}`); return; }
			setRows(await res.json());
		})();
	}, [source]);

	async function onAdd() {
		setError(null);
		const res = await fetch('/api/label-mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, label, categoryId }) });
		if (!res.ok) { setError('생성 실패'); return; }
		setLabel(''); setCategoryId('');
		// reload
		const res2 = await fetch(`/api/label-mappings?source=${source}`);
		if (res2.ok) setRows(await res2.json());
	}

	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">라벨 매핑</h1>
			<div className="mt-4 p-3 border rounded bg-white">
				<div className="flex flex-wrap gap-2 items-end">
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">Source</span>
						<select className="border rounded px-2 py-1" value={source} onChange={(e) => setSource(e.target.value as any)}>
							<option value="zendesk">zendesk</option>
							<option value="channel">channel</option>
						</select>
					</label>
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">Label</span>
						<input className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
					</label>
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">Category ID</span>
						<input className="border rounded px-2 py-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
					</label>
					<button onClick={onAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded">추가</button>
				</div>
				{error && <div className="text-red-600 mt-2">{error}</div>}
			</div>
			<div className="mt-4 overflow-x-auto">
				<table className="min-w-full text-sm">
					<thead><tr className="text-left text-gray-600"><th className="py-2 pr-4">Source</th><th className="py-2 pr-4">Label</th><th className="py-2 pr-4">Category</th></tr></thead>
					<tbody>
						{rows.map((r, i) => (
							<tr key={i} className="border-t"><td className="py-2 pr-4">{r.source}</td><td className="py-2 pr-4">{r.label}</td><td className="py-2 pr-4">{r.category_id}</td></tr>
						))}
					</tbody>
				</table>
			</div>
		</main>
	);
}
