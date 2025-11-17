import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const inquiryTypeParam = searchParams.get('inquiryType') ?? '';
	const status = searchParams.get('status') ?? '';
	const source = searchParams.get('source') ?? '';

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);

	function normalizeType(v: string): string {
		const s = (v ?? '').trim();
		try {
			if (/^\s*\[/.test(s)) {
				const parsed = JSON.parse(s);
				if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') return String(parsed[0]).trim();
			}
		} catch {}
		return s;
	}
	const inquiryType = normalizeType(inquiryTypeParam);

	// Pull grouped texts (speaker-aware blocks) for the target type
	const q1 = await supabaseAdmin.rpc('inquiries_texts_grouped_by_ticket', {
		p_from: fromDate,
		p_to: toDate,
		p_field_title: '문의유형(고객)',
		p_status: status ?? ''
	});
	if (q1.error) {
		console.error('[inquiries/analyze] rpc error:', q1.error.message);
		return NextResponse.json({ summary: '', themes: [], actions: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
	}
	const rows = (q1.data ?? []).filter((r: any) => normalizeType(String(r?.inquiry_type ?? '')) === inquiryType);

	// Extract only customer-authored text from aggregated blocks
	function extractCustomerText(block: string): string {
		const lines = String(block ?? '').split('\n');
		const isBotName = (name: string) => /(여신BOT|\bBOT\b)/i.test(name);
		const isAgentName = (name: string) => /(매니저|Manager|관리자|Agent|상담사)/i.test(name) || /^[가-힣]{2,4}$/.test(name);
		const isUserName = (name: string) => /(iOS|Android|Web)\s*User|End[\s-]*user|Visitor|고객|사용자|유저|손님/i.test(name);
		let current: 'customer' | 'agent' | 'bot' | null = null;
		const out: string[] = [];
		for (const raw of lines) {
			const line = String(raw ?? '');
			const m = line.match(/^\s*(?:\(\d{1,2}:\d{2}:\d{2}\)\s*)?([^:]+):\s*(.*)$/);
			if (m) {
				const name = m[1].trim();
				const text = m[2];
				if (isBotName(name)) { current = 'bot'; continue; }
				if (isAgentName(name)) { current = 'agent'; continue; }
				if (isUserName(name)) { current = 'customer'; } else { current = 'agent'; continue; }
				out.push(text);
				continue;
			}
			if (current === 'customer') out.push(line);
		}
		return out.join('\n');
	}

	const blocks: string[] = rows.map((r: any) => String(r.text_value ?? ''));
	const hasSpeakerPrefixes = blocks.some((b) => /^[^:\n]+:/m.test(b));
	const customerText = hasSpeakerPrefixes
		? blocks.map((b) => extractCustomerText(b)).join('\n')
		: blocks.join('\n');
	const text = customerText.slice(0, 16000);

	if (env.OPENAI_API_KEY && text.trim()) {
		try {
			const resp = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: '너는 한국어 CS 분석가야. 고객 텍스트를 읽고 핵심 이슈/원인/개선 액션을 요약해.' },
						{ role: 'user', content: `문의유형: ${inquiryType}\n\n아래 고객 텍스트를 분석해 주세요.\n출력 JSON 형식:\n{"summary":"...", "themes":[{"title":"...","evidence":["...","..."]}], "actions":["...","..."]}\n텍스트:\n${text}` }
					],
					temperature: 0.2
				})
			});
			if (resp.ok) {
				const j = await resp.json();
				const content = j?.choices?.[0]?.message?.content ?? '';
				const match = content.match(/\{[\s\S]*\}$/);
				if (match) {
					const parsed = JSON.parse(match[0]);
					return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
				}
			}
		} catch (e) {
			console.error('[inquiries/analyze] OpenAI error', (e as any)?.message ?? e);
		}
	}

	// Fallback simple summary
	const fallback = {
		summary: '고객 텍스트를 바탕으로 요약을 생성할 수 없습니다. 데이터가 부족하거나 분석이 비활성화되었습니다.',
		themes: [] as any[],
		actions: [] as string[]
	};
	return NextResponse.json(fallback, { headers: { 'Cache-Control': 'no-store' } });
}


