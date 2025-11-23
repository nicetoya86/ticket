export function normalizeKorean(text: string): string {
	return text.normalize('NFKC');
}

export function stripHtml(text: string): string {
	return text.replace(/<[^>]+>/g, ' ');
}

export function maskPII(text: string): string {
	return text
		.replace(/\b\d{10,16}\b/g, '****') // account/phone-ish
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '***@***')
		.replace(/https?:\/\/\S+/gi, '[link]');
}

export function tokenize(text: string): string[] {
	const t = normalizeKorean(stripHtml(text)).toLowerCase();
	return t
		.replace(/[^a-z0-9가-힣\s]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const HANGUL_SYLLABLE = 588;
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('ko', { sensitivity: 'base' }) : undefined;

function getChoseongChar(ch: string): string {
	if (!ch) return '';
	const code = ch.charCodeAt(0);
	if (code >= HANGUL_BASE && code <= HANGUL_END) {
		const index = Math.floor((code - HANGUL_BASE) / HANGUL_SYLLABLE);
		return CHOSEONG[index] ?? ch;
	}
	if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
	if (/\d/.test(ch)) return ch;
	return ch;
}

export function toChoseongKey(text: string): string {
	const normalized = (text ?? '').trim();
	if (!normalized) return '~~';
	const nfc = normalized.normalize('NFC');
	let acc = '';
	for (const ch of nfc) {
		acc += getChoseongChar(ch);
	}
	return `${acc}|${nfc}`.trim();
}

export function compareByChoseong(a: string, b: string): number {
	const keyA = toChoseongKey(a);
	const keyB = toChoseongKey(b);
	if (keyA === keyB) {
		if (collator) return collator.compare(a, b);
		return a.localeCompare(b);
	}
	if (collator) return collator.compare(keyA, keyB);
	return keyA.localeCompare(keyB);
}

export function sortByChoseong<T>(items: T[], selector: (item: T) => string): T[] {
	return [...items].sort((a, b) => compareByChoseong(selector(a) ?? '', selector(b) ?? ''));
}