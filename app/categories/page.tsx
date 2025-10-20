import { CategoriesTable } from '@/components/CategoriesTable';
import { FilterBar } from '@/components/FilterBar';
import { Suspense } from 'react';

export default function CategoriesPage() {
	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">카테고리</h1>
			<p className="mt-3 text-gray-600">카테고리별 집계를 표시합니다.</p>
			<Suspense fallback={null}>
				<FilterBar />
			</Suspense>
			<Suspense fallback={null}>
				<CategoriesTable />
			</Suspense>
		</main>
	);
}
