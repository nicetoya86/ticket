import { NextResponse } from 'next/server';

export async function GET() {
	// 간단한 상태 확인; 추후 ingestion 지연 계산 로직 연결 예정
	return NextResponse.json({ status: 'ok', ingestionLagSec: 0 });
}
