"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function FilterBar() {
	const router = useRouter();
	const pathname = usePathname();
	const sp = useSearchParams();

	const from = sp.get('from') ?? '';
	const to = sp.get('to') ?? '';
	const sources = new Set(sp.getAll('source[]'));

	const update = useCallback((patch: Record<string, string | null | string[]>) => {
		const params = new URLSearchParams(sp.toString());
		for (const [k, v] of Object.entries(patch)) {
			if (Array.isArray(v)) {
				params.delete(k);
				v.forEach((item) => params.append(k, item));
			} else if (v === null || v === '') {
				params.delete(k);
			} else {
				params.set(k, v);
			}
		}
		router.push(`${pathname}?${params.toString()}`);
	}, [router, pathname, sp]);

	return (
		<div className="mt-4 p-3 border bg-white rounded-md flex flex-wrap items-center gap-3 text-sm">
			<label className="flex items-center gap-2">
				<span className="text-gray-600">From</span>
				<input type="date" value={from} onChange={(e) => update({ from: e.target.value || null })} className="border rounded px-2 py-1" />
			</label>
			<label className="flex items-center gap-2">
				<span className="text-gray-600">To</span>
				<input type="date" value={to} onChange={(e) => update({ to: e.target.value || null })} className="border rounded px-2 py-1" />
			</label>
			<div className="flex items-center gap-2">
				<span className="text-gray-600">Source</span>
				<label className="flex items-center gap-1">
					<input type="checkbox" checked={sources.has('zendesk')} onChange={(e) => {
						const next = new Set(sources);
						if (e.target.checked) next.add('zendesk'); else next.delete('zendesk');
						update({ 'source[]': Array.from(next) });
					}} />
					<span>zendesk</span>
				</label>
				<label className="flex items-center gap-1">
					<input type="checkbox" checked={sources.has('channel')} onChange={(e) => {
						const next = new Set(sources);
						if (e.target.checked) next.add('channel'); else next.delete('channel');
						update({ 'source[]': Array.from(next) });
					}} />
					<span>channel</span>
				</label>
			</div>
		</div>
	);
}
