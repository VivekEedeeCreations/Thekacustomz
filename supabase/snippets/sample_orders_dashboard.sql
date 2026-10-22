-- ============================================================================
-- Sample data for the dashboard's order sections.
--
-- Run in the Supabase SQL editor (or psql) AFTER the migrations, including
-- 20261022120000_order_import_and_delivery.sql. Meant for a test/dev project.
--
-- Creates, all tagged "SAMPLE-":
--   * location  SAMPLE-WH
--   * products  SAMPLE-TEE-HITMAN-L, SAMPLE-TUM-PINKBOW, SAMPLE-MUG-ENGINEER
--     with 500 units of opening stock each
--   * 48 orders (external ids SAMPLE-0001…) across the last ~3 weeks:
--       12 New + 6 Dispatch-ready  → "Pending dispatch by order date"
--       10 Dispatched              → "In transit"
--       20 Delivered, delivered 0–19 days ago → "Delivered" + "Return window open"
--
-- Orders go through the real status transitions, so the normal triggers run:
-- dispatch-ready takes stock out of SAMPLE-WH. Dispatched times are "now"
-- (the trigger stamps them); delivered times are back-dated.
--
-- Safe to re-run: it does nothing if SAMPLE-0001 already exists.
-- ============================================================================

do $$
declare
  v_location uuid;
  v_products uuid[];
  v_prices   numeric[];
  v_names    text[] := array[
    'Aarav', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Meera', 'Arjun', 'Saanvi',
    'Vihaan', 'Anaya', 'Kabir', 'Myra', 'Reyansh', 'Aadhya', 'Atharv', 'Kiara'
  ];
  v_states   text[] := array[
    'Maharashtra 400064', 'Karnataka 560037', 'Delhi 110085', 'Telangana 500032',
    'Gujarat 380015', 'Uttar Pradesh 201301', 'West Bengal 700040', 'Punjab 144001'
  ];
  v_channels public.sales_channel[] := array['AMAZON', 'AMAZON', 'SHOPIFY', 'FLIPKART', 'MEESHO']::public.sales_channel[];
  v_order    uuid;
  v_status   text;
  v_age      int;
  v_pidx     int;
  i          int;
begin
  if exists (select 1 from public.orders where external_order_id = 'SAMPLE-0001') then
    raise notice 'Sample orders already exist — nothing to do.';
    return;
  end if;

  -- Location ------------------------------------------------------------------
  select id into v_location from public.locations where code = 'SAMPLE-WH';
  if v_location is null then
    insert into public.locations (code, name, location_type)
    values ('SAMPLE-WH', 'Sample warehouse', 'WAREHOUSE')
    returning id into v_location;
  end if;

  -- Products + opening stock ----------------------------------------------------
  insert into public.products (sku, name, product_type, cost_price, selling_price, tax_rate)
  values
    ('SAMPLE-TEE-HITMAN-L', 'Sample — Hitman oversized tee (L)', 'PRODUCT', 260, 699, 5),
    ('SAMPLE-TUM-PINKBOW',  'Sample — Pink Bow Sparkle tumbler', 'PRODUCT', 320, 799, 18),
    ('SAMPLE-MUG-ENGINEER', 'Sample — Great Engineer mug',       'PRODUCT', 140, 399, 18)
  on conflict do nothing;

  select array_agg(id order by sku) into v_products
  from public.products
  where sku in ('SAMPLE-MUG-ENGINEER', 'SAMPLE-TEE-HITMAN-L', 'SAMPLE-TUM-PINKBOW');
  -- Arrays are in sku order (MUG, TEE, TUM); prices line up with that.
  v_prices := array[399, 699, 799];

  insert into public.inventory_movements (product_id, location_id, movement_type, quantity, notes)
  select p, v_location, 'INITIAL_STOCK', 500, 'Sample data opening stock'
  from unnest(v_products) as p;

  -- Orders --------------------------------------------------------------------
  for i in 1..48 loop
    if i <= 12 then
      v_status := 'NEW';            v_age := (i - 1) % 6;          -- ordered 0–5 days ago
    elsif i <= 18 then
      v_status := 'DISPATCH_READY'; v_age := (i - 13) % 3;         -- 0–2 days ago
    elsif i <= 28 then
      v_status := 'DISPATCHED';     v_age := 2 + (i - 19) % 5;     -- 2–6 days ago
    else
      v_status := 'DELIVERED';      v_age := 4 + (i - 29);         -- 4–23 days ago
    end if;

    v_pidx := 1 + (i % 3);

    v_order := public.create_order(
      jsonb_build_object(
        'sales_channel', v_channels[1 + (i % array_length(v_channels, 1))],
        'external_order_id', 'SAMPLE-' || lpad(i::text, 4, '0'),
        'customer_name', v_names[1 + (i % array_length(v_names, 1))],
        'shipping_address', v_states[1 + (i % array_length(v_states, 1))],
        'order_date', (current_date - v_age)::text,
        'notes', 'Sample data'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'product_id', v_products[v_pidx],
          'quantity', 1 + (i % 4 = 0)::int,
          'unit_price', v_prices[v_pidx],
          'tax_rate', 0
        )
      )
    );

    if v_status <> 'NEW' then
      update public.orders
         set status = 'DISPATCH_READY',
             location_id = v_location,
             courier_name = case when i % 2 = 0 then 'Delhivery' else 'Amazon Shipping' end,
             awb_number = 'SAMPLEAWB' || lpad(i::text, 6, '0')
       where id = v_order;
    end if;

    if v_status in ('DISPATCHED', 'DELIVERED') then
      update public.orders set status = 'DISPATCHED' where id = v_order;
    end if;

    if v_status = 'DELIVERED' then
      -- Delivered 0–19 days ago, so a 7/10/15-day window shows a mix.
      update public.orders
         set status = 'DELIVERED',
             delivered_at = now() - make_interval(days => i - 29, hours => 3)
       where id = v_order;
    end if;
  end loop;

  raise notice 'Created 48 sample orders in location SAMPLE-WH.';
end;
$$;
