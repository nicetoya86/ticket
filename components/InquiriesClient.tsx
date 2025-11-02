"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

type InquiryCount = { inquiry_type: string | null; ticket_count: number };
type InquiryUser = { inquiry_type: string | null; ticket_id: number; requester: string | null; subject: string; created_at: string };
type InquiryText = { inquiry_type: string | null; ticket_id: number; created_at: string; text_type: string; text_value: string };

export default function InquiriesClient() {
	const sp = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [items, setItems] = useState<any[]>([]);

	const from = sp.get('from') ?? '';
	const to = sp.get('to') ?? '';
	const mode = sp.get('mode') ?? 'counts'; // counts | users | texts
	const group = sp.get('group');
	const groupEffective = mode === 'texts' ? (group === '0' ? '0' : '1') : '0'; // default group ON for texts
	const status = sp.get('status') ?? 'closed';
	const fieldTitle = sp.get('fieldTitle') ?? '문의유형(고객)';

	const update = (patch: Record<string, string | null>) => {
		const params = new URLSearchParams(sp.toString());
		for (const [k, v] of Object.entries(patch)) {
			if (v === null || v === '') params.delete(k); else params.set(k, v);
		}
		router.push(`${pathname}?${params.toString()}`);
	};

	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			try {
				setLoading(true);
				setError(null);
				const qs = new URLSearchParams();
				if (from) qs.set('from', from);
				if (to) qs.set('to', to);
				if (status) qs.set('status', status);
				if (fieldTitle) qs.set('fieldTitle', fieldTitle);
				if (mode === 'users') qs.set('detail', 'users');
				if (mode === 'texts') qs.set('detail', 'texts');
				if (groupEffective === '1') qs.set('group', '1'); else qs.delete('group');
				const res = await fetch(`/api/stats/inquiries?${qs.toString()}`, { signal: controller.signal, cache: 'no-store' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = await res.json();
				setItems(json.items ?? []);
			} catch (e: any) {
				if (e.name !== 'AbortError') setError(e.message ?? 'failed');
			} finally {
				setLoading(false);
			}
		})();
		return () => controller.abort();
	}, [from, to, mode, status, fieldTitle, groupEffective, sp]);

	const title = useMemo(() => {
		if (mode === 'users') return '문의유형별 유저/티켓';
		if (mode === 'texts') return '문의유형별 텍스트(제목/코멘트)';
		return '문의유형별 집계';
	}, [mode]);

	return (
		<div>
			<h2 className="text-lg font-semibold">{title}</h2>
			<div className="mt-4 p-3 border bg-white rounded-md flex flex-wrap items-center gap-3 text-sm">
				<label className="flex items-center gap-2">
					<span className="text-gray-600">From</span>
					<input type="date" value={from} onChange={(e) => update({ from: e.target.value || null })} className="border rounded px-2 py-1" />
				</label>
				<label className="flex items-center gap-2">
					<span className="text-gray-600">To</span>
					<input type="date" value={to} onChange={(e) => update({ to: e.target.value || null })} className="border rounded px-2 py-1" />
				</label>
				<label className="flex items-center gap-2">
					<span className="text-gray-600">Status</span>
					<select value={status} onChange={(e) => update({ status: e.target.value })} className="border rounded px-2 py-1">
						<option value="closed">closed</option>
						<option value="solved">solved</option>
						<option value="open">open</option>
						<option value="pending">pending</option>
						<option value="hold">hold</option>
						<option value="">(all)</option>
					</select>
				</label>
				<label className="flex items-center gap-2">
					<span className="text-gray-600">Field</span>
					<input type="text" value={fieldTitle} onChange={(e) => update({ fieldTitle: e.target.value || null })} className="border rounded px-2 py-1" placeholder="문의유형(고객)" />
				</label>
				<label className="flex items-center gap-2">
					<span className="text-gray-600">Mode</span>
					<select value={mode} onChange={(e) => update({ mode: e.target.value })} className="border rounded px-2 py-1">
						<option value="counts">counts</option>
						<option value="users">users</option>
						<option value="texts">texts</option>
					</select>
				</label>
				{mode === 'texts' && (
					<label className="flex items-center gap-2">
						<input type="checkbox" checked={groupEffective === '1'} onChange={(e) => update({ group: e.target.checked ? '1' : '0' })} />
						<span className="text-gray-600">Group by ticket</span>
					</label>
				)}
			</div>

			<div className="mt-6">
				{loading && <div className="text-gray-500">로딩 중...</div>}
				{error && <div className="text-red-600">에러: {error}</div>}
				{!loading && !error && (
					<div className="border bg-white rounded-md">
						{mode === 'counts' && (
							<table className="w-full text-sm">
								<thead><tr className="bg-gray-50"><th className="p-2 text-left">문의유형</th><th className="p-2 text-right">건수</th></tr></thead>
								<tbody>
									{(items as InquiryCount[]).map((r, idx) => (
										<tr key={idx} className="border-t">
											<td className="p-2">{r.inquiry_type ?? '(null)'}</td>
											<td className="p-2 text-right">{r.ticket_count}</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
						{mode === 'users' && (
							<table className="w-full text-sm">
								<thead><tr className="bg-gray-50"><th className="p-2">문의유형</th><th className="p-2">티켓ID</th><th className="p-2">요청자</th><th className="p-2">제목</th><th className="p-2">생성일</th></tr></thead>
								<tbody>
									{(items as InquiryUser[]).map((r, idx) => (
										<tr key={idx} className="border-t">
											<td className="p-2">{r.inquiry_type ?? '(null)'}</td>
											<td className="p-2">{r.ticket_id}</td>
											<td className="p-2">{r.requester ?? ''}</td>
											<td className="p-2">{r.subject}</td>
											<td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
						{mode === 'texts' && (
							<table className="w-full text-sm">
								<thead><tr className="bg-gray-50"><th className="p-2">문의유형</th><th className="p-2">티켓ID</th><th className="p-2">타입</th><th className="p-2">텍스트</th><th className="p-2">작성일</th></tr></thead>
								<tbody>
									{(items as InquiryText[])
										.filter((r) => r && r.inquiry_type && !String(r.inquiry_type).startsWith('병원_'))
										.map((r, idx) => (
										<tr key={idx} className="border-t align-top">
											<td className="p-2">{r.inquiry_type ?? '(null)'}</td>
											<td className="p-2">{r.ticket_id}</td>
											<td className="p-2">{r.text_type}</td>
											<td className="p-2 whitespace-pre-wrap break-words max-w-[48rem]">{r.text_value}</td>
											<td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
