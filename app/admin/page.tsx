import Link from 'next/link';

export default function AdminPage() {
	return (
		<main className="max-w-6xl mx-auto px-6 py-8">
			<h1 className="text-xl font-semibold">관리자</h1>
			<ul className="mt-4 list-disc list-inside space-y-2 text-blue-700">
				<li><Link href="/admin/categories">카테고리 관리</Link></li>
				<li><Link href="/admin/label-mappings">라벨 매핑</Link></li>
				<li><Link href="/admin/stopwords">불용어 관리</Link></li>
			</ul>
		</main>
	);
}
