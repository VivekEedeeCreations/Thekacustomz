-- ============================================================================
-- Let STAFF remove FBA targets.
--
-- An FBA target is a planning row (which SKU to send, how many, what it
-- needs), not history: removing one changes no stock, order or cost record.
-- The people who add and edit targets (STAFF+) should be able to take a SKU
-- off the list too, so delete moves from ADMIN+ to STAFF+, matching
-- fba_target_materials. The materials cascade with the target.
-- ============================================================================

drop policy "fba_targets: admin delete" on public.fba_targets;

create policy "fba_targets: staff delete" on public.fba_targets for delete to authenticated
  using (public.is_staff());
