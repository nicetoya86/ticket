-- 채널톡 원본 ID는 64비트를 초과하는 16진 문자열(예: 692186ad5c25a2cbd366)이므로
-- bigint 컬럼에 저장할 수 없습니다. 대량 백필 전 text 타입으로 전환합니다.

alter table if exists raw_channel_messages
	drop constraint if exists raw_channel_messages_pkey;

alter table if exists raw_channel_conversations
	drop constraint if exists raw_channel_conversations_pkey;

alter table if exists raw_channel_conversations
	alter column id type text using id::text;

alter table if exists raw_channel_messages
	alter column conversation_id type text using conversation_id::text;

alter table if exists raw_channel_messages
	alter column message_id type text using message_id::text;

alter table if exists raw_channel_conversations
	add primary key (id);

alter table if exists raw_channel_messages
	add primary key (conversation_id, message_id);


