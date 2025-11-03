import { Suspense } from 'react';
import KeywordsClient from '@/components/KeywordsClient2';

export default function PhrasesPage() {
    return (
        <main className="container-page py-8">
            <div className="rounded-xl p-6 text-white shadow-card bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">📝</span>
                    <h1 className="text-2xl font-bold tracking-tight">문의 내용 분석</h1>
                </div>
                <p className="mt-2 text-sm text-white/90">날짜와 채널, 문의유형을 선택하면 고객들이 자주 물어보는 내용을 빈도순으로 보여드립니다.</p>
            </div>
            <div className="h-6" />
            <Suspense fallback={null}>
                <KeywordsClient initialTab="phrases" />
            </Suspense>
        </main>
    );
}


