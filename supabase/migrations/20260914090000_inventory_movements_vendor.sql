-- ============================================================================
-- 08 · Track which vendor a stock movement came from
-- ============================================================================
-- Lets "Add inventory" (and the ledger view) record/show the vendor a PURCHASE
-- (or vendor RETURN) came from. Nullable: not every movement has one, and this
-- is intentionally independent of the (not-yet-built) purchase_orders flow —
-- a movement can name a vendor directly without a PO/receipt behind it.
-- ============================================================================

alter table public.inventory_movements
  add column vendor_id uuid references public.vendors (id) on delete set null;

comment on column public.inventory_movements.vendor_id is
  'Vendor the stock came from. Typically set for PURCHASE (and optionally RETURN); NULL for movement types with no vendor (TRANSFER_*, PRODUCTION_*, ADJUSTMENT, INITIAL_STOCK, SALE).';

create index inventory_movements_vendor_id_idx
  on public.inventory_movements (vendor_id)
  where vendor_id is not null;
