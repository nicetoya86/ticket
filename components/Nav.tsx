"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
	{ href: '/', label: '개요' },
	{ href: '/categories', label: '카테고리' },
	{ href: '/keywords', label: '키워드' },
	{ href: '/interactions', label: '드릴다운' },
	{ href: '/inquiries', label: '문의유형' },
	{ href: '/admin', label: '관리자' },
];

export function Nav() {
	const pathname = usePathname();
	return (
		<nav className="border-b bg-white">
			<div className="max-w-6xl mx-auto px-6 h-12 flex items-center gap-6">
				{links.map((l) => (
					<Link key={l.href} href={l.href} className={pathname === l.href ? 'font-semibold' : 'text-gray-600 hover:text-gray-900'}>
						{l.label}
					</Link>
				))}
			</div>
		</nav>
	);
}
