"use client";

import { useEffect, useMemo, useState } from 'react';

type InquiryText = { inquiry_type: string | null; ticket_id: number; created_at: string; text_type: string; text_value: string };
type InquiryOption = { inquiry_type: string; ticket_count: number };

export default function InquiriesClient() {
    const [from, setFrom] = useState<string>('');
    const [to, setTo] = useState<string>('');
    const [status, setStatus] = useState<string>('closed');
    const [source, setSource] = useState<'zendesk' | 'channel'>('zendesk');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inquiryType, setInquiryType] = useState<string>('');
    const [options, setOptions] = useState<InquiryOption[]>([]);
    const [items, setItems] = useState<InquiryText[]>([]);

    function normalizeType(v: string): string {
        const s = (v ?? '').trim();
        try {
            if (/^\[/.test(s)) {
                const p = JSON.parse(s);
                if (Array.isArray(p) && p.length > 0 && typeof p[0] === 'string') return String(p[0]).trim();
            }
        } catch {}
        return s;
    }

    // 1단계: 검색 → 기간/상태에 텍스트가 실제 존재하는 문의유형 로드
    async function loadInquiryOptions() {
        try {
            setLoading(true);
            setError(null);
            setItems([]);
            const qs = new URLSearchParams({ fieldTitle: '문의유형(고객)', detail: 'texts' });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            if (status) qs.set('status', status);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/stats/inquiries?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const map = new Map<string, Set<number>>();
            for (const r of (json.items ?? []) as any[]) {
                const t = normalizeType(String(r?.inquiry_type ?? ''));
                if (!t) continue;
                const tid = Number(r?.ticket_id ?? 0);
                if (!map.has(t)) map.set(t, new Set());
                if (tid) map.get(t)!.add(tid);
            }
            let opts = Array.from(map.entries()).map(([inquiry_type, ids]) => ({ inquiry_type, ticket_count: ids.size })).sort((a, b) => b.ticket_count - a.ticket_count);
            // Fallback: 텍스트가 없으면 counts 기반으로라도 유형을 제공해 드롭다운을 활성화
            if (opts.length === 0) {
                const qs2 = new URLSearchParams({ fieldTitle: '문의유형(고객)' });
                if (from) qs2.set('from', from);
                if (to) qs2.set('to', to);
                if (status) qs2.set('status', status);
                if (source) qs2.set('source', source);
                const r2 = await fetch(`/api/stats/inquiries?${qs2.toString()}`, { cache: 'no-store' });
                if (r2.ok) {
                    const j2 = await r2.json();
                    opts = ((j2.items ?? []) as any[])
                        .map((o: any) => ({ inquiry_type: normalizeType(String(o.inquiry_type ?? '')), ticket_count: Number(o.ticket_count ?? 0) }))
                        .filter((o: any) => o.inquiry_type)
                        .sort((a: any, b: any) => b.ticket_count - a.ticket_count);
                }
            }
            setOptions(opts);
            if (opts.length > 0) setInquiryType('');
        } catch (e: any) {
            setError(e.message ?? 'failed');
        } finally {
            setLoading(false);
        }
    }

    // 2단계: 문의유형 선택 후 내용 확인 → body 기반 텍스트 조회
    async function loadTexts() {
        try {
            setLoading(true);
            setError(null);
            const qs = new URLSearchParams({ fieldTitle: '문의유형(고객)', detail: 'texts', inquiryType: normalizeType(inquiryType) });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            if (status) qs.set('status', status);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/stats/inquiries?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const t = normalizeType(inquiryType);
            const rows: InquiryText[] = (json.items ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === t);
            setItems(rows);
        } catch (e: any) {
            setError(e.message ?? 'failed');
        } finally {
            setLoading(false);
        }
    }

    const canSearch = useMemo(() => Boolean(from && to), [from, to]);
    const canAnalyze = useMemo(() => Boolean(canSearch && inquiryType), [canSearch, inquiryType]);

    return (
        <div className="space-y-4">
            <div className="mt-4 p-3 card flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col">
                    <span className="text-gray-600">시작일</span>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
                </label>
                <label className="flex flex-col">
                    <span className="text-gray-600">종료일</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
                </label>
                <label className="flex flex-col">
                    <span className="text-gray-600">채널</span>
                    <select value={source} onChange={(e) => setSource(e.target.value as any)} className="select">
                        <option value="zendesk">젠데스크</option>
                        <option value="channel">채널톡</option>
                    </select>
                </label>
                <label className="flex flex-col">
                    <span className="text-gray-600">Status</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="select">
                        <option value="closed">closed</option>
                        <option value="solved">solved</option>
                        <option value="open">open</option>
                        <option value="pending">pending</option>
                        <option value="hold">hold</option>
                        <option value="">(all)</option>
                    </select>
                </label>
                <button disabled={!canSearch || loading} className="btn-outline disabled:opacity-50" onClick={loadInquiryOptions}>검색</button>
                <label className="flex flex-col min-w-64">
                    <span className="text-gray-600">문의유형</span>
                    <select className="select" value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} disabled={options.length === 0}>
                        <option value="">(선택)</option>
                        {options.map((o, i) => (
                            <option key={`${o.inquiry_type}-${i}`} value={o.inquiry_type}>{o.inquiry_type}</option>
                        ))}
                    </select>
                </label>
                <button disabled={!canAnalyze || loading} className="btn-outline disabled:opacity-50" onClick={loadTexts}>내용 확인</button>
            </div>

            <div className="card overflow-hidden">
                <table className="table-card">
                    <thead className="thead"><tr><th className="p-2">문의유형</th><th className="p-2">티켓ID</th><th className="p-2">내용</th></tr></thead>
                    <tbody>
                        {items.map((r, idx) => (
                            <tr key={idx} className="border-t align-top hover:bg-gray-50/60">
                                <td className="p-2">{normalizeType(String(r.inquiry_type ?? ''))}</td>
                                <td className="p-2">{r.ticket_id}</td>
                                <td className="p-2 whitespace-pre-wrap break-words max-w-[64rem]">{r.text_value}</td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr><td colSpan={3} className="p-6 text-center text-gray-500">{loading ? '로딩 중...' : (error || (options.length === 0 ? '날짜와 상태를 선택한 뒤 검색을 눌러 문의유형을 불러오세요.' : '문의유형을 선택한 뒤 내용 확인을 눌러 주세요.'))}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
