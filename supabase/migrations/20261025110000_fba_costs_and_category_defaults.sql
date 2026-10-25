-- ============================================================================
-- FBA targets: own cost/price per SKU, and cost/price defaults per category.
--
-- A target's cost per unit is resolved by the app in this order:
--   1. fba_targets.unit_cost            (set on the SKU, e.g. via bulk update)
--   2. its linked pricing calculation   (pricing_calculation_id)
--   3. fba_category_defaults.unit_cost  for the product's category
-- and the selling price per unit the same way (unit_price → the calculation's
-- selling price → the category default). NULL means "not set at this level".
-- ============================================================================

alter table public.fba_targets
  add column unit_cost  numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  add column unit_price numeric(14,2) check (unit_price is null or unit_price >= 0);

comment on column public.fba_targets.unit_cost is
  'Cost per unit set on this SKU; overrides the linked calculation and the category default.';
comment on column public.fba_targets.unit_price is
  'Selling price per unit set on this SKU; overrides the calculation and the category default.';

create table public.fba_category_defaults (
  category_id uuid primary key references public.categories (id) on delete cascade,
  unit_cost   numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  unit_price  numeric(14,2) check (unit_price is null or unit_price >= 0),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);
comment on table public.fba_category_defaults is
  'Default FBA cost/price per unit for every SKU in a category that has neither its own value nor a linked calculation.';

create trigger fba_category_defaults_set_updated_at
  before update on public.fba_category_defaults
  for each row execute function internal.set_updated_at();

alter table public.fba_category_defaults enable row level security;

create policy "fba_category_defaults: read" on public.fba_category_defaults
  for select to authenticated using (public.is_active_user());
create policy "fba_category_defaults: staff write" on public.fba_category_defaults
  for insert to authenticated with check (public.is_staff());
create policy "fba_category_defaults: staff update" on public.fba_category_defaults
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "fba_category_defaults: staff delete" on public.fba_category_defaults
  for delete to authenticated using (public.is_staff());

-- ----------------------------------------------------------------------------
-- save_fba_target: also save unit_cost / unit_price. When a key is absent from
-- p_target, an existing target keeps its current value (so callers that don't
-- know about these fields can't wipe them).
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
      product_id, variant_id, amazon_sku, fnsku, target_quantity, pricing_calculation_id, notes,
      unit_cost, unit_price
    )
    values (
      (p_target ->> 'product_id')::uuid,
      nullif(p_target ->> 'variant_id', '')::uuid,
      nullif(btrim(p_target ->> 'amazon_sku'), ''),
      nullif(btrim(p_target ->> 'fnsku'), ''),
      coalesce(nullif(p_target ->> 'target_quantity', '')::integer, 0),
      nullif(p_target ->> 'pricing_calculation_id', '')::uuid,
      nullif(btrim(p_target ->> 'notes'), ''),
      nullif(p_target ->> 'unit_cost', '')::numeric,
      nullif(p_target ->> 'unit_price', '')::numeric
    )
    returning id into v_id;
  else
    update public.fba_targets t set
      product_id             = (p_target ->> 'product_id')::uuid,
      variant_id             = nullif(p_target ->> 'variant_id', '')::uuid,
      amazon_sku             = nullif(btrim(p_target ->> 'amazon_sku'), ''),
      fnsku                  = nullif(btrim(p_target ->> 'fnsku'), ''),
      target_quantity        = coalesce(nullif(p_target ->> 'target_quantity', '')::integer, 0),
      pricing_calculation_id = nullif(p_target ->> 'pricing_calculation_id', '')::uuid,
      notes                  = nullif(btrim(p_target ->> 'notes'), ''),
      unit_cost  = case when p_target ? 'unit_cost'
                        then nullif(p_target ->> 'unit_cost', '')::numeric else t.unit_cost end,
      unit_price = case when p_target ? 'unit_price'
                        then nullif(p_target ->> 'unit_price', '')::numeric else t.unit_price end
    where t.id = v_id;
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
