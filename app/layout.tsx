import './globals.css';
import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
	title: 'CS 분석 대시보드',
	description: 'Zendesk/Channel 통합 CS 카테고리/키워드 분석'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="ko">
			<body className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 antialiased">
				<Nav />
				{children}
			</body>
		</html>
	);
}
