import { InteractionsList } from '@/components/InteractionsList';
import { FilterBar } from '@/components/FilterBar';
import { Suspense } from 'react';

export default function InteractionsPage() {
	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">드릴다운</h1>
			<p className="mt-3 text-gray-600">원문 리스트와 페이지네이션을 제공합니다.</p>
			<Suspense fallback={null}>
				<FilterBar />
			</Suspense>
			<Suspense fallback={null}>
				<InteractionsList />
			</Suspense>
		</main>
	);
}
