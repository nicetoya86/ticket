const RAW_EXCLUDED_TAGS = [
	'ob_결제취소안내',
	'ob_방문완료롤백',
	'ob_후기소명안내',
	'테스트',
	'기타/ob_결제취소안내',
	'기타/ob_방문완료롤백',
	'기타/ob_후기소명안내',
	'기타/테스트',
];

export const EXCLUDED_INQUIRY_TAGS = new Set<string>(RAW_EXCLUDED_TAGS);

export function normalizeInquiryType(value: any): string {
	const raw = String(value ?? '').trim();
	if (!raw) return '';
	if (/^\s*\[/.test(raw)) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
				return String(parsed[0]).trim();
			}
		} catch {}
	}
	return raw;
}

export function isExcludedInquiryType(value?: string | null): boolean {
	const normalized = normalizeInquiryType(value ?? '');
	return normalized.length > 0 && EXCLUDED_INQUIRY_TAGS.has(normalized);
}

export function isAllowedInquiryType(value?: string | null): boolean {
	const normalized = normalizeInquiryType(value ?? '');
	if (!normalized) return false;
	if (normalized.startsWith('병원_')) return false;
	return !EXCLUDED_INQUIRY_TAGS.has(normalized);
}

export function getAllowedInquiryType(value: any): string | null {
	const normalized = normalizeInquiryType(value);
	return isAllowedInquiryType(normalized) ? normalized : null;
}




