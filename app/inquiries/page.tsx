import { Suspense } from 'react';
import InquiriesClient from '@/components/InquiriesClient';

export default function InquiriesPage() {
	return (
		<main className="container-page py-8">
			<h1 className="text-2xl font-bold tracking-tight">문의유형</h1>
			<p className="mt-1 text-sm text-gray-600">고객/매니저가 직접 남긴 텍스트만 깔끔하게 확인하세요.</p>
			<Suspense fallback={null}>
				<InquiriesClient />
			</Suspense>
		</main>
	);
}


