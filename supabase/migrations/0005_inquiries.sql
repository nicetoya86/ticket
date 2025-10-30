-- Zendesk ticket fields metadata for resolving custom field ids
create table if not exists zd_ticket_fields (
    id bigint primary key,
    type text,
    title text,
    "key" text,
    raw_json jsonb
);

-- Helper: extract a custom field value by field id from tickets.custom_fields
create or replace function extract_cf_value(cf jsonb, field_id bigint)
returns text
language sql
stable
as $$
    with norm as (
        select case
            when cf is null then '[]'::jsonb
            when jsonb_typeof(cf) = 'array' then cf
            else '[]'::jsonb  -- older rows may contain a scalar string; skip safely
        end as arr
    )
    select (elem->>'value')::text
    from norm, jsonb_array_elements(norm.arr) as elem
    where (elem->>'id')::bigint = field_id
    limit 1;
$$;

-- Grouped: merge multiple comments per ticket into a single text blob (end-user only)
create or replace function inquiries_texts_grouped_by_ticket(
    p_from date,
    p_to date,
    p_field_title text,
    p_status text default 'closed'
) returns table(inquiry_type text, ticket_id bigint, created_at timestamptz, text_type text, text_value text)
language sql
stable
as $$
    with field_meta as (
        select id from zd_ticket_fields where title = p_field_title limit 1
    ), base as (
        select c.*, t.requester_id,
               extract_cf_value(t.custom_fields, (select id from field_meta)) as inquiry_type
        from raw_zendesk_comments c
        join raw_zendesk_tickets t on t.id = c.ticket_id
        where (c.created_at::date between p_from and p_to)
          and (p_status = '' or coalesce(t.status,'') = p_status)
          and coalesce(c.body,'') <> ''
    ), direct as (
        select inquiry_type, ticket_id, created_at, body as text_value
        from base
        where author_id is not null and requester_id is not null and author_id = requester_id
          and inquiry_type is not null and inquiry_type not like '병원\_%' escape '\'
          and body !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          and body !~* '^\s*해결되지 않았어요\.?\s*$'
          and body !~* '님과의\s*대화\s*$'
          and coalesce((raw_json->>'public')::boolean, true) is true
          and coalesce(raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and coalesce(raw_json->>'type','') !~* '(voice|transcript)'
    ), direct_manager as (
        -- 매니저(에이전트)가 직접 남긴 공개 코멘트 포함 (시스템 문구 제외)
        select inquiry_type, ticket_id, created_at, body as text_value
        from base
        where author_id is not null and requester_id is not null and author_id <> requester_id
          and coalesce((raw_json->>'public')::boolean, true) is true
          and inquiry_type is not null and inquiry_type not like '병원\_%' escape '\'
          and body !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          and body !~* '^\s*해결되지 않았어요\.?\s*$'
          and body !~* '님과의\s*대화\s*$'
          and coalesce(raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and coalesce(raw_json->>'type','') !~* '(voice|transcript)'
    ), parsed as (
        select inquiry_type, ticket_id, created_at,
               regexp_replace(
                 line,
                 '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):\s*',
                 '', 'i'
               ) as text_value
        from base b,
             lateral regexp_split_to_table(b.body, E'\n') as line
        where coalesce(b.author_id, -1) <> b.requester_id  -- 시스템/봇/에이전트가 남긴 트랜스크립트 포함
          and line ~* '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):'
          and line !~* '(BOT:|매니저|Agent:|상담사:)'
          and line !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and length(regexp_replace(line, '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?', '', 'i')) > 0
          and b.inquiry_type is not null and b.inquiry_type not like '병원\_%' escape '\'
          and line !~* '님과의\s*대화\s*$'
    ), parsed_manager as (
        -- 트랜스크립트에서 매니저(에이전트) 발화 라인 포함
        select inquiry_type, ticket_id, created_at,
               regexp_replace(
                 line,
                 '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:\s*',
                 '', 'i'
               ) as text_value
        from base b,
             lateral regexp_split_to_table(b.body, E'\n') as line
        where coalesce(b.author_id, -1) <> b.requester_id
          and line ~* '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:'
          and line !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and length(regexp_replace(
                line,
                '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:\s*',
                '', 'i')) > 0
          and b.inquiry_type is not null and b.inquiry_type not like '병원\_%' escape '\'
          and line !~* '님과의\s*대화\s*$'
    ), unified as (
        select * from direct
        union all
        select * from direct_manager
        union all
        select * from parsed
        union all
        select * from parsed_manager
    )
    , uniq as (
        select
            inquiry_type,
            ticket_id,
            text_value,
            min(created_at) as first_at
        from unified
        group by inquiry_type, ticket_id, text_value
    )
    select
           min(inquiry_type) as inquiry_type,
           ticket_id,
           max(first_at) as created_at,
           'comment'::text as text_type,
           string_agg(text_value, E'\n' order by first_at asc) as text_value
    from uniq
    group by ticket_id
    order by created_at desc, ticket_id;
$$;

-- Detailed texts: by inquiry type (ticket subject + comments body)
create or replace function inquiries_texts_by_type(
    p_from date,
    p_to date,
    p_field_title text,
    p_status text default 'closed'
) returns table(inquiry_type text, ticket_id bigint, created_at timestamptz, text_type text, text_value text)
language sql
stable
as $$
    with field_meta as (
        select id from zd_ticket_fields where title = p_field_title limit 1
    ), base as (
        select c.*, t.requester_id,
               extract_cf_value(t.custom_fields, (select id from field_meta)) as inquiry_type
        from raw_zendesk_comments c
        join raw_zendesk_tickets t on t.id = c.ticket_id
        where (c.created_at::date between p_from and p_to)
          and (p_status = '' or coalesce(t.status,'') = p_status)
          and coalesce(c.body,'') <> ''
    )
    -- 1) 일반 코멘트: 작성자가 고객인 행 그대로 채택
    select
        b.inquiry_type,
        b.ticket_id,
        b.created_at,
        'comment'::text as text_type,
        b.body as text_value
    from base b
    where b.author_id is not null
      and b.requester_id is not null
      and b.author_id = b.requester_id
      and b.body !~* '^\s*해결되지 않았어요\.?\s*$'
      and b.body !~* '님과의\s*대화\s*$'
      and coalesce((b.raw_json->>'public')::boolean, true) is true
      and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
      and coalesce(b.raw_json->>'type','') !~* '(voice|transcript)'
  union all
    -- 2) 대화 로그(트랜스크립트)에서 고객 발화 라인(다양한 포맷) 추출
    select
        b.inquiry_type,
        b.ticket_id,
        b.created_at,
        'comment'::text as text_type,
        regexp_replace(
          line,
          '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):\s*',
          '', 'i') as text_value
    from base b,
         lateral regexp_split_to_table(b.body, E'\n') as line
    where coalesce(b.author_id, -1) <> b.requester_id  -- 시스템/봇/에이전트가 남긴 트랜스크립트 포함
      and line ~* '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):'
      and line !~* '(BOT:|매니저|Agent:|상담사:)'
      and line !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
      and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
      and length(regexp_replace(
          line,
          '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):\s*',
          '', 'i')) > 0
      and b.inquiry_type is not null and b.inquiry_type not like '병원\_%' escape '\'
      and line !~* '님과의\s*대화\s*$'
  union all
    -- 3) 트랜스크립트에서 매니저(에이전트) 발화 라인 포함
    select
        b.inquiry_type,
        b.ticket_id,
        b.created_at,
        'comment'::text as text_type,
        regexp_replace(
          line,
          '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:\s*',
          '', 'i') as text_value
    from base b,
         lateral regexp_split_to_table(b.body, E'\n') as line
    where coalesce(b.author_id, -1) <> b.requester_id
      and line ~* '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:'
      and line !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
      and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
      and length(regexp_replace(
          line,
          '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:\s*',
          '', 'i')) > 0
      and b.inquiry_type is not null and b.inquiry_type not like '병원\_%' escape '\'
      and line !~* '님과의\s*대화\s*$'
    order by 3 desc, 2;
$$;

-- Aggregate counts of closed tickets by a custom field title
create or replace function unified_inquiries_by_type(
    p_from date,
    p_to date,
    p_field_title text,
    p_status text default 'closed'
) returns table(inquiry_type text, ticket_count bigint)
language sql
stable
as $$
    with field_meta as (
        select id from zd_ticket_fields where title = p_field_title limit 1
    )
    select
        extract_cf_value(t.custom_fields, (select id from field_meta)) as inquiry_type,
        count(*)::bigint as ticket_count
    from raw_zendesk_tickets t
    where (t.created_at::date between p_from and p_to)
      and (p_status = '' or coalesce(t.status,'') = p_status)
      and extract_cf_value(t.custom_fields, (select id from field_meta)) is not null
      and extract_cf_value(t.custom_fields, (select id from field_meta)) <> ''
      and extract_cf_value(t.custom_fields, (select id from field_meta)) not like '병원\_%' escape '\'
    group by 1
    order by ticket_count desc nulls last;
$$;

-- Detailed rows: by inquiry type with requester and ticket info
create or replace function inquiries_users_by_type(
    p_from date,
    p_to date,
    p_field_title text,
    p_status text default 'closed'
) returns table(inquiry_type text, ticket_id bigint, requester text, subject text, created_at timestamptz)
language sql
stable
as $$
    with field_meta as (
        select id from zd_ticket_fields where title = p_field_title limit 1
    )
    select
        extract_cf_value(t.custom_fields, (select id from field_meta)) as inquiry_type,
        t.id as ticket_id,
        case when t.requester_id is not null then t.requester_id::text else null end as requester,
        coalesce(t.subject, '') as subject,
        t.created_at
    from raw_zendesk_tickets t
    where (t.created_at::date between p_from and p_to)
      and (p_status = '' or coalesce(t.status,'') = p_status)
      and extract_cf_value(t.custom_fields, (select id from field_meta)) is not null
      and extract_cf_value(t.custom_fields, (select id from field_meta)) <> ''
      and extract_cf_value(t.custom_fields, (select id from field_meta)) not like '병원\_%' escape '\'
    order by t.created_at desc;
$$;


