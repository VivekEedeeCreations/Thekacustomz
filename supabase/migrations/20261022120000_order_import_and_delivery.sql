-- ============================================================================
-- Order CSV import support + delivery tracking.
--
-- sku_aliases          remembers how an outside SKU (an Amazon seller SKU,
--                      a Shopify SKU, or — when a sheet row has no SKU — a
--                      description key) maps to a catalog product/variant,
--                      so the next CSV import matches it automatically.
--
-- orders.delivered_at  when the order was marked DELIVERED. Drives the
--                      dashboard's "return window open" list. Set by trigger
--                      on the DISPATCHED → DELIVERED transition; a caller may
--                      supply an earlier time on that same update (e.g.
--                      back-filling the real delivery date), otherwise it's
--                      now(). It can't be edited afterwards.
-- ============================================================================

create table public.sku_aliases (
  id           uuid primary key default gen_random_uuid(),
  external_key text not null check (length(btrim(external_key)) between 1 and 300),
  product_id   uuid not null references public.products (id) on delete cascade,
  variant_id   uuid references public.product_variants (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.sku_aliases is
  'Outside SKU / description key → catalog product/variant, remembered by the order CSV import.';
comment on column public.sku_aliases.external_key is
  'Matched case-insensitively. Either a channel SKU, or "item:<item>|<design>|<size>|<color>" for rows without one.';

create unique index sku_aliases_external_key_key on public.sku_aliases (lower(external_key));

create trigger sku_aliases_set_updated_at
  before update on public.sku_aliases
  for each row execute function internal.set_updated_at();

create or replace function internal.sku_aliases_assert_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.external_key := btrim(new.external_key);
  perform internal.assert_variant_of_product(new.product_id, new.variant_id);
  return new;
end;
$$;

create trigger sku_aliases_assert_variant
  before insert or update on public.sku_aliases
  for each row execute function internal.sku_aliases_assert_variant();

alter table public.sku_aliases enable row level security;

create policy "sku_aliases: read" on public.sku_aliases for select to authenticated
  using (public.is_active_user());
create policy "sku_aliases: staff write" on public.sku_aliases for insert to authenticated
  with check (public.is_staff());
create policy "sku_aliases: staff update" on public.sku_aliases for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "sku_aliases: admin delete" on public.sku_aliases for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- orders.delivered_at
-- ----------------------------------------------------------------------------
alter table public.orders add column delivered_at timestamptz;
comment on column public.orders.delivered_at is
  'When the order was marked DELIVERED (start of the customer''s return window).';

create index orders_delivered_at_idx on public.orders (delivered_at desc)
  where delivered_at is not null;

create or replace function internal.orders_track_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.delivered_at := null;
  elsif new.status = 'DELIVERED' and old.status is distinct from 'DELIVERED' then
    -- Accept a back-dated time supplied with the transition, never a future one.
    if new.delivered_at is null
       or new.delivered_at is not distinct from old.delivered_at
       or new.delivered_at > now() then
      new.delivered_at := now();
    end if;
  else
    new.delivered_at := old.delivered_at;
  end if;
  return new;
end;
$$;

-- Named to sort after orders_before_write, which validates the transition first.
create trigger orders_track_delivery
  before insert or update on public.orders
  for each row execute function internal.orders_track_delivery();
