-- 간단 정책: 초기에는 RLS 비활성화 (내부 API 전용)
alter table raw_zendesk_tickets disable row level security;
alter table raw_zendesk_comments disable row level security;
alter table raw_channel_conversations disable row level security;
alter table raw_channel_messages disable row level security;
alter table categories disable row level security;
alter table unified_interactions disable row level security;
alter table label_mappings disable row level security;
alter table stats_daily disable row level security;
alter table keywords_daily disable row level security;
alter table ingestion_checkpoints disable row level security;
alter table stopwords disable row level security;
