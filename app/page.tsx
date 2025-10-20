import { OverviewStats } from '@/components/OverviewStats';
import { Heatmap } from '@/components/Heatmap';
import { FilterBar } from '@/components/FilterBar';
import { Suspense } from 'react';

export default function HomePage() {
	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-2xl font-semibold">개요</h1>
			<p className="mt-3 text-gray-600">최근 추이와 카테고리 TOP, 요일/시간대 히트맵을 표시합니다.</p>
			<Suspense fallback={null}>
				<FilterBar />
			</Suspense>
			<div className="mt-6">
				<Suspense fallback={null}>
					<OverviewStats />
				</Suspense>
				<Suspense fallback={null}>
					<Heatmap />
				</Suspense>
			</div>
		</main>
	);
}
