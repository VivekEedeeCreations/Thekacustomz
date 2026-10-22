-- ============================================================================
-- FBA targets: finished items to send to an Amazon FBA warehouse.
--
-- fba_targets           one row per catalog product/variant we want stocked at
--                       FBA, with the quantity to ship, the Amazon SKU/FNSKU,
--                       and an optional saved price calculation for its cost.
-- fba_target_materials  the raw materials that go into ONE finished unit
--                       (quantity_per_unit can be > 1, e.g. 2 stickers per mug).
--                       Total needed = quantity_per_unit × target_quantity.
--
-- Nothing here moves stock; it's a planning list. Writes go through
-- public.save_fba_target() so a target and its materials change together.
--
-- Access mirrors the catalog: active users read, STAFF+ write, ADMIN+ delete.
-- ============================================================================

create table public.fba_targets (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products (id) on delete cascade,
  variant_id             uuid references public.product_variants (id) on delete cascade,
  variant_key            uuid generated always as
                           (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  amazon_sku             text check (amazon_sku is null or length(btrim(amazon_sku)) between 1 and 80),
  fnsku                  text check (fnsku is null or length(btrim(fnsku)) between 1 and 40),
  target_quantity        integer not null default 0 check (target_quantity >= 0),
  pricing_calculation_id uuid references public.pricing_calculations (id) on delete set null,
  notes                  text,
  created_by             uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint fba_targets_unique_item unique (product_id, variant_key)
);
comment on table public.fba_targets is
  'Finished products/variants planned for Amazon FBA, with a target quantity to ship.';

create table public.fba_target_materials (
  id                  uuid primary key default gen_random_uuid(),
  fba_target_id       uuid not null references public.fba_targets (id) on delete cascade,
  material_product_id uuid not null references public.products (id) on delete restrict,
  material_variant_id uuid references public.product_variants (id) on delete restrict,
  material_variant_key uuid generated always as
                         (coalesce(material_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  quantity_per_unit   numeric(12,3) not null check (quantity_per_unit > 0),
  created_at          timestamptz not null default now(),
  constraint fba_target_materials_unique unique (fba_target_id, material_product_id, material_variant_key)
);
comment on table public.fba_target_materials is
  'Raw materials consumed per finished unit of an FBA target.';

create index fba_target_materials_target_idx   on public.fba_target_materials (fba_target_id);
create index fba_target_materials_material_idx on public.fba_target_materials (material_product_id);

create trigger fba_targets_set_updated_at
  before update on public.fba_targets
  for each row execute function internal.set_updated_at();

create or replace function internal.fba_targets_assert_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform internal.assert_variant_of_product(new.product_id, new.variant_id);
  return new;
end;
$$;

create trigger fba_targets_assert_variant
  before insert or update on public.fba_targets
  for each row execute function internal.fba_targets_assert_variant();

create or replace function internal.fba_target_materials_assert_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform internal.assert_variant_of_product(new.material_product_id, new.material_variant_id);
  return new;
end;
$$;

create trigger fba_target_materials_assert_variant
  before insert or update on public.fba_target_materials
  for each row execute function internal.fba_target_materials_assert_variant();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.fba_targets enable row level security;
alter table public.fba_target_materials enable row level security;

create policy "fba_targets: read" on public.fba_targets for select to authenticated
  using (public.is_active_user());
create policy "fba_targets: staff write" on public.fba_targets for insert to authenticated
  with check (public.is_staff());
create policy "fba_targets: staff update" on public.fba_targets for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "fba_targets: admin delete" on public.fba_targets for delete to authenticated
  using (public.is_admin());

-- Material lines are part of a target's definition: STAFF+ may replace them
-- (save_fba_target deletes and re-inserts the set).
create policy "fba_target_materials: read" on public.fba_target_materials for select to authenticated
  using (public.is_active_user());
create policy "fba_target_materials: staff write" on public.fba_target_materials for insert to authenticated
  with check (public.is_staff());
create policy "fba_target_materials: staff update" on public.fba_target_materials for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "fba_target_materials: staff delete" on public.fba_target_materials for delete to authenticated
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- save_fba_target(p_target, p_materials) → target id
--
-- p_target:    { id?, product_id, variant_id?, amazon_sku?, fnsku?,
--                target_quantity, pricing_calculation_id?, notes? }
-- p_materials: [{ material_product_id, material_variant_id?, quantity_per_unit }]
--
-- Inserts (no id) or updates the target, then replaces its material lines, all
-- in one transaction. Runs as the caller, so the RLS policies above apply.
-- ----------------------------------------------------------------------------
create or replace function public.save_fba_target(p_target jsonb, p_materials jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_target ->> 'id', '')::uuid;
begin
  if p_materials is not null and jsonb_typeof(p_materials) <> 'array' then
    raise exception 'p_materials must be an array' using errcode = 'invalid_parameter_value';
  end if;

  if v_id is null then
    insert into public.fba_targets (
      product_id, variant_id, amazon_sku, fnsku, target_quantity, pricing_calculation_id, notes
    )
    values (
      (p_target ->> 'product_id')::uuid,
      nullif(p_target ->> 'variant_id', '')::uuid,
      nullif(btrim(p_target ->> 'amazon_sku'), ''),
      nullif(btrim(p_target ->> 'fnsku'), ''),
      coalesce(nullif(p_target ->> 'target_quantity', '')::integer, 0),
      nullif(p_target ->> 'pricing_calculation_id', '')::uuid,
      nullif(btrim(p_target ->> 'notes'), '')
    )
    returning id into v_id;
  else
    update public.fba_targets set
      product_id             = (p_target ->> 'product_id')::uuid,
      variant_id             = nullif(p_target ->> 'variant_id', '')::uuid,
      amazon_sku             = nullif(btrim(p_target ->> 'amazon_sku'), ''),
      fnsku                  = nullif(btrim(p_target ->> 'fnsku'), ''),
      target_quantity        = coalesce(nullif(p_target ->> 'target_quantity', '')::integer, 0),
      pricing_calculation_id = nullif(p_target ->> 'pricing_calculation_id', '')::uuid,
      notes                  = nullif(btrim(p_target ->> 'notes'), '')
    where id = v_id;
    if not found then
      raise exception 'FBA target % not found', v_id using errcode = 'no_data_found';
    end if;
  end if;

  delete from public.fba_target_materials where fba_target_id = v_id;

  insert into public.fba_target_materials (
    fba_target_id, material_product_id, material_variant_id, quantity_per_unit
  )
  select
    v_id,
    (m ->> 'material_product_id')::uuid,
    nullif(m ->> 'material_variant_id', '')::uuid,
    (m ->> 'quantity_per_unit')::numeric
  from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) as m;

  return v_id;
end;
$$;
comment on function public.save_fba_target(jsonb, jsonb) is
  'Upserts an FBA target and replaces its raw-material lines atomically.';
