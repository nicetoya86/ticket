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
    const [showResults, setShowResults] = useState<boolean>(false);

    // 검색 조건 변경 시 상태 초기화 (검색 전에는 드롭다운/결과 비활성화 유지)
    useEffect(() => {
        setOptions([]);
        setInquiryType('');
        setItems([]);
        setShowResults(false);
        setError(null);
    }, [from, to, status, source]);

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
            setShowResults(false);
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
            let opts = Array.from(map.entries())
                .map(([inquiry_type, ids]) => ({ inquiry_type, ticket_count: ids.size }))
                .sort((a, b) => b.ticket_count - a.ticket_count);

            // texts가 비어 있으면 counts로 폴백해서 드롭다운 비활성화 방지
            if (opts.length === 0) {
                const qs2 = new URLSearchParams({ fieldTitle: '문의유형(고객)' });
                if (from) qs2.set('from', from);
                if (to) qs2.set('to', to);
                if (status) qs2.set('status', status);
                if (source) qs2.set('source', source);
                const res2 = await fetch(`/api/stats/inquiries?${qs2.toString()}`, { cache: 'no-store' });
                if (res2.ok) {
                    const json2 = await res2.json();
                    const seen = new Set<string>();
                    const dedup = (json2.items ?? [])
                        .map((r: any) => ({ inquiry_type: normalizeType(String(r?.inquiry_type ?? '')), ticket_count: Number(r?.ticket_count ?? 0) }))
                        .filter((r: any) => r.inquiry_type)
                        .sort((a: any, b: any) => b.ticket_count - a.ticket_count)
                        .filter((r: any) => (seen.has(r.inquiry_type) ? false : (seen.add(r.inquiry_type), true)));
                    opts = dedup;
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

    // 2단계: 문의유형 선택 후 내용 확인 → 타임라인(그룹) 기반 텍스트 조회
    async function loadTexts() {
        try {
            setShowResults(true);
            setLoading(true);
            setError(null);
            // 타임라인 형태로 보기 위해 group=1 사용, 서버에서 inquiryType 필터 적용
            const qs = new URLSearchParams({ fieldTitle: '문의유형(고객)', group: '1', inquiryType: normalizeType(inquiryType) });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            if (status) qs.set('status', status);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/stats/inquiries?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            // 서버에서 inquiryTypeParam으로 필터링됨
            const rows: InquiryText[] = (json.items ?? []);
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

            {showResults && (
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
                                <tr><td colSpan={3} className="p-6 text-center text-gray-500">{loading ? '로딩 중...' : (error || '검색 결과가 없습니다.')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
