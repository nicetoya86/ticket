insert into categories (category_id, name, parent_id, active, sort_order)
values ('uncategorized', '미분류', null, true, 0)
ON CONFLICT (category_id) DO NOTHING;
