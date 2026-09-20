-- ============================================================================
-- 00 · Extensions, helper schema, and shared trigger functions
-- ============================================================================
-- Everything here is infrastructure the later migrations build on:
--   * required Postgres extensions (in the dedicated `extensions` schema)
--   * an `internal` schema for helper routines that API clients never call
--     directly
--   * generic trigger functions (updated_at maintenance, append-only guard)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper schema for internal routines
-- ----------------------------------------------------------------------------
create schema if not exists internal;
comment on schema internal is
  'Internal helper routines (trigger functions, guards). Not exposed via the API.';

-- The API roles must be able to *reach* trigger functions that fire on their
-- statements. Grant schema usage + execute up-front so every function created
-- below (and in later migrations) is callable.
grant usage on schema internal to anon, authenticated, service_role;
alter default privileges in schema internal
  grant execute on functions to anon, authenticated, service_role;

-- Be explicit about sequence access in `public` too (matches the cloud default).
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists citext  with schema extensions;  -- case-insensitive text (SKU, codes, email)
create extension if not exists pg_trgm with schema extensions;   -- trigram indexes for name search

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function internal.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
comment on function internal.set_updated_at() is
  'BEFORE UPDATE row trigger: stamps updated_at with now().';

-- ----------------------------------------------------------------------------
-- Append-only guard for immutable ledger tables
-- ----------------------------------------------------------------------------
create or replace function internal.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    '%.% is append-only; % is not permitted. Post a compensating row instead.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
  return null;
end;
$$;
comment on function internal.reject_mutation() is
  'BEFORE UPDATE OR DELETE trigger: enforces append-only semantics.';

-- ----------------------------------------------------------------------------
-- Shared referential check: a variant must belong to the given product
-- ----------------------------------------------------------------------------
create or replace function internal.assert_variant_of_product(p_product uuid, p_variant uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_variant is null then
    return;
  end if;
  if not exists (
    select 1
    from public.product_variants v
    where v.id = p_variant
      and v.product_id = p_product
  ) then
    raise exception 'Variant % does not belong to product %', p_variant, p_product
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;
