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
    const [summary, setSummary] = useState<{ summary: string; themes?: { title: string; evidence: string[] }[]; actions?: string[] } | null>(null);

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

    // 3단계: GPT 요약/분석
    async function analyzeWithGPT() {
        try {
            setLoading(true);
            setError(null);
            setSummary(null);
            const qs = new URLSearchParams({ inquiryType: normalizeType(inquiryType) });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            if (status) qs.set('status', status);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/inquiries/analyze?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setSummary(json);
        } catch (e: any) {
            setError(e.message ?? 'failed');
        } finally {
            setLoading(false);
        }
    }

    // 1단계: 검색 → 기간/상태에 텍스트가 실제 존재하는 문의유형 로드
    async function loadInquiryOptions() {
        try {
            setLoading(true);
            setError(null);
            setItems([]);
            setShowResults(false);
            const qs = new URLSearchParams({ fieldTitle: '문의유형(고객)' });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/stats/inquiries/options?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const seen = new Set<string>();
            const opts: InquiryOption[] = (json.items ?? [])
                .map((r: any) => ({ inquiry_type: normalizeType(String(r?.inquiry_type ?? '')), ticket_count: Number(r?.ticket_count ?? 0) }))
                .filter((r: any) => r.inquiry_type && (seen.has(r.inquiry_type) ? false : (seen.add(r.inquiry_type), true)))
                .sort((a: any, b: any) => b.ticket_count - a.ticket_count);

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
            // 타임라인 형태로 보기 위해 group=1 우선 시도
            const qs = new URLSearchParams({ fieldTitle: '문의유형(고객)', group: '1', inquiryType: normalizeType(inquiryType) });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            if (status) qs.set('status', status);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/stats/inquiries?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            let rows: InquiryText[] = (json.items ?? []);

            // 그룹 결과가 비면, 본문 기반(detail=texts)으로 폴백 시도
            if ((rows ?? []).length === 0) {
                const qs2 = new URLSearchParams({ fieldTitle: '문의유형(고객)', detail: 'texts', inquiryType: normalizeType(inquiryType) });
                if (from) qs2.set('from', from);
                if (to) qs2.set('to', to);
                if (status) qs2.set('status', status);
                if (source) qs2.set('source', source);
                const res2 = await fetch(`/api/stats/inquiries?${qs2.toString()}`, { cache: 'no-store' });
                if (res2.ok) {
                    const json2 = await res2.json();
                    rows = (json2.items ?? []);
                }
            }

            setItems(rows ?? []);
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
                <button disabled={!canAnalyze || loading} className="btn-outline disabled:opacity-50" onClick={analyzeWithGPT}>GPT 요약</button>
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

            {summary && (
                <div className="card p-4 space-y-3">
                    <h3 className="font-semibold">GPT 요약</h3>
                    <p className="text-sm whitespace-pre-wrap">{summary.summary}</p>
                    {(summary.themes ?? []).length > 0 && (
                        <div className="text-sm space-y-1">
                            <div className="font-medium">주요 테마</div>
                            <ul className="list-disc pl-5">
                                {(summary.themes ?? []).map((t, i) => (
                                    <li key={i}>
                                        <span className="font-medium">{t.title}</span>
                                        {(t.evidence ?? []).length > 0 && (
                                            <ul className="list-disc pl-5 text-gray-600">
                                                {t.evidence.map((e, j) => (<li key={j}>{e}</li>))}
                                            </ul>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {(summary.actions ?? []).length > 0 && (
                        <div className="text-sm space-y-1">
                            <div className="font-medium">권장 액션</div>
                            <ul className="list-disc pl-5">
                                {(summary.actions ?? []).map((a, i) => (<li key={i}>{a}</li>))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
