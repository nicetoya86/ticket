"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { compareByChoseong } from '@/lib/text';

const ALL_TAG_VALUE = '__ALL__';
const ALL_TAG_LABEL = '전체 선택';
const HOSPITAL_NAME_HINT = /(병원|의원|의료|센터|한의원|클리닉|치과|내과|외과|피부과|안과|정형외과|성형외과|산부인과|산후조리원|한방|한의|메디컬|의료원)/i;

type InquiryText = {
	inquiry_type: string | null;
	ticket_id: number | string;
	ticket_name?: string | null;
	created_at: string;
	text_type: string;
	text_value: string;
};
type InquiryOption = { inquiry_type: string; ticket_count: number };
type GPTSummary = {
	summary: string;
	themes?: { title: string; evidence?: string[]; count?: number }[];
	actions?: string[];
};

export default function InquiriesClient() {
    const [from, setFrom] = useState<string>('');
    const [to, setTo] = useState<string>('');
    const [source, setSource] = useState<'zendesk' | 'channel'>('channel');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inquiryType, setInquiryType] = useState<string>('');
    const [options, setOptions] = useState<InquiryOption[]>([]);
    const [items, setItems] = useState<InquiryText[]>([]);
    const [showResults, setShowResults] = useState<boolean>(false);
    const [summary, setSummary] = useState<GPTSummary | null>(null);
	const [exporting, setExporting] = useState(false);
	const optionsCacheRef = useRef<Map<string, InquiryOption[]>>(new Map());
	const buildOptionsCacheKey = () => [from || '-', to || '-', source || '-'].join('|');
	const clampRange = (start: string, end: string): { from: string; to: string } => {
		const fromDate = new Date(start);
		const toDate = new Date(end);
		if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
			return { from: start, to: end };
		}
		if (toDate.getTime() < fromDate.getTime()) {
			return {
				from: toDate.toISOString().slice(0, 10),
				to: fromDate.toISOString().slice(0, 10),
			};
		}
		const ONE_DAY_MS = 24 * 3600 * 1000;
		const maxSpanMs = 365 * ONE_DAY_MS;
		if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
			const adjustedTo = new Date(fromDate.getTime() + maxSpanMs);
			return {
				from: fromDate.toISOString().slice(0, 10),
				to: adjustedTo.toISOString().slice(0, 10),
			};
		}
		return {
			from: fromDate.toISOString().slice(0, 10),
			to: toDate.toISOString().slice(0, 10),
		};
	};

    // 검색 조건 변경 시 상태 초기화 (검색 전에는 드롭다운/결과 비활성화 유지)
    useEffect(() => {
        setOptions([]);
        setInquiryType('');
        setItems([]);
        setShowResults(false);
        setError(null);
    }, [from, to, source]);

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
	const isAllSelection = (value: string) => value === ALL_TAG_VALUE;
	const toQueryInquiryType = (value: string): string => {
		if (!value || isAllSelection(value)) return '';
		return normalizeType(value);
	};
	const toSelectionLabel = (value: string): string => {
		if (!value || isAllSelection(value)) return ALL_TAG_LABEL;
		return normalizeType(value);
	};
	const sanitizeEvidenceText = (value?: string | null): string => {
		if (!value) return '';
		let result = String(value).trim();
		if (!result) return '';
		result = result.replace(/^\s*\[[^\]]+\]\s*/, '');
		const colonIdx = result.indexOf(':');
		if (colonIdx > 0 && colonIdx <= 80) {
			const prefix = result.slice(0, colonIdx).trim();
			if (HOSPITAL_NAME_HINT.test(prefix)) {
				result = result.slice(colonIdx + 1);
			}
		}
		result = result.replace(/^[\s\-–—:]+/, '').trim();
		result = result.replace(/^['"\s]+/, '').replace(/['"\s]+$/, '');
		return result.trim();
	};
	const sanitizeEvidenceList = (list?: Array<string | null>): string[] =>
		(list ?? [])
			.map((ev) => sanitizeEvidenceText(ev))
			.filter((ev) => ev.length > 0);

    function formatDate(value?: string | null): string {
        if (!value) return '';
        const trimmed = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const msFromNumber = Number(trimmed);
        if (Number.isFinite(msFromNumber)) {
            try {
                const d = new Date(msFromNumber);
                if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
            } catch {}
        }
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed)) {
            return new Date(parsed).toISOString().slice(0, 10);
        }
        return trimmed;
    }

    // 3단계: GPT 요약/분석
    async function analyzeWithGPT() {
		if (!inquiryType) {
			setError('태그를 먼저 선택해 주세요.');
			return;
		}
		if (items.length === 0) {
			setError('GPT 요약 전, 먼저 "내용 확인"으로 데이터를 불러와 주세요.');
			return;
		}
        try {
            setLoading(true);
            setError(null);
            setSummary(null);
			const payload = {
				inquiryType: toQueryInquiryType(inquiryType),
				from,
				to,
				source,
				rows: items,
			};
            const res = await fetch('/api/inquiries/analyze', {
				method: 'POST',
				cache: 'no-store',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setSummary(json);
        } catch (e: any) {
            setError(`전체 태그 검색 실패: ${e.message ?? 'unknown'}`);
        } finally {
            setLoading(false);
        }
    }

	const sortInquiryOptionsByChoseong = (items: InquiryOption[]): InquiryOption[] => {
		return [...items].sort((a, b) => {
			const cmp = compareByChoseong(a.inquiry_type ?? '', b.inquiry_type ?? '');
			if (cmp !== 0) return cmp;
			return b.ticket_count - a.ticket_count;
		});
	};
	const sortRowsByTag = (rows: InquiryText[]): InquiryText[] => {
		return [...rows].sort((a, b) => {
			const tagA = normalizeType(String(a?.inquiry_type ?? ''));
			const tagB = normalizeType(String(b?.inquiry_type ?? ''));
			const tagCompare = compareByChoseong(tagA, tagB);
			if (tagCompare !== 0) return tagCompare;
			const dateA = String(a?.created_at ?? '');
			const dateB = String(b?.created_at ?? '');
			if (dateA && dateB) return dateB.localeCompare(dateA);
			if (!dateA && dateB) return 1;
			if (dateA && !dateB) return -1;
			return 0;
		});
	};

    // 1단계: 검색 → 기간/상태에 텍스트가 실제 존재하는 문의유형 로드
    async function loadInquiryOptions() {
        try {
            setLoading(true);
            setError(null);
            setItems([]);
			setSummary(null);
            setShowResults(false);
			const cacheKey = buildOptionsCacheKey();
			const cachedOptions = optionsCacheRef.current.get(cacheKey);
			if (cachedOptions) {
				setOptions(cachedOptions);
				const defaultSelection = ALL_TAG_VALUE;
				setInquiryType(defaultSelection);
				await loadTexts(defaultSelection);
				return;
			}
			const clampRange = (start: string, end: string): { from: string; to: string } => {
				const fromDate = new Date(start);
				const toDate = new Date(end);
				if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
					return { from: start, to: end };
				}
				const ONE_DAY_MS = 24 * 3600 * 1000;
				const maxSpanMs = 365 * ONE_DAY_MS;
				if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
					const adjustedTo = new Date(fromDate.getTime() + maxSpanMs);
					return {
						from: fromDate.toISOString().slice(0, 10),
						to: adjustedTo.toISOString().slice(0, 10),
					};
				}
				return {
					from: fromDate.toISOString().slice(0, 10),
					to: toDate.toISOString().slice(0, 10),
				};
			};
			const { from: clampedFrom, to: clampedTo } = clampRange(from, to);
            const qs = new URLSearchParams({ fieldTitle: '문의유형(고객)' });
            if (clampedFrom) qs.set('from', clampedFrom);
            if (clampedTo) qs.set('to', clampedTo);
            if (source) qs.set('source', source);
            const res = await fetch(`/api/stats/inquiries/options?${qs.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const seen = new Set<string>();
            const opts: InquiryOption[] = (json.items ?? [])
                .map((r: any) => ({ inquiry_type: normalizeType(String(r?.inquiry_type ?? '')), ticket_count: Number(r?.ticket_count ?? 0) }))
                .filter((r: any) => r.inquiry_type && (seen.has(r.inquiry_type) ? false : (seen.add(r.inquiry_type), true)))
                ;

			const sorted = sortInquiryOptionsByChoseong(opts);
			optionsCacheRef.current.set(cacheKey, sorted);
            setOptions(sorted);
			const defaultSelection = ALL_TAG_VALUE;
			setInquiryType(defaultSelection);
			await loadTexts(defaultSelection);
        } catch (e: any) {
            setError(`선택 태그 검색 실패: ${e.message ?? 'unknown'}`);
        } finally {
            setLoading(false);
        }
    }

    // 2단계: 문의유형 선택 후 내용 확인 → 타임라인(그룹) 기반 텍스트 조회
    async function loadTexts(targetType?: string) {
		const desiredType = targetType ?? (inquiryType || ALL_TAG_VALUE);
		if (targetType && targetType !== inquiryType) {
			setInquiryType(targetType);
		}
		const queryType = toQueryInquiryType(desiredType);
        try {
            setShowResults(true);
            setLoading(true);
            setError(null);
            // 타임라인 형태로 보기 위해 group=1 우선 시도
			const params: Record<string, string> = { fieldTitle: '문의유형(고객)', group: '1' };
			if (queryType) params.inquiryType = queryType;
			const { from: clampedFrom, to: clampedTo } = clampRange(from, to);
            const qs = new URLSearchParams(params);
            if (clampedFrom) qs.set('from', clampedFrom);
            if (clampedTo) qs.set('to', clampedTo);
            if (source) qs.set('source', source);
			const detailParams: Record<string, string> = { fieldTitle: '문의유형(고객)', detail: 'texts' };
			if (queryType) detailParams.inquiryType = queryType;
			const qs2 = new URLSearchParams(detailParams);
			if (clampedFrom) qs2.set('from', clampedFrom);
			if (clampedTo) qs2.set('to', clampedTo);
			if (source) qs2.set('source', source);
			const fetchRows = async (search: URLSearchParams): Promise<{ rows: InquiryText[]; error?: string }> => {
				try {
					const res = await fetch(`/api/stats/inquiries?${search.toString()}`, { cache: 'no-store' });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const json = await res.json();
					return { rows: (json.items ?? []) as InquiryText[] };
				} catch (err: any) {
					return { rows: [], error: err?.message ?? 'failed' };
				}
			};
			const groupPromise = fetchRows(qs);
			const detailPromise = fetchRows(qs2);
			const groupResult = await groupPromise;
			let rows: InquiryText[] = groupResult.rows ?? [];
			let fetchError = groupResult.error;
			if ((rows ?? []).length === 0) {
				const detailResult = await detailPromise;
				rows = detailResult.rows ?? [];
				if (!fetchError) fetchError = detailResult.error;
			} else {
				detailPromise.catch(() => null);
			}
			if (fetchError && (rows ?? []).length === 0) throw new Error(fetchError);
			if (!fetchError) setError(null);
			const sortedRows = sortRowsByTag(rows ?? []);
            setItems(sortedRows);
        } catch (e: any) {
            setError(`문의내용 요약 실패: ${e.message ?? 'unknown'}`);
        } finally {
            setLoading(false);
        }
    }

    const canSearch = useMemo(() => Boolean(from && to), [from, to]);
    const canAnalyze = useMemo(() => Boolean(canSearch && inquiryType), [canSearch, inquiryType]);
	const canDownload = useMemo(() => canAnalyze && items.length > 0 && !loading, [canAnalyze, items.length, loading]);

	async function downloadExcel() {
		if (!canDownload || exporting) return;
		try {
			setExporting(true);
			const XLSX = await import('xlsx');
			const header = ['문의 일시', '태그', '병원명', '내용'];
			const rows = items.map((r) => [
				formatDate(r.created_at),
				normalizeType(String(r.inquiry_type ?? '')),
				String(r.ticket_name ?? r.ticket_id ?? ''),
				String(r.text_value ?? ''),
			]);
			const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
			worksheet['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 36 }, { wch: 120 }];
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, '문의내용');
			if (summary) {
				const summaryRows: Array<Array<string>> = [];
				summaryRows.push(['GPT 요약']);
				summaryRows.push(['요약', summary.summary ?? '']);
				const themeList = summary.themes ?? [];
				if (themeList.length > 0) {
					summaryRows.push([]);
					summaryRows.push(['주요 테마']);
					themeList.forEach((t, idx) => {
						const countLabel = typeof t.count === 'number' ? `${t.count}건` : '';
						summaryRows.push([`${idx + 1}. ${t.title}`, countLabel]);
						const evidences = sanitizeEvidenceList(t.evidence ?? []);
						evidences.forEach((ev, evIdx) => {
							summaryRows.push(['', evIdx === 0 ? '근거' : '', `'${ev}'`]);
						});
					});
				}
				const actions = summary.actions ?? [];
				if (actions.length > 0) {
					summaryRows.push([]);
					summaryRows.push(['권장 액션']);
					actions.forEach((a, idx) => {
						summaryRows.push([`${idx + 1}. ${a}`]);
					});
				}
				const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
				summarySheet['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 80 }];
				XLSX.utils.book_append_sheet(workbook, summarySheet, 'GPT 요약');
			}
			const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '전체';
			const tagLabel = sanitize(toSelectionLabel(inquiryType));
			const file = `문의내용_${from || '시작일'}_${to || '종료일'}_${tagLabel}.xlsx`;
			XLSX.writeFile(workbook, file);
		} catch (e: any) {
			setError(`엑셀 내보내기 실패: ${e?.message ?? 'unknown'}`);
		} finally {
			setExporting(false);
		}
	}

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
                <div className="flex flex-col">
                    <span className="text-gray-600">채널</span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setSource('zendesk')}
                            className={`px-3 py-2 rounded border ${source === 'zendesk' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300'}`}
                        >
                            젠데스크
                        </button>
                        <button
                            type="button"
                            onClick={() => setSource('channel')}
                            className={`px-3 py-2 rounded border ${source === 'channel' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300'}`}
                        >
                            채널톡
                        </button>
                    </div>
                </div>
                <label className="flex flex-col min-w-64">
                    <span className="text-gray-600">태그</span>
                    <select className="select" value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} disabled={options.length === 0}>
                        <option value="">(태그 선택)</option>
						<option value={ALL_TAG_VALUE}>{ALL_TAG_LABEL}</option>
                        {options.map((o, i) => (
                            <option key={`${o.inquiry_type}-${i}`} value={o.inquiry_type}>{o.inquiry_type}</option>
                        ))}
                    </select>
                </label>
                <button disabled={!canSearch || loading} className="btn-outline disabled:opacity-50" onClick={loadInquiryOptions}>전체 태그 검색</button>
                <button disabled={!canAnalyze || loading} className="btn-outline disabled:opacity-50" onClick={() => loadTexts()}>선택 태그 검색</button>
                <button disabled={!canAnalyze || loading} className="btn-outline disabled:opacity-50" onClick={analyzeWithGPT}>문의내용 요약</button>
				<button disabled={!canDownload || exporting} className="btn-outline disabled:opacity-50" onClick={downloadExcel}>
					{exporting ? '다운로드 중...' : '엑셀 다운로드'}
				</button>
            </div>

            {showResults && (
				<div className="card overflow-hidden">
					<table className="table-card">
						<thead className="thead"><tr><th className="p-2">문의 일시</th><th className="p-2">태그</th><th className="p-2">병원명</th><th className="p-2">내용</th></tr></thead>
                        <tbody>
                            {items.map((r, idx) => (
                                <tr key={idx} className="border-t align-top hover:bg-gray-50/60">
									<td className="p-2">{formatDate(r.created_at)}</td>
									<td className="p-2">{normalizeType(String(r.inquiry_type ?? ''))}</td>
									<td className="p-2">{r.ticket_name ?? r.ticket_id}</td>
                                    <td className="p-2 whitespace-pre-wrap break-words max-w-[64rem]">{r.text_value}</td>
                                </tr>
                            ))}
                            {items.length === 0 && (
								<tr><td colSpan={4} className="p-6 text-center text-gray-500">{loading ? '로딩 중...' : (error || '검색 결과가 없습니다.')}</td></tr>
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
						<div className="text-sm space-y-3">
							<div className="font-medium">주요 테마</div>
							<ul className="space-y-4">
								{(summary.themes ?? []).map((t, i) => {
									const themeCountLabel = typeof t.count === 'number' ? `(${t.count}건)` : '';
									const evidences = sanitizeEvidenceList(t.evidence ?? []);
									return (
										<li key={i}>
											<div className="font-semibold">- {t.title}{themeCountLabel}</div>
											{evidences.length > 0 && (
												<ol className="list-decimal pl-6 text-gray-700 mt-2 space-y-1">
													{evidences.map((e, j) => (
														<li key={j}>
															<span>&lsquo;</span>
															{e}
															<span>&rsquo;</span>
														</li>
													))}
												</ol>
											)}
										</li>
									);
								})}
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
