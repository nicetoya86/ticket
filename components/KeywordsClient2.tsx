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

	// 날짜/채널 변경 시 상태 초기화(문의유형은 검색 버튼으로 불러오도록 변경)
	useEffect(() => {
		setInquiryType('');
		setInquiries([]);
		setItems([]);
		setError(null);
	}, [from, to, source]);

	const canSearch = useMemo(() => Boolean(from && to), [from, to]);

	function normalizeType(v: string): string {
		const s = (v ?? '').trim();
		try {
			if (/^\[/.test(s)) {
				const parsed = JSON.parse(s);
				if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') return String(parsed[0]).trim();
			}
		} catch {}
		return s;
	}

	async function fetchInquiryOptions() {
		const qs = new URLSearchParams({ from, to, fieldTitle: '문의유형(고객)', source });
		const res = await fetch(`/api/stats/inquiries/options?${qs.toString()}`, { cache: 'no-store' });
		if (!res.ok) { setInquiries([]); return; }
		const json = await res.json();
		const seen = new Set<string>();
		const options: InquiryOption[] = (json.items ?? [])
			.map((r: any) => ({ inquiry_type: normalizeType(String(r?.inquiry_type ?? '')), ticket_count: Number(r?.ticket_count ?? 0) }))
			.filter((r: any) => r.inquiry_type && (seen.has(r.inquiry_type) ? false : (seen.add(r.inquiry_type), true)))
			.sort((a: any, b: any) => b.ticket_count - a.ticket_count);
		setInquiries(options);
	}

	async function onSearch() {
		try {
			setLoading(true);
			setError(null);
			if (!inquiryType) {
				await fetchInquiryOptions();
				return; // 1단계: 문의유형 불러오기만 수행
			}
			const qs = new URLSearchParams({ from, to, inquiryType: normalizeType(inquiryType), limit: '10', source });
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
					<span className="text-gray-600">시작일</span>
					<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
				</label>
				<label className="flex flex-col">
					<span className="text-gray-600">종료일</span>
					<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
				</label>
				<label className="flex flex-col">
					<span className="text-gray-600">채널</span>
					<select className="select" value={source} onChange={(e) => setSource(e.target.value as any)}>
						<option value="zendesk">젠데스크</option>
						<option value="channel">채널톡</option>
					</select>
				</label>
				<label className="flex flex-col min-w-64">
					<span className="text-gray-600">문의 유형</span>
					<select className="select" value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} disabled={inquiries.length === 0}>
						<option value="">(선택)</option>
						{inquiries.map((opt, i) => (
							<option key={`${opt.inquiry_type}-${i}`} value={opt.inquiry_type}>{opt.inquiry_type}</option>
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
						<tr><td colSpan={3} className="p-6 text-center text-gray-500">{loading ? '로딩 중...' : (error || (inquiries.length === 0 ? '날짜와 채널을 선택한 뒤 검색을 눌러 문의유형을 불러오세요.' : '문의유형을 선택한 뒤 다시 검색을 눌러 키워드를 조회하세요.'))}</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
