create or replace function upsert_stats_daily()
returns void
language plpgsql
as $$
begin
	insert into stats_daily (date, category_id, source, count)
	select
		(created_at at time zone 'UTC')::date as date,
		coalesce(category_id, 'uncategorized') as category_id,
		source,
		count(*)::bigint as cnt
	from unified_interactions
	group by 1,2,3
	on conflict (date, category_id, source)
	do update set count = excluded.count;
end;
$$;
