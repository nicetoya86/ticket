"use client";

import { useEffect, useMemo, useState } from 'react';

type TopKeyword = { keyword: string; freq?: number; tfidf?: number };

type InquiryOption = { inquiry_type: string; ticket_count: number };

export default function KeywordsClient() {
	const [from, setFrom] = useState<string>(() => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
	const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
	const [source, setSource] = useState<'zendesk' | 'channel'>('zendesk');
	const [inquiries, setInquiries] = useState<InquiryOption[]>([]);
	const [inquiryType, setInquiryType] = useState<string>('');
	const [items, setItems] = useState<TopKeyword[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Load inquiry types when date/source changes
	useEffect(() => {
		let ignore = false;
		(async () => {
			setInquiryType('');
			setItems([]);
			setError(null);
			// Use existing stats API to fetch inquiry counts (serves as options)
			const qs = new URLSearchParams({ from, to, fieldTitle: '문의유형(고객)', status: 'closed' });
			const res = await fetch(`/api/stats/inquiries?${qs.toString()}`, { cache: 'no-store' });
			if (!res.ok) { setError(`HTTP ${res.status}`); return; }
			const json = await res.json();
			if (ignore) return;
			const options = (json.items ?? []) as InquiryOption[];
			setInquiries(options);
		})();
		return () => { ignore = true; };
	}, [from, to, source]);

	const canSearch = useMemo(() => Boolean(from && to && inquiryType), [from, to, inquiryType]);

	async function onSearch() {
		try {
			setLoading(true);
			setError(null);
			const qs = new URLSearchParams({ from, to, inquiryType, limit: '10' });
			const res = await fetch(`/api/keywords/top?${qs.toString()}`, { cache: 'no-store' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			setItems(json ?? []);
		} catch (e: any) {
			setError(e.message ?? 'failed');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-4">
			<div className="card p-3 flex flex-wrap items-end gap-3 text-sm">
				<label className="flex flex-col">
					<span className="text-gray-600">From</span>
					<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
				</label>
				<label className="flex flex-col">
					<span className="text-gray-600">To</span>
					<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
				</label>
				<label className="flex flex-col">
					<span className="text-gray-600">Source</span>
					<select className="select" value={source} onChange={(e) => setSource(e.target.value as any)}>
						<option value="zendesk">zendesk</option>
						<option value="channel">channel</option>
					</select>
				</label>
				<label className="flex flex-col min-w-64">
					<span className="text-gray-600">문의 유형</span>
					<select className="select" value={inquiryType} onChange={(e) => setInquiryType(e.target.value)}>
						<option value="">(선택)</option>
						{inquiries.map((opt, i) => (
							<option key={i} value={opt.inquiry_type}>{opt.inquiry_type}</option>
						))}
					</select>
				</label>
				<button disabled={!canSearch || loading} onClick={onSearch} className="btn-outline disabled:opacity-50">검색</button>
			</div>

			<div className="card overflow-hidden">
				<table className="table-card">
					<thead className="thead"><tr><th className="p-2 text-left w-12">#</th><th className="p-2 text-left">키워드</th><th className="p-2 text-right">빈도</th></tr></thead>
					<tbody>
						{items.map((r, idx) => (
							<tr key={idx} className="border-t hover:bg-gray-50/60">
								<td className="p-2">{idx + 1}</td>
								<td className="p-2">{r.keyword}</td>
								<td className="p-2 text-right">{r.freq ?? r.tfidf ?? 0}</td>
							</tr>
						))}
						{items.length === 0 && (
							<tr><td colSpan={3} className="p-6 text-center text-gray-500">{loading ? '로딩 중...' : (error || '검색 조건을 선택한 뒤 검색을 눌러주세요.')}</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
