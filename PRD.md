### PRD: 젠데스크/채널톡 기반 CS 카테고리/키워드 분석 웹

- **목표**: 젠데스크(고객)과 채널톡(병원)의 상담 데이터를 통합해 공통 카테고리 관점의 인입 추이/비중과 자주 언급되는 키워드를 분석·시각화하는 대시보드 제공.
- **레퍼런스**
  - 젠데스크 API 레퍼런스: [Zendesk API Reference](https://developer.zendesk.com/api-reference/)
  - 채널톡 API 문서: [Channel.io API Docs](https://api-doc.channel.io/)
- **권장 스택**: 프론트엔드 React + TailwindCSS, 백엔드 API(Node/Next API Routes), DB(PostgreSQL/Supabase), 호스팅 Vercel.

### 1) 배경/문제 정의
- 고객 CS는 젠데스크, 병원 CS는 채널톡을 사용.
- 젠데스크는 `문의유형`(커스텀 필드), 채널톡은 `상담태그`로 라벨링.
- 상이한 라벨 체계로 인해 통합 분석 및 키워드 인사이트 도출이 어려움.

### 2) 목표/KPI
- **목표**
  - 공통 카테고리 체계로 두 소스를 통합.
  - 카테고리별 인입량/증감/비중, 키워드 랭킹·트렌드 제공.
  - 티켓·대화 원문 드릴다운과 CSV 내보내기.
- **KPI**
  - 라벨→카테고리 매핑 커버리지 ≥ 95%
  - 데이터 신선도 ≤ 15분(P95)
  - 동기화 실패율 ≤ 0.5%, 자동 재시도 성공률 ≥ 99%
  - 주간 활성 사용자 및 CSV 내보내기 횟수

### 3) 범위
- 포함: 데이터 수집(증분), 표준화, 카테고리 매핑 UI, 키워드 추출 파이프라인, 대시보드/드릴다운/CSV.
- 제외: ML 기반 자동 분류(후속), 알림/오토메이션(후속).

### 4) 사용자 시나리오
- CS 리더: 기간/카테고리 필터 → 상위 카테고리/증감 확인 → 급증 항목 키워드/샘플 검토 → CSV 공유.
- PM/운영: 특정 기능 관련 키워드 트렌드 → 릴리스 전후 비교 → 이슈 전달.

### 5) 데이터 소스 및 외부 API 연동 가이드
- **젠데스크(고객)**
  - 인증: API 토큰 또는 OAuth2.
  - 핵심 엔드포인트(예시): Incremental Tickets Cursor API, Tickets API, Ticket Fields API(‘문의유형’ 필드 조회), Ticket Comments API(본문 수집), Search API(백필 보조)
  - 문서: [Zendesk API Reference](https://developer.zendesk.com/api-reference/)
- **채널톡(병원)**
  - 인증: 서버용 Access Key/Secret.
  - 필요한 범주: Conversations(대화), Messages(메시지 본문), Tags(상담태그), 증분/페이지네이션
  - 문서: [Channel.io API Docs](https://api-doc.channel.io/)
- **웹훅(선택)**: 생성/업데이트 이벤트 실시간 수집(배치+웹훅 하이브리드로 신선도/쿼터 최적화).

### 6) 시스템 아키텍처(요약)
- 백엔드: 동기화 워커(스케줄러/큐), 레이트리밋 어댑터, 텍스트 파이프라인(정규화/토큰화/스코어링), 표준화·집계 테이블 생성.
- 프론트엔드: 대시보드(차트/표/필터), 드릴다운(원문 리스트), 관리자(카테고리/라벨 매핑, 불용어).
- 스토리지: 원천(raw) + 표준화(unified) + 집계(stats/keywords) 계층.

### 7) 데이터 모델/ERD(요약)
- 원천 테이블
  - `raw_zendesk_tickets`: id, created_at, updated_at, subject, description, requester_id, org_id, custom_fields(jsonb), tags(text[]), status, priority, channel, raw_json(jsonb)
  - `raw_zendesk_comments`: ticket_id, comment_id, author_id, created_at, body, raw_json
  - `raw_channel_conversations`: id, created_at, updated_at, assignee, participants(jsonb), tags(text[]), status, source, raw_json
  - `raw_channel_messages`: conversation_id, message_id, created_at, sender, text, attachments(jsonb), raw_json
- 표준화/운영 테이블
  - `unified_interactions`: source(enum: zendesk|channel), source_id, created_at, updated_at, title, body(text), requester, organization, labels(text[]), category_id, keywords(text[])
  - `categories`: category_id(pk), name, parent_id, active, sort_order
  - `label_mappings`: source, label, category_id, rule_version, confidence
  - `stats_daily`: date, category_id, source, count, wow, yoy
  - `keywords_daily`: date, category_id, source, keyword, freq, tfidf, rank
  - `ingestion_checkpoints`: source, checkpoint_type(cursor|timestamp), value, updated_at
  - `stopwords`: locale, token, active

### 8) 동기화 파이프라인
- 초기 백필: 최근 90~180일, 기간 분할+페이지네이션, 체크포인트 저장.
- 증분: 5~10분 주기 스케줄, cursor/updated_at 기준 수집, 지수 백오프 재시도.
- 웹훅(옵션): 생성/업데이트 이벤트 수신 → 큐로 원천 적재 → 표준화/집계 업데이트.
- 레이트리밋: 소스별 어댑터, 백오프, 지연 큐, 배치 크기 조절.
- 내결함성: 일시 오류 재시도, 부분 실패 감지/보완 잡, 경계값 모니터링.

### 9) 키워드 추출
- 전처리: HTML 제거, 이모지/URL/이메일/전화/계좌 정규화·마스킹, 한글 정규화.
- 토큰화: 명사 중심 + 복합명사, 한영혼용, bi-gram.
- 스코어링: 빈도 + TF-IDF, 최소 문서수/최소 길이/금칙어 필터.
- 민감정보: 저장 전 마스킹, UI 토글로 원문 노출 제한.

### 10) 대시보드 요구사항
- 필터: 기간, 소스(고객/병원), 카테고리(다중), 상태, 조직/담당, 키워드 포함/제외.
- 지표/차트: 인입 추이(일/주/월), 상위 카테고리, 파레토, 요일/시간대 히트맵, 급증 키워드.
- 드릴다운: 리스트(메타/하이라이트), 페이지네이션(200/페이지), PII 토글.
- 내보내기: CSV(요약/키워드/원문 선택).
- 관리자: 카테고리/매핑 CRUD, 불용어 관리, 파라미터(최소 발생수 등) 설정.

### 11) 보안/권한/컴플라이언스
- 비밀정보: 환경변수(Vercel) — ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN(or OAuth), CHANNEL_ACCESS_KEY, CHANNEL_ACCESS_SECRET, DB_URL, JWT_SECRET.
- 최소 권한: 읽기 전용 스코프, 가능 시 IP 제한.
- 접근 제어: 역할 기반(관리자/뷰어), 감사 로그.
- 데이터 보존: 원문 최소 보존 원칙, 마스킹 저장 옵션.

### 12) 성능/운영/관측성
- 젠데스크/채널톡 레이트리밋 준수, 큐·배치 제어.
- 관측성: 동기화 지연/오류율/처리량, 키워드 파이프라인 지표, 알림.

### 13) 테스트/릴리스/마일스톤
- 테스트: 샌드박스 연동, 매핑 정확도 표본검증, 키워드 품질 휴리스틱(노이즈/PII 탐지율), 부하 테스트.
- 릴리스: 단계적 공개(내부→CS 리더→전사), 운영 가이드.
- 마일스톤
  - M1(1주): 스키마/인프라, 젠데스크·채널톡 인증 및 백필 PoC
  - M2(1주): 증분 안정화, 매핑 UI, 기본 지표/차트
  - M3(1주): 키워드 파이프라인, 키워드 대시보드/드릴다운, CSV
  - M4(0.5주): 웹훅, 관측성/알림, 보안 점검
  - M5(0.5주): 프로덕션 롤아웃

### 14) 내부 백엔드 API 계약(요약)
- 인증: 세션/JWT + 역할(관리자/뷰어)
- 공통 쿼리: `from`, `to`, `source[]`, `categoryId[]`, `status[]`, `orgId[]`, `assignee[]`, `q`, `exclude[]`
- 엔드포인트 샘플

```json
{
  "GET /api/stats/overview": {
    "query": ["from","to","source[]"],
    "resp": { "totals": [{"date":"2025-10-01","count":123}], "byCategory": [{"categoryId":"pay","count":456}] }
  },
  "GET /api/stats/categories": {
    "query": ["from","to","source[]","categoryId[]"],
    "resp": [{ "categoryId":"ship","count":321,"wow":0.12,"yoy":0.35 }]
  },
  "GET /api/stats/heatmap": {
    "query": ["from","to","source[]"],
    "resp": [{ "dow":1,"hour":14,"count":27 }]
  },
  "GET /api/keywords/top": {
    "query": ["from","to","source[]","categoryId[]","metric=tfidf|freq","limit=50"],
    "resp": [{ "keyword":"환불","score":0.432,"freq":87,"trend":[5,7,12,20]}]
  },
  "GET /api/interactions": {
    "query": ["from","to","source[]","categoryId[]","q","exclude[]","status[]","page","pageSize"],
    "resp": { "items": [{ "source":"zendesk", "sourceId":"12345", "createdAt":"2025-10-01T10:00:00Z", "title":"환불 문의", "body":"...", "labels":["결제/환불"], "categoryId":"pay", "keywords":["환불","카드취소"] }], "total": 2456 }
  },
  "GET /api/categories": { "resp": [{ "categoryId":"pay","name":"결제/환불","parentId":null,"active":true,"sortOrder":10 }] },
  "POST /api/categories": { "body": { "name":"배송", "parentId":null, "sortOrder":20 }, "resp": { "categoryId":"ship" } },
  "GET /api/label-mappings": { "query": ["source"], "resp": [{ "source":"zendesk", "label":"문의유형/환불", "categoryId":"pay", "confidence":1.0 }] },
  "POST /api/label-mappings": { "body": { "source":"channel", "label":"배송지연", "categoryId":"ship", "confidence":0.9 } },
  "GET /api/stopwords": { "resp": [{ "locale":"ko-KR","token":"문의" }] },
  "POST /api/stopwords": { "body": { "locale":"ko-KR","token":"예매" } },
  "GET /api/health": { "resp": { "status":"ok","ingestionLagSec":120 } }
}
```

### 15) 구현 체크리스트
- DB 스키마 생성 및 마이그레이션
- 젠데스크/채널톡 인증 설정 및 샌드박스 테스트
- 백필 스크립트/증분 워커/웹훅 수신기
- 텍스트 정규화/토큰화/스코어링 배치
- API 구현(통계/키워드/드릴다운/관리)
- 프론트엔드 대시보드/드릴다운/관리 UI
- 관측성/알림/권한/로그/마스킹 점검

### 참고 링크
- 젠데스크: [Zendesk API Reference](https://developer.zendesk.com/api-reference/)
- 채널톡: [Channel.io API Docs](https://api-doc.channel.io/)


