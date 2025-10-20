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
