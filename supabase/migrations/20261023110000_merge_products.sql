-- ============================================================================
-- Merge two parent products into one.
--
-- When the same design was created as two parent products (each with its own
-- SKU and variants), public.merge_products(p_keep, p_merge) moves every
-- variant of p_merge under p_keep, carries everything that points at those
-- variants along, moves p_merge's own barcodes / images / SKU aliases to
-- p_keep, and deletes the now-empty p_merge. All in one transaction; ADMIN+.
--
-- What moves with each variant (product_id re-pointed to p_keep):
--   inventory, inventory_movements, order_items, purchase_order_items,
--   return_items, exchange_items (returned_* and new_*), fba_targets,
--   fba_target_materials, sku_aliases.
-- Variant barcodes and images reference the variant only, so they need nothing.
--
-- Prices: a variant with no own cost/selling price/HSN inherits its parent's.
-- Before moving, those blanks are filled with p_merge's values (when they
-- differ from p_keep's), so no variant's effective price changes.
--
-- Refused when p_merge itself (not one of its variants) has stock history,
-- orders, purchases, returns, exchanges or an FBA entry: that history belongs
-- to a "no variant" item that p_keep has no place for. Turn it into a variant
-- first, or keep both products.
--
-- Some of these rows are normally locked: inventory_movements, return_items
-- and exchange_items are append-only, order lines are frozen once an order
-- leaves NEW, and inventory is written only by the movement trigger. Re-pointing
-- a moved variant's rows to its new parent changes no quantity, price or
-- status, so this function opens a transaction-local `app.catalog_merge`
-- window that those guards honour. Nothing else sets it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Guards: allow UPDATE (never DELETE) while a merge is running.
-- ----------------------------------------------------------------------------
create or replace function internal.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- public.merge_products() re-points rows of a moved variant to its new parent.
  if tg_op = 'UPDATE' and current_setting('app.catalog_merge', true) = 'on' then
    return new;
  end if;
  raise exception
    '%.% is append-only; % is not permitted. Post a compensating row instead.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
  return null;
end;
$$;
comment on function internal.reject_mutation() is
  'BEFORE UPDATE OR DELETE trigger: enforces append-only semantics (except re-pointing during merge_products).';

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

  -- public.merge_products() may re-point lines of any order to the merged-into product.
  if tg_op = 'UPDATE' and current_setting('app.catalog_merge', true) = 'on' then
    return new;
  end if;

  select status into v_status from public.orders where id = new.order_id;
  if v_status is not null and v_status <> 'NEW' then
    raise exception 'Order lines can only be changed while the order is NEW (it is %)', v_status
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- merge_products(p_keep, p_merge) → number of variants moved
-- ----------------------------------------------------------------------------
create or replace function public.merge_products(p_keep uuid, p_merge uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep    public.products;
  v_merge   public.products;
  v_moved   integer;
  v_offset  integer;
  v_blocker text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can merge products' using errcode = 'insufficient_privilege';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different products to merge' using errcode = 'invalid_parameter_value';
  end if;

  -- Lock both, in a fixed order so two opposite merges can't deadlock.
  perform 1 from public.products where id in (p_keep, p_merge) order by id for update;
  select * into v_keep  from public.products where id = p_keep;
  select * into v_merge from public.products where id = p_merge;
  if v_keep.id is null or v_merge.id is null then
    raise exception 'Product not found' using errcode = 'no_data_found';
  end if;

  -- History that belongs to the merged product itself (no variant) can't be moved.
  select string_agg(what, ', ') into v_blocker from (
    select 'stock history' as what where exists (
      select 1 from public.inventory_movements where product_id = p_merge and variant_id is null)
    union all select 'orders' where exists (
      select 1 from public.order_items where product_id = p_merge and variant_id is null)
    union all select 'purchases' where exists (
      select 1 from public.purchase_order_items where product_id = p_merge and variant_id is null)
    union all select 'returns' where exists (
      select 1 from public.return_items where product_id = p_merge and variant_id is null)
    union all select 'exchanges' where exists (
      select 1 from public.exchange_items
       where (returned_product_id = p_merge and returned_variant_id is null)
          or (new_product_id = p_merge and new_variant_id is null))
    union all select 'FBA targets' where exists (
      select 1 from public.fba_targets where product_id = p_merge and variant_id is null)
    union all select 'FBA raw materials' where exists (
      select 1 from public.fba_target_materials
       where material_product_id = p_merge and material_variant_id is null)
  ) b;
  if v_blocker is not null then
    raise exception
      '"%" itself (not one of its variants) has %, so it can''t be merged away. Merge the other way round, or keep both.',
      v_merge.name, v_blocker
      using errcode = 'restrict_violation';
  end if;

  perform set_config('app.catalog_merge', 'on', true);
  perform set_config('app.inventory_write', 'on', true);

  -- Keep each variant's effective price/HSN: fill blanks that would otherwise
  -- start inheriting p_keep's different values.
  update public.product_variants v
     set cost_price    = case when v.cost_price is null and v_merge.cost_price is distinct from v_keep.cost_price
                              then v_merge.cost_price else v.cost_price end,
         selling_price = case when v.selling_price is null and v_merge.selling_price is distinct from v_keep.selling_price
                              then v_merge.selling_price else v.selling_price end,
         hsn_sac_code  = case when v.hsn_sac_code is null and v_merge.hsn_sac_code is distinct from v_keep.hsn_sac_code
                              then v_merge.hsn_sac_code else v.hsn_sac_code end,
         product_id    = p_keep
   where v.product_id = p_merge;
  get diagnostics v_moved = row_count;

  -- Everything that points at the moved variants follows them.
  update public.inventory             set product_id = p_keep where product_id = p_merge;
  update public.inventory_movements   set product_id = p_keep where product_id = p_merge;
  update public.order_items           set product_id = p_keep where product_id = p_merge;
  update public.purchase_order_items  set product_id = p_keep where product_id = p_merge;
  update public.return_items          set product_id = p_keep where product_id = p_merge;
  update public.exchange_items        set returned_product_id = p_keep where returned_product_id = p_merge;
  update public.exchange_items        set new_product_id = p_keep where new_product_id = p_merge;
  update public.fba_targets           set product_id = p_keep where product_id = p_merge;
  update public.fba_target_materials  set material_product_id = p_keep where material_product_id = p_merge;
  update public.sku_aliases           set product_id = p_keep where product_id = p_merge;

  -- The merged product's own barcodes and images join p_keep's. p_keep keeps
  -- its primary; the moved ones go after its existing images.
  if exists (select 1 from public.barcodes where product_id = p_keep and is_primary) then
    update public.barcodes set is_primary = false where product_id = p_merge and is_primary;
  end if;
  update public.barcodes set product_id = p_keep where product_id = p_merge;

  if exists (select 1 from public.product_images where product_id = p_keep and is_primary) then
    update public.product_images set is_primary = false where product_id = p_merge and is_primary;
  end if;
  select coalesce(max(position), -1) + 1 into v_offset
    from public.product_images where product_id = p_keep;
  update public.product_images
     set product_id = p_keep, position = position + v_offset
   where product_id = p_merge;

  perform set_config('app.inventory_write', 'off', true);
  perform set_config('app.catalog_merge', 'off', true);

  delete from public.products where id = p_merge;

  return v_moved;
end;
$$;
comment on function public.merge_products(uuid, uuid) is
  'ADMIN: moves all variants (and their stock, orders, purchases, returns, exchanges, FBA rows) of p_merge under p_keep, then deletes p_merge.';

revoke all on function public.merge_products(uuid, uuid) from public;
grant execute on function public.merge_products(uuid, uuid) to authenticated;
