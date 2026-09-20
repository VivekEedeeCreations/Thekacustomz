-- ============================================================================
-- 09 · Align categories/locations write access with the rest of the schema
-- ============================================================================
-- Categories and locations were originally gated at MANAGER+ for all writes,
-- while every other operational table (products, product_variants, barcodes,
-- vendors) is STAFF+ to write / ADMIN+ to delete. That asymmetry has no real
-- product reason and just blocks STAFF users from day-to-day catalog upkeep.
-- Bring them in line: STAFF+ can create/update, ADMIN+ can delete.
-- ============================================================================

drop policy "categories: write" on public.categories;

create policy "categories: staff write" on public.categories for insert to authenticated
  with check (public.is_staff());
create policy "categories: staff update" on public.categories for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "categories: admin delete" on public.categories for delete to authenticated
  using (public.is_admin());

drop policy "locations: write" on public.locations;

create policy "locations: staff write" on public.locations for insert to authenticated
  with check (public.is_staff());
create policy "locations: staff update" on public.locations for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "locations: admin delete" on public.locations for delete to authenticated
  using (public.is_admin());
