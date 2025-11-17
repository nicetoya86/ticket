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
        select inquiry_type, ticket_id, created_at,
               ('고객: ' || btrim(regexp_replace(body, '\(\d{1,2}:\d{2}:\d{2}\)', '', 'g'))) as text_value
        from base
        where author_id is not null and requester_id is not null and author_id = requester_id
          and inquiry_type is not null and inquiry_type not like '병원\_%' escape '\'
          and body !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          
          and coalesce((raw_json->>'public')::boolean, true) is true
          and coalesce(raw_json->'via'->>'channel','') <> 'chat_transcript'
          and coalesce(raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and coalesce((raw_json->>'public')::boolean, true) is true
          and coalesce(raw_json->'via'->>'channel','') <> 'chat_transcript'
          and coalesce(raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and coalesce(raw_json->>'type','') !~* '(voice|transcript)'
    ), direct_manager as (
        -- 매니저(에이전트)가 직접 남긴 공개 코멘트 포함 (시스템 문구 제외)
        select inquiry_type, ticket_id, created_at,
               ('매니저: ' || btrim(regexp_replace(body, '\(\d{1,2}:\d{2}:\d{2}\)', '', 'g'))) as text_value
        from base
        where author_id is not null and requester_id is not null and author_id <> requester_id
          and coalesce((raw_json->>'public')::boolean, true) is true
          and inquiry_type is not null and inquiry_type not like '병원\_%' escape '\'
          and body !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          
          and coalesce(raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and coalesce(raw_json->>'type','') !~* '(voice|transcript)'
    ), parsed as (
        select inquiry_type, ticket_id, created_at,
               btrim(regexp_replace(
                 regexp_replace(
                   line,
                   '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):\s*',
                   '', 'i'
                 ),
                 '\(\d{1,2}:\d{2}:\d{2}\)', '', 'g'
               )) as text_value
        from base b,
             lateral regexp_split_to_table(b.body, E'\n') as line
        where coalesce(b.author_id, -1) <> b.requester_id  -- 시스템/봇/에이전트가 남긴 트랜스크립트 포함
          and line ~* '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):'
          and line !~* '(여신BOT|BOT:|매니저|Agent|상담사:)'
          and line !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
          and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
          and length(regexp_replace(line, '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?', '', 'i')) > 0
          and b.inquiry_type is not null and b.inquiry_type not like '병원\_%' escape '\'
          and line !~* '님과의\s*대화\s*$'
          and line !~* '(여신BOT|여신티켓|운영시간|점심시간|주말\s*및\s*공휴일\s*휴무|순차적으로\s*안내|버튼을\s*눌러|키워드를\s*입력|\[처음으로\]|피부\s*시술[\s,]*일상이\s*되다|상담원연결)'
    ), parsed_manager as (
        -- 트랜스크립트에서 매니저(에이전트) 발화 라인 포함
        select inquiry_type, ticket_id, created_at,
               btrim(regexp_replace(
                 regexp_replace(
                   line,
                   '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:\s*',
                   '', 'i'
                 ),
                 '\(\d{1,2}:\d{2}:\d{2}\)', '', 'g'
               )) as text_value
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
          and line !~* '(여신BOT|여신티켓|운영시간|점심시간|주말\s*및\s*공휴일\s*휴무|순차적으로\s*안내|버튼을\s*눌러|키워드를\s*입력|\[처음으로\]|피부\s*시술[\s,]*일상이\s*되다|상담원연결)'
    ), lines as (
        select b.*, t.line, t.ln
        from base b,
             lateral regexp_split_to_table(b.body, E'\n') with ordinality as t(line, ln)
    ), norm as (
        select inquiry_type, ticket_id, created_at,
               coalesce(raw_json->'via'->>'channel','') as channel,
               ln,
               line as raw_line,
               -- 1) 선행 토큰(\\1:) 제거, 2) 타임스탬프 제거
               btrim(
                 regexp_replace(
                   regexp_replace(line, '^\s*\\\d+:?\s*', '', 'i'),
                   '^\s*\(\d{1,2}:\d{2}:\d{2}\)\s*', '', 'i'
                 )
               ) as clean_line,
               (regexp_replace(
                   regexp_replace(line, '^\s*\\\d+:?\s*', '', 'i'),
                   '^\s*\(\d{1,2}:\d{2}:\d{2}\)\s*', '', 'i'
               ) ~* '^[^:]+:') as has_prefix
        from lines
    ), seg as (
        select *,
               case when clean_line ~* '^([^:]+):' then regexp_replace(clean_line, '^([^:]+):.*$', '\\1', 'i') else null end as speaker_name_raw
        from norm
    ), typed as (
        select *,
               case when speaker_name_raw ~* '(여신BOT|bot)' then 'bot'
                    when speaker_name_raw ~* '(매니저|Agent|상담사|Manager|관리자)' then 'agent'
                    when speaker_name_raw is not null then 'user'
                    else null end as speaker_type,
               case when speaker_name_raw is not null then 1 else 0 end as start_flag
        from seg
    ), grp as (
        select *,
               sum(start_flag) over (partition by ticket_id, created_at order by ln) as grp_id
        from typed
    ), blocks as (
        select inquiry_type, ticket_id, created_at,
               max(channel) as channel,
               max(speaker_type) filter (where speaker_type is not null) as speaker_type,
               max(speaker_name_raw) filter (where speaker_name_raw is not null) as speaker_name,
               string_agg(
                 case when has_prefix then btrim(regexp_replace(clean_line, '^[^:]+:\\s*', '', 'i')) else clean_line end,
                 E'\n' order by ln
               ) as block_text
        from grp
        where grp_id is not null
        group by inquiry_type, ticket_id, created_at, grp_id
    ), parsed_user as (
        select inquiry_type, ticket_id, created_at,
               (coalesce(speaker_name,'고객') || ': ' || block_text) as text_value
        from blocks
        where speaker_type = 'user'
          and channel not in ('system','rule','trigger','automation','voice','phone','call')
    ), parsed_agent as (
        select inquiry_type, ticket_id, created_at,
               (coalesce(speaker_name,'매니저') || ': ' || block_text) as text_value
        from blocks
        where speaker_type = 'agent'
          and channel not in ('system','rule','trigger','automation','voice','phone','call')
    ), unified as (
        select * from direct
        union all
        select * from direct_manager
        union all
        select * from parsed_user
        union all
        select * from parsed_agent
    )
    , ordered as (
        select inquiry_type, ticket_id, created_at, text_value
        from unified
        where coalesce(text_value,'') <> ''
        order by created_at asc
    )
    select
           min(inquiry_type) as inquiry_type,
           ticket_id,
           max(created_at) as created_at,
           'comment'::text as text_type,
           string_agg(
             regexp_replace(
               regexp_replace(text_value, '(^|\n)\s*\\\d+:?\s*', '\\1', 'g'),
               '(^|\n)(?:여신BOT:\\s*"?피부\\s*시술[\\s,]*일상이\\s*되다"?|안녕하세요,\\s*여신티켓입니다\.|🕒️\\s*운영시간:.*|🍙️\\s*점심시간:.*|주말\\s*및\\s*공휴일\\s*휴무|순차적으로\\s*안내.*|여신BOT:\\s*아래\\s*2가지\\s*방법.*|키워드를\\s*입력.*|\\[처음으로\\].*)\\s*(?=\n|$)'
               , '\\1', 'g'
             ),
             E'\n' order by created_at asc
           ) as text_value
    from ordered
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
        btrim(
          regexp_replace(
            regexp_replace(b.body, '\\(\\d{1,2}:\\d{2}:\\d{2}\\)', '', 'g'),
            '(^|\n)\s*\\\\\\d+:?\s*', '\\1', 'g'
          )
        ) as text_value
    from base b
    where b.author_id is not null
      and b.requester_id is not null
      and b.author_id = b.requester_id
      and b.body !~* '^\s*해결되지 않았어요\.?\s*$'
      and b.body !~* '님과의\s*대화\s*$'
      and b.body !~* '(여신BOT|여신티켓|운영시간|점심시간|주말\s*및\s*공휴일\s*휴무|순차적으로\s*안내|버튼을\s*눌러|키워드를\s*입력|\[처음으로\]|피부\s*시술[\s,]*일상이\s*되다|상담원연결)'
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
        btrim(regexp_replace(
          regexp_replace(
            line,
            '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):\s*',
            '', 'i'
          ),
          '(^|\n)\s*\\\\\\d+:?\s*|\(\d{1,2}:\d{2}:\d{2}\)', '', 'g'
        )) as text_value
    from base b,
         lateral regexp_split_to_table(b.body, E'\n') as line
    where coalesce(b.author_id, -1) <> b.requester_id  -- 시스템/봇/에이전트가 남긴 트랜스크립트 포함
      and line ~* '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):'
      and line !~* '(여신BOT|BOT:|매니저|Agent:|상담사:)'
      and line !~* '^(발신전화\s+to\s+\d+|수신전화\s+\d+)'
      and coalesce(b.raw_json->'via'->>'channel','') not in ('system','rule','trigger','automation','voice','phone','call')
      and length(regexp_replace(
          line,
          '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?((?:(?:iOS|Android|Web)\s+User|End[\s-]*user|Visitor|고객|사용자|유저)[^:]*):\s*',
          '', 'i')) > 0
      and b.inquiry_type is not null and b.inquiry_type not like '병원\_%' escape '\'
      and line !~* '님과의\s*대화\s*$'
      and line !~* '(여신BOT|여신티켓|운영시간|점심시간|주말\s*및\s*공휴일\s*휴무|순차적으로\s*안내|버튼을\s*눌러|키워드를\s*입력|\[처음으로\]|피부\s*시술[\s,]*일상이\s*되다|상담원연결)'
  union all
    -- 3) 트랜스크립트에서 매니저(에이전트) 발화 라인 포함
    select
        b.inquiry_type,
        b.ticket_id,
        b.created_at,
        'comment'::text as text_type,
        btrim(regexp_replace(
          regexp_replace(
            line,
            '^\s*(\(\d{1,2}:\d{2}:\d{2}\)\s*)?(?:\(BOT\)\s*)?(?:매니저|Agent|상담사|Manager|관리자)[^:]*:\s*',
            '', 'i'
          ),
          '(^|\n)\s*\\\\\\d+:?\s*|\(\d{1,2}:\d{2}:\d{2}\)', '', 'g'
        )) as text_value
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
      and line !~* '(여신BOT|여신티켓|운영시간|점심시간|주말\s*및\s*공휴일\s*휴무|순차적으로\s*안내|버튼을\s*눌러|키워드를\s*입력|\[처음으로\]|피부\s*시술[\s,]*일상이\s*되다|상담원연결)'
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
      and coalesce(t.channel,'') not in ('voice','phone','call')
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


