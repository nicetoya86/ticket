"use client";

import { useEffect, useMemo, useState } from 'react';

function fmtDate(s?: string) {
    if (!s) return '-';
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function stripBotLines(s: string): string {
    const noRef = String(s ?? '').replace(/(^|\n)\s*\\\d+:?\s*/g, '$1');
    const lines = noRef.split('\n');
    const kept = lines.filter((ln) => {
        const l = ln.trim();
        if (/^(\(\d{1,2}:\d{2}:\d{2}\)\s*)?여신BOT\b/i.test(l)) return false;
        if (/여신BOT님이\s*업로드함/i.test(l)) return false;
        return true;
    });
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default function TicketJsonPage({ params }: { params: { id: string } }) {
    const id = params.id;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/zendesk/ticket?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!ignore) setData(json);
            } catch (e: any) {
                if (!ignore) setError(e.message ?? 'failed');
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [id]);

    const ticket = data?.ticket;
    const comments = data?.comments ?? [];

    const inquiryTypes = useMemo(() => {
        if (!ticket?.custom_fields) return [] as string[];
        const vals: string[] = [];
        for (const f of ticket.custom_fields as Array<{ id: number; value: any }>) {
            if (Array.isArray(f?.value)) vals.push(...(f.value.filter((v: any) => typeof v === 'string') as string[]));
        }
        return Array.from(new Set(vals));
    }, [ticket]);

    const cleanedComments = useMemo(() => {
        return (comments ?? [])
            .map((c: any) => ({ ...c, _clean: stripBotLines(c.plain_body || c.body || '') }))
            .filter((c: any) => c._clean && c._clean.trim().length > 0);
    }, [comments]);

    return (
        <main className="container-page py-8 space-y-6">
            <h1 className="text-xl font-semibold">티켓 #{id} 상세</h1>
            {loading && <div className="text-gray-600">로딩 중...</div>}
            {error && <div className="text-red-600">{error}</div>}

            {ticket && (
                <>
                    <div className="card p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div>
                                <div className="text-gray-500">제목</div>
                                <div className="font-medium">{ticket.subject || '-'}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">상태</div>
                                <div className="font-medium">{ticket.status || '-'}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">유형</div>
                                <div className="font-medium">{ticket.type || '-'}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">채널</div>
                                <div className="font-medium">{ticket?.via?.channel || '-'}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">생성일</div>
                                <div className="font-medium">{fmtDate(ticket.created_at)}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">업데이트</div>
                                <div className="font-medium">{fmtDate(ticket.updated_at)}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">요청자 ID</div>
                                <div className="font-medium">{ticket.requester_id ?? '-'}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">담당자 ID</div>
                                <div className="font-medium">{ticket.assignee_id ?? '-'}</div>
                            </div>
                            <div className="md:col-span-2">
                                <div className="text-gray-500">태그</div>
                                <div className="font-medium">{(ticket.tags ?? []).join(', ') || '-'}</div>
                            </div>
                            {inquiryTypes.length > 0 && (
                                <div className="md:col-span-2">
                                    <div className="text-gray-500">문의유형</div>
                                    <div className="font-medium">{inquiryTypes.join(', ')}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="card overflow-hidden">
                        <table className="table-card">
                            <thead className="thead"><tr><th className="p-2 text-left w-40">필드 ID</th><th className="p-2 text-left">값</th></tr></thead>
                            <tbody>
                                {(ticket.custom_fields ?? []).map((f: any) => {
                                    const v = Array.isArray(f?.value) ? f.value.join(', ') : String(f?.value ?? '');
                                    return (
                                        <tr key={f.id} className="border-t">
                                            <td className="p-2">{f.id}</td>
                                            <td className="p-2">{v || '-'}</td>
                                        </tr>
                                    );
                                })}
                                {(!ticket.custom_fields || ticket.custom_fields.length === 0) && (
                                    <tr><td colSpan={2} className="p-4 text-center text-gray-500">커스텀 필드가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="card overflow-hidden">
                        <table className="table-card">
                            <thead className="thead"><tr><th className="p-2 text-left w-48">작성일시</th><th className="p-2 text-left w-28">작성자</th><th className="p-2 text-left w-28">공개여부</th><th className="p-2 text-left">내용</th></tr></thead>
                            <tbody>
                                {cleanedComments.map((c: any) => (
                                    <tr key={c.id} className="border-t align-top">
                                        <td className="p-2 text-gray-600">{fmtDate(c.created_at)}</td>
                                        <td className="p-2">{c.author_id}</td>
                                        <td className="p-2">{String(c.public)}</td>
                                        <td className="p-2"><pre className="whitespace-pre-wrap break-words text-[13px] leading-5">{c._clean}</pre></td>
                                    </tr>
                                ))}
                                {cleanedComments.length === 0 && (
                                    <tr><td colSpan={4} className="p-4 text-center text-gray-500">표시할 고객/매니저 코멘트가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </main>
    );
}

