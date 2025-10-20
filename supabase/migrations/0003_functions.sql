create or replace function unified_interactions_heatmap(
	p_from date,
	p_to date,
	p_sources text
) returns table(dow int, hour int, count bigint) language sql stable as $$
	select extract(dow from created_at at time zone 'UTC' at time zone 'Asia/Seoul')::int as dow,
		extract(hour from created_at at time zone 'UTC' at time zone 'Asia/Seoul')::int as hour,
		count(*)::bigint as count
	from unified_interactions ui
	where ui.created_at::date between p_from and p_to
		and (p_sources = '' or ui.source::text = any(string_to_array(p_sources, ',')))
	group by 1,2
	order by 1,2;
$$;
