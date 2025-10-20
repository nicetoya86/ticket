import { KeywordsList } from '@/components/KeywordsList';
import { FilterBar } from '@/components/FilterBar';

export default function KeywordsPage() {
	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">키워드</h1>
			<p className="mt-3 text-gray-600">상위 키워드를 표시합니다.</p>
			<FilterBar />
			<KeywordsList />
		</main>
	);
}
