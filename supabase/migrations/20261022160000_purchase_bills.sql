-- ============================================================================
-- Purchase bills: record a vendor purchase in one step, with bill images.
--
-- purchase_orders.vendor_bill_number
--     The vendor's own invoice / bill number.
--
-- purchase_documents
--     Files attached to a purchase (photos or PDFs of the bill). Rows point at
--     objects in the private `purchase-bills` bucket under
--     purchases/<purchase_order_id>/<file>.
--
-- public.record_purchase(p_purchase, p_items) → purchase_order id
--     Creates the purchase (status SUBMITTED) and its lines and, when
--     p_purchase.receive is true, a goods receipt for every line in full, so
--     the existing receipt triggers add the stock and mark it RECEIVED, all
--     in one transaction. Runs as the caller (RLS applies).
-- ============================================================================

alter table public.purchase_orders add column vendor_bill_number text
  check (vendor_bill_number is null or length(btrim(vendor_bill_number)) between 1 and 80);
comment on column public.purchase_orders.vendor_bill_number is
  'The vendor''s invoice / bill number for this purchase.';
create index purchase_orders_vendor_bill_idx on public.purchase_orders (vendor_id, vendor_bill_number)
  where vendor_bill_number is not null;

-- ----------------------------------------------------------------------------
-- Bill attachments
-- ----------------------------------------------------------------------------
create table public.purchase_documents (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  storage_path      text not null unique,
  file_name         text,
  content_type      text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
comment on table public.purchase_documents is
  'Bill photos / PDFs attached to a purchase; files live in the private purchase-bills bucket.';

create index purchase_documents_po_idx on public.purchase_documents (purchase_order_id);

alter table public.purchase_documents enable row level security;

-- Bills carry prices and vendor details: STAFF+ only, unlike product images.
create policy "purchase_documents: staff read" on public.purchase_documents for select to authenticated
  using (public.is_staff());
create policy "purchase_documents: staff insert" on public.purchase_documents for insert to authenticated
  with check (public.is_staff());
create policy "purchase_documents: staff delete" on public.purchase_documents for delete to authenticated
  using (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-bills',
  'purchase-bills',
  false,
  10485760, -- 10 MiB
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "purchase-bills: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'purchase-bills' and public.is_staff());

create policy "purchase-bills: staff upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'purchase-bills'
    and public.is_staff()
    and coalesce((storage.foldername(name))[1], '') = 'purchases'
  );

create policy "purchase-bills: staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'purchase-bills' and public.is_staff());

-- ----------------------------------------------------------------------------
-- record_purchase(p_purchase, p_items)
--
-- p_purchase: { vendor_id, location_id?, order_date?, vendor_bill_number?,
--               discount_amount?, shipping_amount?, notes?, receive? }
-- p_items:    [{ product_id, variant_id?, quantity, unit_cost, tax_rate?, description? }]
-- ----------------------------------------------------------------------------
create or replace function public.record_purchase(p_purchase jsonb, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id       uuid;
  v_receipt  uuid;
  v_receive  boolean := coalesce((p_purchase ->> 'receive')::boolean, false);
  v_location uuid := nullif(p_purchase ->> 'location_id', '')::uuid;
  v_date     date := coalesce(nullif(p_purchase ->> 'order_date', '')::date, current_date);
  v_bill     text := nullif(btrim(p_purchase ->> 'vendor_bill_number'), '');
  v_item     jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase needs at least one item' using errcode = 'check_violation';
  end if;
  if v_receive and v_location is null then
    raise exception 'Choose the location the goods were received into'
      using errcode = 'check_violation';
  end if;

  insert into public.purchase_orders (
    vendor_id, location_id, status, order_date, vendor_bill_number,
    discount_amount, shipping_amount, notes
  )
  values (
    (p_purchase ->> 'vendor_id')::uuid,
    v_location,
    'SUBMITTED',
    v_date,
    v_bill,
    coalesce(nullif(p_purchase ->> 'discount_amount', '')::numeric, 0),
    coalesce(nullif(p_purchase ->> 'shipping_amount', '')::numeric, 0),
    nullif(btrim(p_purchase ->> 'notes'), '')
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.purchase_order_items
      (purchase_order_id, product_id, variant_id, description, quantity_ordered, unit_cost, tax_rate)
    values (
      v_id,
      (v_item ->> 'product_id')::uuid,
      nullif(v_item ->> 'variant_id', '')::uuid,
      nullif(btrim(v_item ->> 'description'), ''),
      (v_item ->> 'quantity')::numeric,
      coalesce(nullif(v_item ->> 'unit_cost', '')::numeric, 0),
      coalesce(nullif(v_item ->> 'tax_rate', '')::numeric, 0)
    );
  end loop;

  if v_receive then
    insert into public.purchase_receipts
      (purchase_order_id, location_id, received_date, vendor_invoice_number)
    values (v_id, v_location, v_date, v_bill)
    returning id into v_receipt;

    insert into public.purchase_receipt_items (purchase_receipt_id, purchase_order_item_id, quantity_received)
    select v_receipt, poi.id, poi.quantity_ordered
      from public.purchase_order_items poi
     where poi.purchase_order_id = v_id;
  end if;

  return v_id;
end;
$$;
comment on function public.record_purchase(jsonb, jsonb) is
  'Creates a purchase with its lines and, optionally, receives it in full into stock — atomically.';
