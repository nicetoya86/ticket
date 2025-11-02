import { Suspense } from 'react';
import InquiriesClient from '@/components/InquiriesClient';

export default function InquiriesPage() {
	return (
        <main className="container-page py-8">
            <div className="rounded-xl p-6 text-white shadow-card bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🧾</span>
                    <h1 className="text-2xl font-bold tracking-tight">문의유형 분석</h1>
                </div>
                <p className="mt-2 text-sm text-white/90">GPT 전처리 기반으로 고객/매니저가 직접 남긴 텍스트만 보기 좋게 정리합니다.</p>
            </div>
            <div className="h-6" />
			<Suspense fallback={null}>
				<InquiriesClient />
			</Suspense>
		</main>
	);
}


