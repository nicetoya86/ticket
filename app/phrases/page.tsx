import { redirect } from 'next/navigation';

export default function PhrasesPage() {
    // 이 페이지는 키워드 메뉴 내 탭 제거로 더 이상 사용하지 않음 → 키워드로 리다이렉트
    redirect('/keywords');
}


