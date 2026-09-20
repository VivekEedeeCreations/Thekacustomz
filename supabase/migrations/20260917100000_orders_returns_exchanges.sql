-- ============================================================================
-- 10 · Order management: orders, scan-to-dispatch (AWB), returns, exchanges
-- ============================================================================
-- Orders come from a sales channel (Amazon, Flipkart, Meesho, Shopify,
-- Instagram, ...). They are entered here tagged with the channel + that
-- channel's own order id — there is no live seller-API sync in this schema.
--
-- One AWB per order. Status flow:
--
--   NEW ──scan──> DISPATCH_READY ──courier pickup──> DISPATCHED ──> DELIVERED
--    │                 │
--    └─> CANCELLED <───┘   (leaving DISPATCH_READY back to NEW/CANCELLED puts
--                           the stock back)
--
-- Entering DISPATCH_READY takes the stock out of the order's location (a SALE
-- movement per line through the existing inventory ledger). Lines, AWB,
-- courier and location are frozen until the order is un-readied.
--
-- Returns and exchanges reference the order they came from and post their own
-- movements through the same ledger — `inventory` is never written directly.
-- ============================================================================

create type public.sales_channel as enum (
  'MANUAL', 'AMAZON', 'FLIPKART', 'MEESHO', 'SHOPIFY', 'INSTAGRAM', 'MYNTRA', 'OTHER'
);

create type public.order_status as enum (
  'NEW', 'DISPATCH_READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'
);

create type public.return_status as enum (
  'REQUESTED', 'AUTHORIZED', 'REJECTED', 'RECEIVED', 'REFUNDED'
);

create type public.exchange_status as enum (
  'REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'COMPLETED'
);

create sequence if not exists public.order_number_seq;
create sequence if not exists public.return_number_seq;
create sequence if not exists public.exchange_number_seq;

-- ============================================================================
-- orders
-- ============================================================================
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      extensions.citext not null,
  sales_channel     public.sales_channel not null default 'MANUAL',
  external_order_id text,
  customer_name     text,
  customer_phone    text,
  customer_email    extensions.citext,
  shipping_address  text,
  location_id       uuid references public.locations (id) on delete set null,
  status            public.order_status not null default 'NEW',
  order_date        date not null default current_date,
  subtotal          numeric(14,4) not null default 0 check (subtotal >= 0),
  discount_amount   numeric(14,4) not null default 0 check (discount_amount >= 0),
  tax_amount        numeric(14,4) not null default 0 check (tax_amount >= 0),
  shipping_amount   numeric(14,4) not null default 0 check (shipping_amount >= 0),
  total_amount      numeric(14,4) not null default 0 check (total_amount >= 0),
  courier_name      text,
  awb_number        text,
  ready_at          timestamptz,
  ready_by          uuid references public.profiles (id) on delete set null,
  dispatched_at     timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  constraint orders_ready_requires_awb_location check (
    ready_at is null or (awb_number is not null and location_id is not null)
  ),
  constraint orders_dispatched_requires_ready check (
    dispatched_at is null or ready_at is not null
  )
);
comment on table public.orders is
  'Sales order header from any channel. Scanning its AWB marks it DISPATCH_READY and takes stock out of its location.';
comment on column public.orders.external_order_id is
  'The channel''s own order id (e.g. an Amazon order id). NULL for MANUAL orders.';
comment on column public.orders.ready_at is
  'When the order became DISPATCH_READY (stock left the location). Cleared if it is un-readied.';

create unique index orders_order_number_key on public.orders (order_number);
create unique index orders_awb_number_key on public.orders (awb_number) where awb_number is not null;
create unique index orders_channel_external_id_key
  on public.orders (sales_channel, external_order_id) where external_order_id is not null;
-- Scanner lookups search the external id on its own, without the channel.
create index orders_external_order_id_idx on public.orders (external_order_id)
  where external_order_id is not null;
create index orders_status_idx on public.orders (status);
create index orders_sales_channel_idx on public.orders (sales_channel);
create index orders_order_date_idx on public.orders (order_date desc);
create index orders_location_id_idx on public.orders (location_id);

-- Assigns order_number, keeps totals authoritative, and enforces the status
-- flow (see header). Stock itself is posted by orders_stock_movements below.
create or replace function internal.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.awb_number := nullif(btrim(new.awb_number), '');
  new.external_order_id := nullif(btrim(new.external_order_id), '');
  new.courier_name := nullif(btrim(new.courier_name), '');

  if tg_op = 'INSERT' then
    if new.order_number is null or btrim(new.order_number::text) = '' then
      new.order_number := 'ORD-' || to_char(now(), 'YYYY') || '-'
        || lpad(nextval('public.order_number_seq')::text, 5, '0');
    end if;
    new.subtotal := 0;
    new.tax_amount := 0;
    if new.status <> 'NEW' or new.ready_at is not null or new.dispatched_at is not null then
      raise exception 'A new order must start as NEW' using errcode = 'restrict_violation';
    end if;
  else
    if current_setting('app.order_totals_write', true) is distinct from 'on' then
      new.subtotal := old.subtotal;
      new.tax_amount := old.tax_amount;
    end if;

    -- Timestamps are owned by the status flow, never set by clients.
    new.ready_at := old.ready_at;
    new.ready_by := old.ready_by;
    new.dispatched_at := old.dispatched_at;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'NEW'            and new.status in ('DISPATCH_READY', 'CANCELLED'))
        or (old.status = 'DISPATCH_READY' and new.status in ('NEW', 'CANCELLED', 'DISPATCHED'))
        or (old.status = 'DISPATCHED'     and new.status = 'DELIVERED')
        or (old.status = 'CANCELLED'      and new.status = 'NEW')
      ) then
        raise exception 'An order cannot go from % to %', old.status, new.status
          using errcode = 'restrict_violation';
      end if;

      if new.status = 'DISPATCH_READY' then
        new.ready_at := now();
        new.ready_by := auth.uid();
      elsif new.status = 'DISPATCHED' then
        new.dispatched_at := now();
      elsif old.status = 'DISPATCH_READY' then
        -- Un-readied (back to NEW, or cancelled): the stock is restored below.
        new.ready_at := null;
        new.ready_by := null;
      end if;
    elsif old.status in ('DISPATCH_READY', 'DISPATCHED', 'DELIVERED') then
      -- Frozen while the parcel is committed. Un-ready the order to edit these.
      if new.awb_number is distinct from old.awb_number
         or new.courier_name is distinct from old.courier_name
         or new.location_id is distinct from old.location_id then
        raise exception 'AWB, courier and location cannot be changed once the order is dispatch-ready'
          using errcode = 'restrict_violation';
      end if;
    end if;
  end if;

  new.total_amount := greatest(
    0,
    new.subtotal - new.discount_amount + new.tax_amount + new.shipping_amount
  );
  return new;
end;
$$;

create trigger orders_before_write
  before insert or update on public.orders
  for each row execute function internal.orders_before_write();
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function internal.set_updated_at();

-- Takes stock out when an order becomes DISPATCH_READY, and puts it back if it
-- is un-readied. Fires only on those two status edges.
create or replace function internal.orders_stock_movements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  record;
  v_count int := 0;
begin
  if new.status = 'DISPATCH_READY' and old.status = 'NEW' then
    for v_item in
      select product_id, variant_id, quantity from public.order_items where order_id = new.id
    loop
      v_count := v_count + 1;
      insert into public.inventory_movements
        (product_id, variant_id, location_id, movement_type, quantity,
         reference_type, reference_id, occurred_at, created_by, notes)
      values
        (v_item.product_id, v_item.variant_id, new.location_id, 'SALE', -v_item.quantity,
         'order', new.id, new.ready_at, auth.uid(),
         'Order ' || new.order_number || ' dispatch-ready (AWB ' || new.awb_number || ')');
    end loop;

    if v_count = 0 then
      raise exception 'Order % has no items, so there is nothing to dispatch', new.order_number
        using errcode = 'restrict_violation';
    end if;

  elsif old.status = 'DISPATCH_READY' and new.status in ('NEW', 'CANCELLED') then
    for v_item in
      select product_id, variant_id, quantity from public.order_items where order_id = new.id
    loop
      insert into public.inventory_movements
        (product_id, variant_id, location_id, movement_type, quantity,
         reference_type, reference_id, occurred_at, created_by, notes)
      values
        (v_item.product_id, v_item.variant_id, old.location_id, 'ADJUSTMENT', v_item.quantity,
         'order', new.id, now(), auth.uid(),
         'Order ' || new.order_number || case new.status
           when 'CANCELLED' then ' cancelled' else ' un-readied' end || ' — stock restored');
    end loop;
  end if;

  return new;
end;
$$;

create trigger orders_stock_movements
  after update on public.orders
  for each row execute function internal.orders_stock_movements();

alter table public.orders enable row level security;

-- ============================================================================
-- order_items
-- ============================================================================
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete restrict,
  variant_id      uuid references public.product_variants (id) on delete restrict,
  description     text,
  quantity        numeric(14,3) not null check (quantity > 0),
  unit_price      numeric(14,4) not null default 0 check (unit_price >= 0),
  discount_amount numeric(14,4) not null default 0 check (discount_amount >= 0),
  tax_rate        numeric(5,2)  not null default 0 check (tax_rate between 0 and 100),
  line_net   numeric(14,4) generated always as
               (round(quantity * unit_price - discount_amount, 4)) stored,
  line_tax   numeric(14,4) generated always as
               (round((quantity * unit_price - discount_amount) * tax_rate / 100.0, 4)) stored,
  line_total numeric(14,4) generated always as
               (round((quantity * unit_price - discount_amount) * (1 + tax_rate / 100.0), 4)) stored,
  created_at timestamptz not null default now(),
  constraint order_items_discount_ck check (discount_amount <= quantity * unit_price)
);
comment on table public.order_items is 'Lines of a sales order.';

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index order_items_variant_id_idx on public.order_items (variant_id) where variant_id is not null;

create or replace function internal.order_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  perform internal.assert_variant_of_product(new.product_id, new.variant_id);

  select status into v_status from public.orders where id = new.order_id;
  if v_status is not null and v_status <> 'NEW' then
    raise exception 'Order lines can only be changed while the order is NEW (it is %)', v_status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create or replace function internal.order_items_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  select status into v_status from public.orders where id = old.order_id;
  if v_status is not null and v_status <> 'NEW' then
    raise exception 'Order lines can only be removed while the order is NEW (it is %)', v_status
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

-- Recompute the parent order's subtotal / tax / total after any line change.
create or replace function internal.order_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric(14,4);
  v_tax      numeric(14,4);
begin
  if not exists (select 1 from public.orders where id = v_order_id) then
    return null;
  end if;

  select coalesce(sum(line_net), 0), coalesce(sum(line_tax), 0)
    into v_subtotal, v_tax
    from public.order_items
   where order_id = v_order_id;

  perform set_config('app.order_totals_write', 'on', true);
  update public.orders
     set subtotal = v_subtotal,
         tax_amount = v_tax,
         updated_at = now()
   where id = v_order_id;
  perform set_config('app.order_totals_write', 'off', true);

  return null;
end;
$$;

create trigger order_items_before_write
  before insert or update on public.order_items
  for each row execute function internal.order_items_before_write();
create trigger order_items_guard_delete
  before delete on public.order_items
  for each row execute function internal.order_items_guard_delete();
create trigger order_items_after_write
  after insert or update or delete on public.order_items
  for each row execute function internal.order_items_after_write();

alter table public.order_items enable row level security;

-- ============================================================================
-- returns
-- ============================================================================
create table public.returns (
  id             uuid primary key default gen_random_uuid(),
  return_number  extensions.citext not null,
  order_id       uuid not null references public.orders (id) on delete restrict,
  sales_channel  public.sales_channel not null,
  status         public.return_status not null default 'REQUESTED',
  reason         text,
  refund_amount  numeric(14,4) not null default 0 check (refund_amount >= 0),
  location_id    uuid references public.locations (id) on delete set null,
  requested_at   timestamptz not null default now(),
  authorized_at  timestamptz,
  authorized_by  uuid references public.profiles (id) on delete set null,
  received_at    timestamptz,
  refunded_at    timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null default auth.uid()
);
comment on table public.returns is
  'A customer return against an order. Stock is only posted back to inventory when status reaches RECEIVED.';

create unique index returns_return_number_key on public.returns (return_number);
create index returns_order_id_idx on public.returns (order_id);
create index returns_status_idx on public.returns (status);
create index returns_sales_channel_idx on public.returns (sales_channel);

create or replace function internal.returns_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if new.return_number is null or btrim(new.return_number::text) = '' then
    new.return_number := 'RET-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.return_number_seq')::text, 5, '0');
  end if;

  select * into v_order from public.orders where id = new.order_id;
  if not found then
    raise exception 'Order % not found', new.order_id using errcode = 'foreign_key_violation';
  end if;
  if v_order.dispatched_at is null then
    raise exception 'Order % has not been dispatched yet — nothing to return', v_order.order_number
      using errcode = 'restrict_violation';
  end if;

  new.sales_channel := v_order.sales_channel;
  if new.location_id is null then
    new.location_id := v_order.location_id;
  end if;

  return new;
end;
$$;

-- Guards the status ladder and posts a RETURN movement per line the moment a
-- return reaches RECEIVED (fires once, on the transition edge).
create or replace function internal.returns_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sales_channel := old.sales_channel;

  if new.status = 'AUTHORIZED' and old.status = 'REQUESTED' and new.authorized_at is null then
    new.authorized_at := now();
    new.authorized_by := auth.uid();
  end if;
  if new.status = 'RECEIVED' and new.received_at is null then
    new.received_at := now();
  end if;
  if new.status = 'REFUNDED' and new.refunded_at is null then
    new.refunded_at := now();
  end if;

  if old.status in ('RECEIVED', 'REFUNDED') and new.status not in ('RECEIVED', 'REFUNDED') then
    raise exception 'A return that has already been received cannot move back to %', new.status
      using errcode = 'restrict_violation';
  end if;
  if old.status = 'REJECTED' and new.status <> 'REJECTED' then
    raise exception 'A rejected return cannot be reopened' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create or replace function internal.returns_receive_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if new.status <> 'RECEIVED' or old.status = 'RECEIVED' then
    return new;
  end if;
  if new.location_id is null then
    raise exception 'A location is required to receive a return into stock'
      using errcode = 'restrict_violation';
  end if;

  for v_item in
    select product_id, variant_id, quantity from public.return_items where return_id = new.id
  loop
    insert into public.inventory_movements
      (product_id, variant_id, location_id, movement_type, quantity,
       reference_type, reference_id, occurred_at, created_by, notes)
    values
      (v_item.product_id, v_item.variant_id, new.location_id, 'RETURN', v_item.quantity,
       'return', new.id, now(), auth.uid(), 'Return ' || new.return_number);
  end loop;

  return new;
end;
$$;

create trigger returns_before_insert
  before insert on public.returns
  for each row execute function internal.returns_before_insert();
create trigger returns_before_update
  before update on public.returns
  for each row execute function internal.returns_before_update();
create trigger returns_receive_stock
  after update on public.returns
  for each row execute function internal.returns_receive_stock();
create trigger returns_set_updated_at
  before update on public.returns
  for each row execute function internal.set_updated_at();

alter table public.returns enable row level security;

-- ============================================================================
-- return_items
-- ============================================================================
create table public.return_items (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references public.returns (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  product_id    uuid not null references public.products (id) on delete restrict,
  variant_id    uuid references public.product_variants (id) on delete restrict,
  quantity      numeric(14,3) not null check (quantity > 0),
  condition     text,
  created_at    timestamptz not null default now(),
  constraint return_items_unique_line unique (return_id, order_item_id)
);
comment on table public.return_items is 'Lines of a return: which order line, how much of it.';

create index return_items_return_id_idx on public.return_items (return_id);
create index return_items_order_item_id_idx on public.return_items (order_item_id);

create or replace function internal.return_items_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return_order_id uuid;
  v_oi public.order_items;
  v_already_returned numeric;
begin
  select order_id into v_return_order_id from public.returns where id = new.return_id;
  select * into v_oi from public.order_items where id = new.order_item_id;

  if v_oi.order_id <> v_return_order_id then
    raise exception 'Order line % does not belong to the return''s order', new.order_item_id
      using errcode = 'check_violation';
  end if;

  new.product_id := v_oi.product_id;
  new.variant_id := v_oi.variant_id;

  select coalesce(sum(ri.quantity), 0) into v_already_returned
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
   where ri.order_item_id = new.order_item_id
     and r.status <> 'REJECTED';

  if v_already_returned + new.quantity > v_oi.quantity then
    raise exception
      'Over-return on order line %: ordered %, already returned %, tried to add %',
      v_oi.id, v_oi.quantity, v_already_returned, new.quantity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function internal.return_items_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.return_status;
begin
  select status into v_status from public.returns where id = old.return_id;
  if v_status in ('RECEIVED', 'REFUNDED') then
    raise exception 'Cannot remove a line from a return that has already been received'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger return_items_before_insert
  before insert on public.return_items
  for each row execute function internal.return_items_before_insert();
create trigger return_items_no_mutation
  before update on public.return_items
  for each row execute function internal.reject_mutation();
create trigger return_items_guard_delete
  before delete on public.return_items
  for each row execute function internal.return_items_guard_delete();

alter table public.return_items enable row level security;

-- ============================================================================
-- exchanges
-- ============================================================================
create table public.exchanges (
  id                uuid primary key default gen_random_uuid(),
  exchange_number   extensions.citext not null,
  original_order_id uuid not null references public.orders (id) on delete restrict,
  sales_channel     public.sales_channel not null,
  status            public.exchange_status not null default 'REQUESTED',
  reason            text,
  location_id       uuid references public.locations (id) on delete set null,
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references public.profiles (id) on delete set null,
  completed_at      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null default auth.uid()
);
comment on table public.exchanges is
  'A customer exchange (return one item, send another) against an original order. See original_order_id for the source order.';

create unique index exchanges_exchange_number_key on public.exchanges (exchange_number);
create index exchanges_original_order_id_idx on public.exchanges (original_order_id);
create index exchanges_status_idx on public.exchanges (status);
create index exchanges_sales_channel_idx on public.exchanges (sales_channel);

create or replace function internal.exchanges_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if new.exchange_number is null or btrim(new.exchange_number::text) = '' then
    new.exchange_number := 'EXC-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.exchange_number_seq')::text, 5, '0');
  end if;

  select * into v_order from public.orders where id = new.original_order_id;
  if not found then
    raise exception 'Order % not found', new.original_order_id using errcode = 'foreign_key_violation';
  end if;
  if v_order.dispatched_at is null then
    raise exception 'Order % has not been dispatched yet — nothing to exchange', v_order.order_number
      using errcode = 'restrict_violation';
  end if;

  new.sales_channel := v_order.sales_channel;
  if new.location_id is null then
    new.location_id := v_order.location_id;
  end if;

  return new;
end;
$$;

create or replace function internal.exchanges_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sales_channel := old.sales_channel;

  if new.status = 'APPROVED' and old.status = 'REQUESTED' and new.approved_at is null then
    new.approved_at := now();
    new.approved_by := auth.uid();
  end if;
  if new.status = 'COMPLETED' and new.completed_at is null then
    new.completed_at := now();
  end if;

  if old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
    raise exception 'A completed exchange cannot be reopened' using errcode = 'restrict_violation';
  end if;
  if old.status = 'REJECTED' and new.status <> 'REJECTED' then
    raise exception 'A rejected exchange cannot be reopened' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- On completion: the returned item comes back into stock (RETURN), the
-- replacement item ships out (SALE) — both through the ledger, both at once.
create or replace function internal.exchanges_complete_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then
    return new;
  end if;
  if new.location_id is null then
    raise exception 'A location is required to complete an exchange'
      using errcode = 'restrict_violation';
  end if;

  for v_item in
    select returned_product_id, returned_variant_id, returned_quantity,
           new_product_id, new_variant_id, new_quantity
    from public.exchange_items
    where exchange_id = new.id
  loop
    insert into public.inventory_movements
      (product_id, variant_id, location_id, movement_type, quantity,
       reference_type, reference_id, occurred_at, created_by, notes)
    values
      (v_item.returned_product_id, v_item.returned_variant_id, new.location_id, 'RETURN',
       v_item.returned_quantity, 'exchange', new.id, now(), auth.uid(),
       'Exchange ' || new.exchange_number || ' — item returned');

    insert into public.inventory_movements
      (product_id, variant_id, location_id, movement_type, quantity,
       reference_type, reference_id, occurred_at, created_by, notes)
    values
      (v_item.new_product_id, v_item.new_variant_id, new.location_id, 'SALE',
       -v_item.new_quantity, 'exchange', new.id, now(), auth.uid(),
       'Exchange ' || new.exchange_number || ' — replacement dispatched');
  end loop;

  return new;
end;
$$;

create trigger exchanges_before_insert
  before insert on public.exchanges
  for each row execute function internal.exchanges_before_insert();
create trigger exchanges_before_update
  before update on public.exchanges
  for each row execute function internal.exchanges_before_update();
create trigger exchanges_complete_stock
  after update on public.exchanges
  for each row execute function internal.exchanges_complete_stock();
create trigger exchanges_set_updated_at
  before update on public.exchanges
  for each row execute function internal.set_updated_at();

alter table public.exchanges enable row level security;

-- ============================================================================
-- exchange_items
-- ============================================================================
create table public.exchange_items (
  id                  uuid primary key default gen_random_uuid(),
  exchange_id         uuid not null references public.exchanges (id) on delete cascade,
  original_order_item_id uuid not null references public.order_items (id) on delete restrict,
  returned_product_id uuid not null references public.products (id) on delete restrict,
  returned_variant_id uuid references public.product_variants (id) on delete restrict,
  returned_quantity   numeric(14,3) not null check (returned_quantity > 0),
  new_product_id      uuid not null references public.products (id) on delete restrict,
  new_variant_id      uuid references public.product_variants (id) on delete restrict,
  new_quantity        numeric(14,3) not null check (new_quantity > 0),
  price_difference    numeric(14,4) not null default 0,
  created_at          timestamptz not null default now(),
  constraint exchange_items_unique_line unique (exchange_id, original_order_item_id)
);
comment on table public.exchange_items is
  'Lines of an exchange: which original order line is returned, and what product/qty replaces it.';

create index exchange_items_exchange_id_idx on public.exchange_items (exchange_id);
create index exchange_items_order_item_id_idx on public.exchange_items (original_order_item_id);

create or replace function internal.exchange_items_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exchange_order_id uuid;
  v_oi public.order_items;
begin
  select original_order_id into v_exchange_order_id
    from public.exchanges where id = new.exchange_id;
  select * into v_oi from public.order_items where id = new.original_order_item_id;

  if v_oi.order_id <> v_exchange_order_id then
    raise exception 'Order line % does not belong to the exchange''s original order',
      new.original_order_item_id
      using errcode = 'check_violation';
  end if;

  new.returned_product_id := v_oi.product_id;
  new.returned_variant_id := v_oi.variant_id;

  if new.returned_quantity > v_oi.quantity then
    raise exception 'Cannot exchange % units of a line that ordered only %',
      new.returned_quantity, v_oi.quantity
      using errcode = 'check_violation';
  end if;

  perform internal.assert_variant_of_product(new.new_product_id, new.new_variant_id);

  return new;
end;
$$;

create or replace function internal.exchange_items_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.exchange_status;
begin
  select status into v_status from public.exchanges where id = old.exchange_id;
  if v_status = 'COMPLETED' then
    raise exception 'Cannot remove a line from a completed exchange'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger exchange_items_before_insert
  before insert on public.exchange_items
  for each row execute function internal.exchange_items_before_insert();
create trigger exchange_items_no_mutation
  before update on public.exchange_items
  for each row execute function internal.reject_mutation();
create trigger exchange_items_guard_delete
  before delete on public.exchange_items
  for each row execute function internal.exchange_items_guard_delete();

alter table public.exchange_items enable row level security;

-- ============================================================================
-- create_order(): an order and its lines in one transaction
-- ============================================================================
-- SECURITY INVOKER (the default): runs as the caller, so RLS still decides who
-- may create orders. p_order is a JSON object of header fields, p_items a JSON
-- array of {product_id, variant_id?, quantity, unit_price?, discount_amount?,
-- tax_rate?}. Returns the new order id.
create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item' using errcode = 'check_violation';
  end if;

  insert into public.orders (
    sales_channel, external_order_id, customer_name, customer_phone, customer_email,
    shipping_address, location_id, order_date, courier_name, awb_number,
    discount_amount, shipping_amount, notes
  )
  values (
    coalesce(nullif(p_order ->> 'sales_channel', '')::public.sales_channel, 'MANUAL'),
    nullif(p_order ->> 'external_order_id', ''),
    nullif(p_order ->> 'customer_name', ''),
    nullif(p_order ->> 'customer_phone', ''),
    nullif(p_order ->> 'customer_email', ''),
    nullif(p_order ->> 'shipping_address', ''),
    nullif(p_order ->> 'location_id', '')::uuid,
    coalesce(nullif(p_order ->> 'order_date', '')::date, current_date),
    nullif(p_order ->> 'courier_name', ''),
    nullif(p_order ->> 'awb_number', ''),
    coalesce(nullif(p_order ->> 'discount_amount', '')::numeric, 0),
    coalesce(nullif(p_order ->> 'shipping_amount', '')::numeric, 0),
    nullif(p_order ->> 'notes', '')
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items
      (order_id, product_id, variant_id, quantity, unit_price, discount_amount, tax_rate)
    values (
      v_id,
      (v_item ->> 'product_id')::uuid,
      nullif(v_item ->> 'variant_id', '')::uuid,
      (v_item ->> 'quantity')::numeric,
      coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0),
      coalesce(nullif(v_item ->> 'discount_amount', '')::numeric, 0),
      coalesce(nullif(v_item ->> 'tax_rate', '')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;
comment on function public.create_order(jsonb, jsonb) is
  'Creates an order plus its lines atomically, as the calling user (RLS applies).';

-- ============================================================================
-- create_return() / create_exchange(): header + lines in one transaction
-- ============================================================================
-- Same contract as create_order(): SECURITY INVOKER (RLS applies), JSON header
-- and JSON array of lines, returns the new id. The row triggers still enforce
-- "order must be dispatched", over-return / over-exchange limits, and copy the
-- order's channel and location.
create or replace function public.create_return(p_return jsonb, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A return needs at least one item' using errcode = 'check_violation';
  end if;

  insert into public.returns (order_id, reason, location_id, notes)
  values (
    (p_return ->> 'order_id')::uuid,
    nullif(p_return ->> 'reason', ''),
    nullif(p_return ->> 'location_id', '')::uuid,
    nullif(p_return ->> 'notes', '')
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.return_items (return_id, order_item_id, quantity, condition)
    values (
      v_id,
      (v_item ->> 'order_item_id')::uuid,
      (v_item ->> 'quantity')::numeric,
      nullif(v_item ->> 'condition', '')
    );
  end loop;

  return v_id;
end;
$$;
comment on function public.create_return(jsonb, jsonb) is
  'Creates a return plus its lines atomically, as the calling user (RLS applies).';

create or replace function public.create_exchange(p_exchange jsonb, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An exchange needs at least one item' using errcode = 'check_violation';
  end if;

  insert into public.exchanges (original_order_id, reason, location_id, notes)
  values (
    (p_exchange ->> 'original_order_id')::uuid,
    nullif(p_exchange ->> 'reason', ''),
    nullif(p_exchange ->> 'location_id', '')::uuid,
    nullif(p_exchange ->> 'notes', '')
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.exchange_items
      (exchange_id, original_order_item_id, returned_quantity,
       new_product_id, new_variant_id, new_quantity, price_difference)
    values (
      v_id,
      (v_item ->> 'original_order_item_id')::uuid,
      (v_item ->> 'returned_quantity')::numeric,
      (v_item ->> 'new_product_id')::uuid,
      nullif(v_item ->> 'new_variant_id', '')::uuid,
      (v_item ->> 'new_quantity')::numeric,
      coalesce(nullif(v_item ->> 'price_difference', '')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;
comment on function public.create_exchange(jsonb, jsonb) is
  'Creates an exchange plus its lines atomically, as the calling user (RLS applies).';
