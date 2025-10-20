"use client";

import { useEffect, useState } from 'react';

export default function AdminStopwordsPage() {
	const [rows, setRows] = useState<any[]>([]);
	const [locale, setLocale] = useState('ko-KR');
	const [token, setToken] = useState('');
	const [error, setError] = useState<string | null>(null);

	async function load() {
		setError(null);
		const res = await fetch('/api/stopwords');
		if (!res.ok) { setError(`HTTP ${res.status}`); return; }
		setRows(await res.json());
	}

	useEffect(() => { void load(); }, []);

	async function onAdd() {
		setError(null);
		const res = await fetch('/api/stopwords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale, token }) });
		if (!res.ok) { setError('생성 실패'); return; }
		setToken('');
		await load();
	}

	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">불용어 관리</h1>
			<div className="mt-4 p-3 border rounded bg-white">
				<div className="flex flex-wrap gap-2 items-end">
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">Locale</span>
						<input className="border rounded px-2 py-1" value={locale} onChange={(e) => setLocale(e.target.value)} />
					</label>
					<label className="flex flex-col text-sm">
						<span className="text-gray-600">Token</span>
						<input className="border rounded px-2 py-1" value={token} onChange={(e) => setToken(e.target.value)} />
					</label>
					<button onClick={onAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded">추가</button>
				</div>
				{error && <div className="text-red-600 mt-2">{error}</div>}
			</div>
			<div className="mt-4 overflow-x-auto">
				<table className="min-w-full text-sm">
					<thead><tr className="text-left text-gray-600"><th className="py-2 pr-4">Locale</th><th className="py-2 pr-4">Token</th><th className="py-2 pr-4">Active</th></tr></thead>
					<tbody>
						{rows.map((r, i) => (
							<tr key={`${r.locale}-${r.token}-${i}`} className="border-t"><td className="py-2 pr-4">{r.locale}</td><td className="py-2 pr-4">{r.token}</td><td className="py-2 pr-4">{String(r.active)}</td></tr>
						))}
					</tbody>
				</table>
			</div>
		</main>
	);
}
