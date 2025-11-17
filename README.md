# CS 분석 대시보드 (Zendesk/Channel)

## 배포
- Vercel에 새로운 프로젝트로 연결 후 자동 빌드됩니다.
- `vercel.json`의 크론에 따라 정기 호출됩니다.

## 환경변수 (Vercel Project Settings > Environment Variables)
- 필수: `SUPABASE_URL` 또는 `SUPABASE_PROJECT_ID` 중 하나, 그리고 `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`
- 설명: `SUPABASE_PROJECT_ID`(예: `ugvnqlhvrmihezrdchal`)만 제공해도 내부에서 `https://<PROJECT_ID>.supabase.co`로 URL이 자동 유도됩니다. 두 값을 모두 줄 경우 서로 일치해야 합니다.
- 선택(지금은 비워둬도 됨): `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, `CHANNEL_ACCESS_KEY`, `CHANNEL_ACCESS_SECRET`
- 선택: `DB_URL`

> 젠데스크/채널톡 연동을 활성화하기 전까지 선택 항목을 비워도 앱이 오류 없이 동작합니다.

## 데이터베이스
- `supabase/migrations`의 SQL을 Supabase에 적용하세요. (CLI 또는 대시보드)
- `supabase/seed`는 초기 카테고리용 샘플입니다.

## API 개요
- GET `/api/health`
- GET `/api/categories`, POST `/api/categories`
- GET `/api/label-mappings`, POST `/api/label-mappings`
- GET `/api/stopwords`, POST `/api/stopwords`
- GET `/api/stats/overview` (query: from, to, source[])
- GET `/api/stats/categories` (query: from, to, source[], categoryId[])
- GET `/api/stats/heatmap` (query: from, to, source[]) → DB 함수 `unified_interactions_heatmap` 호출
- GET `/api/keywords/top` (query: from, to, source[], categoryId[], metric, limit)
- GET `/api/interactions` (query: from, to, source[], categoryId[], q, exclude[], page, pageSize)

## 잡/크론
- GET/POST `/api/jobs/ingest`: 증분 수집 + 집계 트리거 (현재는 no-op 스켈레톤)
- GET/POST `/api/jobs/keywords`: 키워드 파이프라인 (현재는 스켈레톤)
- 크론 스케줄(`vercel.json`)
  - `/api/health`: `*/10 * * * *`
  - `/api/jobs/ingest`: `*/15 * * * *`
  - `/api/jobs/keywords`: `0 * * * *`

## 개발 메모
- PRD의 나머지 엔드포인트/워커/웹훅은 후속으로 추가합니다.
- 서버 전용 키는 API 핸들러에서 직접 사용하지 않도록 주의하세요.

## Zendesk 연동
- 환경변수(Production)
  - `ZENDESK_SUBDOMAIN` (예: yeoshin)
  - `ZENDESK_EMAIL` (예: cs@fastlane.kr)
  - `ZENDESK_API_TOKEN` (Zendesk API Token)
- 증분 수집
  - 수동 트리거: `GET /api/jobs/ingest`
  - 최초 체크포인트가 없으면 최근 7일 기준으로 수집합니다.
- 일별 집계
  - 수동 트리거: `GET /api/jobs/ingest` 실행 시 자동 포함 (또는 DB 함수 `upsert_stats_daily`)
- 주의
  - 서버 런타임: jobs 엔드포인트는 Node.js 런타임을 사용합니다.
  - 크론 스케줄에 따라 자동 호출됩니다. (15분 간격)
