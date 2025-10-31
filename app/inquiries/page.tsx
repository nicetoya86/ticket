import { Suspense } from 'react';
import InquiriesClient from '@/components/InquiriesClient';

export default function InquiriesPage() {
	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">문의유형</h1>
			<Suspense fallback={null}>
				<InquiriesClient />
			</Suspense>
		</main>
	);
}


