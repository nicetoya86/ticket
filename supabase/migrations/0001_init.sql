-- PRD 기반 초기 스키마 생성
-- 확장 및 공통 설정
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- 원천 테이블
create table if not exists raw_zendesk_tickets (
	id bigint primary key,
	created_at timestamptz not null,
	updated_at timestamptz not null,
	subject text,
	description text,
	requester_id bigint,
	org_id bigint,
	custom_fields jsonb,
	tags text[],
	status text,
	priority text,
	channel text,
	raw_json jsonb
);

create table if not exists raw_zendesk_comments (
	ticket_id bigint not null,
	comment_id bigint not null,
	author_id bigint,
	created_at timestamptz not null,
	body text,
	raw_json jsonb,
	primary key(ticket_id, comment_id)
);

create table if not exists raw_channel_conversations (
	id bigint primary key,
	created_at timestamptz not null,
	updated_at timestamptz not null,
	assignee text,
	participants jsonb,
	tags text[],
	status text,
	source text,
	raw_json jsonb
);

create table if not exists raw_channel_messages (
	conversation_id bigint not null,
	message_id bigint not null,
	created_at timestamptz not null,
	sender text,
	text text,
	attachments jsonb,
	raw_json jsonb,
	primary key(conversation_id, message_id)
);

-- 표준화/운영 테이블
create type source_enum as enum ('zendesk', 'channel');

create table if not exists categories (
	category_id text primary key,
	name text not null,
	parent_id text references categories(category_id) on delete set null,
	active boolean not null default true,
	sort_order int not null default 0
);

create table if not exists unified_interactions (
	source source_enum not null,
	source_id text not null,
	created_at timestamptz not null,
	updated_at timestamptz,
	title text,
	body text,
	requester text,
	organization text,
	labels text[],
	category_id text references categories(category_id) on delete set null,
	keywords text[],
	primary key (source, source_id)
);

create table if not exists label_mappings (
	source source_enum not null,
	label text not null,
	category_id text not null references categories(category_id) on delete cascade,
	rule_version int not null default 1,
	confidence numeric(3,2) not null default 1.00,
	primary key (source, label)
);

create table if not exists stats_daily (
	date date not null,
	category_id text references categories(category_id) on delete set null,
	source source_enum not null,
	count bigint not null default 0,
	wow numeric(6,4),
	yoy numeric(6,4),
	primary key (date, category_id, source)
);

create table if not exists keywords_daily (
	date date not null,
	category_id text references categories(category_id) on delete set null,
	source source_enum not null,
	keyword text not null,
	freq int not null default 0,
	tfidf numeric(10,6),
	rank int,
	primary key (date, category_id, source, keyword)
);

create table if not exists ingestion_checkpoints (
	source source_enum not null,
	checkpoint_type text not null check (checkpoint_type in ('cursor','timestamp')),
	value text not null,
	updated_at timestamptz not null default now(),
	primary key (source, checkpoint_type)
);

create table if not exists stopwords (
	locale text not null,
	token text not null,
	active boolean not null default true,
	primary key (locale, token)
);

-- 인덱스 최적화
create index if not exists idx_unified_interactions_created_at on unified_interactions (created_at);
create index if not exists idx_unified_interactions_category on unified_interactions (category_id);
create index if not exists idx_label_mappings_category on label_mappings (category_id);
create index if not exists idx_stats_daily_category on stats_daily (category_id);
create index if not exists idx_keywords_daily_category on keywords_daily (category_id);
