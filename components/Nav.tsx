"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
	{ href: '/categories', label: '카테고리' },
	{ href: '/keywords', label: '키워드' },
	{ href: '/inquiries', label: '문의유형' },
	{ href: '/admin', label: '관리자' },
];

export function Nav() {
	const pathname = usePathname();
	return (
		<nav className="border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 sticky top-0 z-40">
			<div className="max-w-6xl mx-auto px-6 h-12 flex items-center gap-2">
				<Link href="/" className="mr-2 text-sm font-semibold px-2 py-1 rounded hover:bg-gray-50">CS 대시보드</Link>
				{links.map((l) => (
					<Link key={l.href} href={l.href} className={pathname === l.href ? 'font-semibold bg-gray-100 text-gray-900 rounded px-2 py-1' : 'text-gray-600 hover:text-gray-900 rounded px-2 py-1'}>
						{l.label}
					</Link>
				))}
			</div>
		</nav>
	);
}
