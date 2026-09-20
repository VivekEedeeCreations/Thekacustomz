-- ============================================================================
-- 05 · Purchasing: purchase orders, order items, receipts, receipt items
-- ============================================================================
-- Receiving supports partial deliveries and can never over-receive or double
-- receive a line:
--   * purchase_order_items.quantity_received is trigger-maintained and guarded
--   * CHECK (quantity_received <= quantity_ordered) is the hard backstop
--   * receipts / receipt items are append-only
--   * UNIQUE (receipt, po_item) stops the same line twice in one receipt
--   * purchase_receipts.idempotency_key stops a retried API call posting twice
--   * the PO row is locked FOR UPDATE while a receipt is processed
-- ============================================================================

create type public.purchase_order_status as enum (
  'DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED'
);

create sequence if not exists public.purchase_order_number_seq;
create sequence if not exists public.purchase_receipt_number_seq;

-- ============================================================================
-- purchase_orders
-- ============================================================================
create table public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  po_number       extensions.citext not null,
  vendor_id       uuid not null references public.vendors (id) on delete restrict,
  location_id     uuid references public.locations (id) on delete set null,
  status          public.purchase_order_status not null default 'DRAFT',
  order_date      date not null default current_date,
  expected_date   date,
  currency        text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  subtotal        numeric(14,4) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,4) not null default 0 check (discount_amount >= 0),
  tax_amount      numeric(14,4) not null default 0 check (tax_amount >= 0),
  shipping_amount numeric(14,4) not null default 0 check (shipping_amount >= 0),
  total_amount    numeric(14,4) not null default 0 check (total_amount >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  approved_by     uuid references public.profiles (id) on delete set null,
  approved_at     timestamptz,
  constraint purchase_orders_dates_ck check (expected_date is null or expected_date >= order_date)
);
comment on table public.purchase_orders is
  'Vendor purchase order header. Monetary totals are trigger-maintained from the line items.';

create unique index purchase_orders_po_number_key on public.purchase_orders (po_number);
create index purchase_orders_vendor_id_idx        on public.purchase_orders (vendor_id);
create index purchase_orders_status_idx           on public.purchase_orders (status);
create index purchase_orders_order_date_idx       on public.purchase_orders (order_date desc);

-- Assigns the PO number on insert and keeps totals authoritative on every write.
create or replace function internal.purchase_orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.po_number is null or btrim(new.po_number::text) = '' then
      new.po_number := 'PO-' || to_char(now(), 'YYYY') || '-'
        || lpad(nextval('public.purchase_order_number_seq')::text, 5, '0');
    end if;
    -- A new PO has no items yet.
    new.subtotal   := 0;
    new.tax_amount := 0;
  else
    -- Line-item totals are owned by the item trigger; clients cannot set them
    -- except through that trusted path.
    if current_setting('app.po_totals_write', true) is distinct from 'on' then
      new.subtotal   := old.subtotal;
      new.tax_amount := old.tax_amount;
    end if;
  end if;

  new.total_amount := greatest(
    0,
    new.subtotal - new.discount_amount + new.tax_amount + new.shipping_amount
  );
  return new;
end;
$$;

create trigger purchase_orders_before_write
  before insert or update on public.purchase_orders
  for each row execute function internal.purchase_orders_before_write();
create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function internal.set_updated_at();

alter table public.purchase_orders enable row level security;

-- ============================================================================
-- purchase_order_items
-- ============================================================================
create table public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete restrict,
  variant_id        uuid references public.product_variants (id) on delete restrict,
  description       text,
  quantity_ordered  numeric(14,3) not null check (quantity_ordered > 0),
  unit_cost         numeric(14,4) not null default 0 check (unit_cost >= 0),
  discount_amount   numeric(14,4) not null default 0 check (discount_amount >= 0),
  tax_rate          numeric(5,2)  not null default 0 check (tax_rate between 0 and 100),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  line_net   numeric(14,4) generated always as
               (round(quantity_ordered * unit_cost - discount_amount, 4)) stored,
  line_tax   numeric(14,4) generated always as
               (round((quantity_ordered * unit_cost - discount_amount) * tax_rate / 100.0, 4)) stored,
  line_total numeric(14,4) generated always as
               (round((quantity_ordered * unit_cost - discount_amount) * (1 + tax_rate / 100.0), 4)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_items_not_over_received check (quantity_received <= quantity_ordered),
  constraint purchase_order_items_discount_ck check (discount_amount <= quantity_ordered * unit_cost)
);
comment on table public.purchase_order_items is
  'Lines of a purchase order. quantity_received is maintained by goods receipts only.';

create index purchase_order_items_po_idx      on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_product_idx on public.purchase_order_items (product_id);
create index purchase_order_items_variant_idx on public.purchase_order_items (variant_id) where variant_id is not null;

create or replace function internal.purchase_order_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform internal.assert_variant_of_product(new.product_id, new.variant_id);

  if tg_op = 'UPDATE'
     and new.quantity_received is distinct from old.quantity_received
     and current_setting('app.po_receiving', true) is distinct from 'on' then
    raise exception 'quantity_received is maintained by goods receipts and cannot be edited directly'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'INSERT'
     and new.quantity_received <> 0
     and current_setting('app.po_receiving', true) is distinct from 'on' then
    raise exception 'New purchase order lines must start with quantity_received = 0'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- Recompute the parent PO's subtotal / tax / total after any line change.
create or replace function internal.purchase_order_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po_id    uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  v_subtotal numeric(14,4);
  v_tax      numeric(14,4);
begin
  -- Parent PO already gone (e.g. cascade delete): nothing to recompute.
  if not exists (select 1 from public.purchase_orders where id = v_po_id) then
    return null;
  end if;

  select coalesce(sum(line_net), 0), coalesce(sum(line_tax), 0)
    into v_subtotal, v_tax
    from public.purchase_order_items
   where purchase_order_id = v_po_id;

  perform set_config('app.po_totals_write', 'on', true);
  update public.purchase_orders
     set subtotal   = v_subtotal,
         tax_amount = v_tax,
         updated_at = now()
   where id = v_po_id;
  perform set_config('app.po_totals_write', 'off', true);

  return null;
end;
$$;

create or replace function internal.purchase_order_items_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.quantity_received > 0
     and current_setting('app.po_receiving', true) is distinct from 'on' then
    raise exception 'Cannot delete purchase order line % — it has recorded receipts', old.id
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger purchase_order_items_before_write
  before insert or update on public.purchase_order_items
  for each row execute function internal.purchase_order_items_before_write();
create trigger purchase_order_items_after_write
  after insert or update or delete on public.purchase_order_items
  for each row execute function internal.purchase_order_items_after_write();
create trigger purchase_order_items_guard_delete
  before delete on public.purchase_order_items
  for each row execute function internal.purchase_order_items_guard_delete();
create trigger purchase_order_items_set_updated_at
  before update on public.purchase_order_items
  for each row execute function internal.set_updated_at();

alter table public.purchase_order_items enable row level security;

-- ============================================================================
-- purchase_receipts  (Goods Receipt Note — append-only)
-- ============================================================================
create table public.purchase_receipts (
  id                    uuid primary key default gen_random_uuid(),
  receipt_number        extensions.citext not null,
  purchase_order_id     uuid not null references public.purchase_orders (id) on delete restrict,
  location_id           uuid not null references public.locations (id) on delete restrict,
  received_date         date not null default current_date,
  vendor_invoice_number text,
  idempotency_key       text,
  notes                 text,
  created_at            timestamptz not null default now(),
  received_by           uuid references public.profiles (id) on delete set null default auth.uid()
);
comment on table public.purchase_receipts is
  'A single goods-in event against a purchase order. Immutable once posted.';
comment on column public.purchase_receipts.idempotency_key is
  'Optional client-supplied key; unique, so a retried receive call cannot post twice.';

create unique index purchase_receipts_number_key on public.purchase_receipts (receipt_number);
create unique index purchase_receipts_idempotency_key
  on public.purchase_receipts (idempotency_key) where idempotency_key is not null;
create index purchase_receipts_po_idx            on public.purchase_receipts (purchase_order_id);
create index purchase_receipts_received_date_idx on public.purchase_receipts (received_date desc);

create or replace function internal.purchase_receipts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.purchase_order_status;
begin
  if new.receipt_number is null or btrim(new.receipt_number::text) = '' then
    new.receipt_number := 'GRN-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.purchase_receipt_number_seq')::text, 5, '0');
  end if;

  -- Lock the PO for the duration of the transaction: concurrent receipts against
  -- the same PO serialize here.
  select status into v_status
    from public.purchase_orders
   where id = new.purchase_order_id
   for update;

  if not found then
    raise exception 'Purchase order % not found', new.purchase_order_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_status not in ('SUBMITTED', 'PARTIALLY_RECEIVED') then
    raise exception 'Purchase order is % and cannot receive goods', v_status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger purchase_receipts_before_insert
  before insert on public.purchase_receipts
  for each row execute function internal.purchase_receipts_before_insert();
create trigger purchase_receipts_no_mutation
  before update or delete on public.purchase_receipts
  for each row execute function internal.reject_mutation();

alter table public.purchase_receipts enable row level security;

-- ============================================================================
-- purchase_receipt_items  (append-only)
-- ============================================================================
create table public.purchase_receipt_items (
  id                     uuid primary key default gen_random_uuid(),
  purchase_receipt_id    uuid not null references public.purchase_receipts (id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items (id) on delete restrict,
  quantity_received      numeric(14,3) not null check (quantity_received > 0),
  unit_cost              numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  notes                  text,
  created_at             timestamptz not null default now(),
  constraint purchase_receipt_items_unique_line unique (purchase_receipt_id, purchase_order_item_id)
);
comment on table public.purchase_receipt_items is
  'Quantities received per PO line within one receipt. Drives stock-in and PO status.';

create index purchase_receipt_items_receipt_idx on public.purchase_receipt_items (purchase_receipt_id);
create index purchase_receipt_items_po_item_idx on public.purchase_receipt_items (purchase_order_item_id);

-- Validate the line, default its cost, and reject over-receipt with a clear message.
create or replace function internal.purchase_receipt_items_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_po uuid;
  v_poi        public.purchase_order_items;
begin
  select purchase_order_id into v_receipt_po
    from public.purchase_receipts
   where id = new.purchase_receipt_id;

  select * into v_poi
    from public.purchase_order_items
   where id = new.purchase_order_item_id
   for update;

  if v_poi.purchase_order_id <> v_receipt_po then
    raise exception 'PO line % does not belong to the receipt''s purchase order', new.purchase_order_item_id
      using errcode = 'check_violation';
  end if;

  if new.unit_cost is null then
    new.unit_cost := v_poi.unit_cost;
  end if;

  if v_poi.quantity_received + new.quantity_received > v_poi.quantity_ordered then
    raise exception
      'Over-receipt on PO line %: ordered %, already received %, tried to add %',
      v_poi.id, v_poi.quantity_ordered, v_poi.quantity_received, new.quantity_received
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Apply the receipt line: bump received qty, post the stock movement, refresh PO status.
create or replace function internal.purchase_receipt_items_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt  public.purchase_receipts;
  v_poi      public.purchase_order_items;
  v_all_done boolean;
  v_any_recv boolean;
begin
  select * into v_receipt from public.purchase_receipts    where id = new.purchase_receipt_id;
  select * into v_poi     from public.purchase_order_items  where id = new.purchase_order_item_id;

  -- 1) received quantity on the PO line (guarded column; CHECK is the backstop)
  perform set_config('app.po_receiving', 'on', true);
  update public.purchase_order_items
     set quantity_received = quantity_received + new.quantity_received,
         updated_at = now()
   where id = new.purchase_order_item_id;

  -- 2) stock in, through the ledger
  insert into public.inventory_movements
    (product_id, variant_id, location_id, movement_type, quantity, unit_cost,
     reference_type, reference_id, occurred_at, created_by, notes)
  values
    (v_poi.product_id, v_poi.variant_id, v_receipt.location_id, 'PURCHASE',
     new.quantity_received, new.unit_cost,
     'purchase_receipt_item', new.id, v_receipt.received_date::timestamptz,
     v_receipt.received_by, new.notes);

  -- 3) PO status: RECEIVED when every line is complete, else PARTIALLY_RECEIVED
  select bool_and(quantity_received >= quantity_ordered),
         bool_or(quantity_received > 0)
    into v_all_done, v_any_recv
    from public.purchase_order_items
   where purchase_order_id = v_receipt.purchase_order_id;

  update public.purchase_orders
     set status = case
                    when v_all_done then 'RECEIVED'
                    when v_any_recv then 'PARTIALLY_RECEIVED'
                    else status
                  end,
         updated_at = now()
   where id = v_receipt.purchase_order_id
     and status in ('SUBMITTED', 'PARTIALLY_RECEIVED');

  perform set_config('app.po_receiving', 'off', true);
  return null;
end;
$$;

create trigger purchase_receipt_items_before_insert
  before insert on public.purchase_receipt_items
  for each row execute function internal.purchase_receipt_items_before_insert();
create trigger purchase_receipt_items_after_insert
  after insert on public.purchase_receipt_items
  for each row execute function internal.purchase_receipt_items_after_insert();
create trigger purchase_receipt_items_no_mutation
  before update or delete on public.purchase_receipt_items
  for each row execute function internal.reject_mutation();

alter table public.purchase_receipt_items enable row level security;
