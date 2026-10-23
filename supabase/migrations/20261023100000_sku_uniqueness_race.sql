-- ============================================================================
-- SKU uniqueness across products and variants: close the race, trim input.
--
-- internal.assert_sku_unique() keeps one SKU namespace across products and
-- product_variants (each table also has its own unique index). Two problems:
--
--  1. Race: the cross-table check is a plain SELECT. Two transactions saving
--     the same SKU at the same moment — one as a product, one as a variant —
--     each see no clash (neither has committed) and both succeed.
--     Fix: take a transaction-scoped advisory lock on the normalized SKU
--     before checking, so writers of the same SKU run one after the other and
--     the second one sees the first one's row.
--
--  2. Whitespace: the check compared btrim(new.sku) but stored the value
--     untrimmed, so "ABC " and "ABC" could both exist in one table (the citext
--     unique index doesn't trim) while clashing in the other. Fix: store the
--     trimmed SKU.
--
-- The trigger definitions are unchanged; only the function body is replaced.
-- ============================================================================

create or replace function internal.assert_sku_unique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sku text;
begin
  new.sku := btrim(new.sku::text);
  v_sku := lower(new.sku::text);

  -- Serialize every write of this SKU (both tables) until this transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('sku:' || v_sku, 0));

  -- Compare with explicit text/lower() rather than relying on the citext
  -- operator, which is not visible under `search_path = ''`.
  if tg_table_name = 'products' then
    if exists (
      select 1 from public.product_variants v where lower(btrim(v.sku::text)) = v_sku
    ) then
      raise exception 'SKU % is already used by a product variant', new.sku
        using errcode = 'unique_violation';
    end if;
  else
    if exists (
      select 1 from public.products p where lower(btrim(p.sku::text)) = v_sku
    ) then
      raise exception 'SKU % is already used by a product', new.sku
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;
