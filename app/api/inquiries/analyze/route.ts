import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ClientRow = {
	created_at?: string;
	ticket_name?: string | null;
	ticket_id?: number | string;
	text_value?: string;
};

const fallbackResponse = {
	summary: '요약을 생성할 데이터를 찾지 못했습니다.',
	themes: [] as Array<{ title: string; evidence?: string[]; count?: number }>,
	actions: [] as string[]
};

const normalizeType = (v: string): string => {
	const s = (v ?? '').trim();
	try {
		if (/^\s*\[/.test(s)) {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') return String(parsed[0]).trim();
		}
	} catch {}
	return s;
};

const formatDate = (value?: string | number | null): string => {
	if (value == null) return '';
	if (typeof value === 'number' && Number.isFinite(value)) {
		try {
			const date = new Date(value);
			if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
		} catch {}
	}
	const str = String(value).trim();
	if (!str) return '';
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
	const parsed = Date.parse(str);
	if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
	return str;
};

const buildPromptDataset = (rows: ClientRow[]): { text: string; total: number } => {
	const cleaned = rows
		.map((row, idx) => ({
			index: idx + 1,
			date: formatDate(row.created_at),
			hospital: String(row.ticket_name ?? row.ticket_id ?? '').trim() || '병원명 미확인',
			text: String(row.text_value ?? '').replace(/\s+/g, ' ').trim()
		}))
		.filter((row) => row.text.length > 0);
	const MAX_RECORDS = 200;
	const MAX_CHARS = 12000;
	const MAX_PER_RECORD = 600;
	const limited: typeof cleaned = [];
	let budget = 0;
	for (const row of cleaned.slice(0, MAX_RECORDS)) {
		const trimmedText = row.text.length > MAX_PER_RECORD ? `${row.text.slice(0, MAX_PER_RECORD)} …` : row.text;
		const chunk = `[${row.index}] (${row.date || '날짜 미확인'}) ${row.hospital}\n${trimmedText}\n`;
		if (chunk.length > MAX_CHARS && limited.length === 0) {
			limited.push({
				...row,
				text: `${row.text.slice(0, MAX_CHARS - 20)} …`
			});
			budget = MAX_CHARS;
			break;
		}
		if (budget + chunk.length > MAX_CHARS) break;
		limited.push({
			...row,
			text: trimmedText
		});
		budget += chunk.length;
	}
	if (limited.length === 0 && cleaned.length > 0) {
		limited.push({
			...cleaned[0],
			text: `${cleaned[0].text.slice(0, MAX_CHARS - 20)} …`
		});
	}
	const text = limited
		.map((row) => `[${row.index}] (${row.date || '날짜 미확인'}) ${row.hospital}\n${row.text}`)
		.join('\n---\n');
	return { text, total: cleaned.length };
};

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	const inquiryTypeParam = searchParams.get('inquiryType') ?? '';
	const status = searchParams.get('status') ?? '';
	const source = searchParams.get('source') ?? '';

	const fromDate = from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
	const toDate = to ?? new Date().toISOString().slice(0, 10);

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

	const sortedRows: ClientRow[] = [...rows]
		.map((row: any) => ({
			created_at: row?.created_at,
			ticket_name: row?.ticket_name ?? row?.name ?? null,
			ticket_id: row?.ticket_id ?? row?.id ?? null,
			text_value: extractCustomerText(String(row?.text_value ?? '')) || String(row?.text_value ?? '')
		}))
		.sort((a, b) => String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? '')));
	const datasetForGet = buildPromptDataset(sortedRows);

	if (env.OPENAI_API_KEY && datasetForGet.text.trim()) {
		const systemPrompt = '너는 한국어 CS 데이터 분석가야. 동일한 데이터에 대해서는 항상 같은 결과를 내도록 일관되고 객관적으로 정리해.';
		const userPrompt = [
			`문의유형: ${inquiryType || '(미지정)'}`,
			`기간: ${from || '시작일 미지정'} ~ ${to || '종료일 미지정'}`,
			`총 레코드 수: ${datasetForGet.total}`,
			'아래 데이터는 고객이 남긴 실제 문의 텍스트 전체다. 동일/유사한 내용을 묶어 "자주 물어보는 내용" 목록을 만들어라.',
			'규칙:',
			'- 데이터에 존재하지 않는 가정/추측 금지',
			'- 각 주제별로 등장한 건수를 count 정수로 적고, count 내림차순으로 정렬',
			'- summary, title, evidence 어디에도 병원명/개인정보를 적지 마라',
			'- evidence에는 관련 레코드 번호와 짧은 인용 1~2개만 넣어라 (예: "[3] 추가 계정 생성이 무슨 말이에요?")',
			'- JSON만 출력',
			'응답 JSON 형태:',
			'{"summary":"...", "themes":[{"title":"주제명","count":정수,"evidence":["[번호] 인용", ...]}], "actions":[]}',
			'데이터:',
			datasetForGet.text
		].join('\n');
		try {
			const resp = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					temperature: 0,
					top_p: 0.1,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					]
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

export async function POST(req: Request) {
	let payload: { rows?: ClientRow[]; inquiryType?: string; from?: string; to?: string } = {};
	try {
		payload = await req.json();
	} catch {
		return NextResponse.json(fallbackResponse, { headers: { 'Cache-Control': 'no-store' } });
	}
	const rows = Array.isArray(payload.rows) ? payload.rows : [];
	if (rows.length === 0) {
		return NextResponse.json(fallbackResponse, { headers: { 'Cache-Control': 'no-store' } });
	}

	const inquiryType = normalizeType(String(payload.inquiryType ?? ''));
	const fromDate = payload.from ?? '';
	const toDate = payload.to ?? '';
	const dataset = buildPromptDataset(rows);
	if (!dataset.text) {
		return NextResponse.json(fallbackResponse, { headers: { 'Cache-Control': 'no-store' } });
	}

	if (!env.OPENAI_API_KEY) {
		return NextResponse.json({
			summary: 'OpenAI API Key가 설정되지 않아 GPT 요약을 실행할 수 없습니다.',
			themes: [],
			actions: []
		}, { headers: { 'Cache-Control': 'no-store' } });
	}

	const systemPrompt = '너는 한국어 CS 데이터 분석가야. 고객 문의 텍스트를 기반으로 실제로 반복된 질문만 추려서 정량 요약해야 해.';
	const userPrompt = [
		`문의유형: ${inquiryType || '(미지정)'}`,
		`기간: ${fromDate || '시작일 미지정'} ~ ${toDate || '종료일 미지정'}`,
		`총 레코드 수: ${dataset.total}`,
		'아래 데이터는 고객이 남긴 실제 문의 텍스트다. 동일/유사한 내용을 묶어 "자주 물어보는 내용" 목록을 만들어라.',
		'규칙:',
		'- 데이터에 존재하지 않는 가정/추측 금지',
		'- 각 주제별로 등장한 건수를 count 정수로 적고, count 내림차순으로 정렬',
		'- summary, title, evidence 어디에도 병원명/개인정보를 적지 마라',
		'- evidence에는 관련 레코드 번호와 짧은 인용 1~2개만 넣어라 (예: "[3] 추가 계정 생성이 무슨 말이에요?")',
		'- JSON만 출력',
		'응답 JSON 형태:',
		'{"summary":"...", "themes":[{"title":"주제명","count":정수,"evidence":["[번호] 병원: 인용"]}], "actions":[]}',
		'데이터:',
		dataset.text
	].join('\n');

	try {
		const resp = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				temperature: 0,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				]
			})
		});
		if (resp.ok) {
			const data = await resp.json();
			const content = data?.choices?.[0]?.message?.content ?? '';
			if (content) {
				try {
					const parsed = JSON.parse(content);
					if (parsed?.themes && Array.isArray(parsed.themes)) {
						parsed.themes = parsed.themes
							.map((t: any) => ({
								title: String(t?.title ?? '').trim(),
								count: Number.isFinite(Number(t?.count)) ? Number(t.count) : undefined,
								evidence: Array.isArray(t?.evidence) ? t.evidence.slice(0, 4) : []
							}))
							.filter((t: any) => t.title);
					}
					const themes = parsed?.themes ?? [];
					const summaryLines = [
						`${themes.length}개의 주요 문의 유형이 반복되고 있습니다.`,
						'자주 물어보는 내용:',
						...themes.slice(0, 5).map((theme: any, idx: number) => {
							const title = String(theme?.title ?? '').trim();
							const countLabel = Number.isFinite(Number(theme?.count)) ? `${theme.count}건` : '여러 건';
							const sample = Array.isArray(theme?.evidence) && theme.evidence.length > 0 ? ` 예: ${theme.evidence[0]}` : '';
							return `${idx + 1}. ${title} (${countLabel})${sample}`;
						})
					].filter(Boolean);
					parsed.summary = summaryLines.join('\n');
					return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
				} catch {
					const match = content.match(/\{[\s\S]*\}/);
					if (match) {
						try {
							const parsed = JSON.parse(match[0]);
							return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
						} catch {}
					}
				}
			}
		}
	} catch (error) {
		console.error('[inquiries/analyze] POST OpenAI error:', (error as any)?.message ?? error);
	}

	return NextResponse.json(fallbackResponse, { headers: { 'Cache-Control': 'no-store' } });
}


