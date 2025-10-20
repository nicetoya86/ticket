insert into categories (category_id, name, parent_id, active, sort_order) values
('pay', '결제/환불', null, true, 10)
ON CONFLICT (category_id) DO NOTHING;

insert into categories (category_id, name, parent_id, active, sort_order) values
('ship', '배송/수령', null, true, 20)
ON CONFLICT (category_id) DO NOTHING;
