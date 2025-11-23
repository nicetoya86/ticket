import { Suspense } from 'react';
import InquiriesClient from '@/components/InquiriesClient';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default function InquiriesPage() {
	return (
        <main className="container-page py-8">
            <div className="rounded-xl p-6 text-white shadow-card bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 space-y-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🧾</span>
                    <h1 className="text-2xl font-bold tracking-tight">문의내용 분석</h1>
                </div>
                <p className="text-sm text-white/90">GPT 전처리 기반으로 고객/매니저가 직접 남긴 텍스트만 보기 좋게 정리합니다.</p>
				<div className="bg-white/15 rounded-lg p-4 text-sm leading-relaxed">
					<p className="font-semibold text-white">[이용 방법]</p>
					<ol className="mt-2 list-decimal pl-5 space-y-1 text-white/90">
						<li>날짜와 채널을 선택한 뒤 [<strong>전체 태그 검색</strong>]으로 해당 날짜의 전체 데이터를 확인합니다.</li>
						<li>특정 태그만 보고 싶다면 태그를 골라 [<strong>선택 태그 검색</strong>]을 실행합니다.</li>
						<li>검색된 결과를 요약하려면 [<strong>문의내용 요약</strong>]을 눌러 자주 물어보는 내용을 확인합니다.</li>
						<li>필요하면 [<strong>엑셀 다운로드</strong>]로 문의 일시·태그·병원명·내용을 내려받습니다.</li>
					</ol>
				</div>
            </div>
            <div className="h-6" />
			<Suspense fallback={null}>
				<InquiriesClient />
			</Suspense>
		</main>
	);
}


