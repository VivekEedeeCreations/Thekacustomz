-- ============================================================================
-- 06 · Row Level Security policies
-- ============================================================================
-- RLS is already ENABLED on every table (in the migrations that created them),
-- so with no policy a table denies all access to anon / authenticated. This
-- migration adds the policies.
--
-- Model:
--   * anon            -> no access to any application table
--   * service_role    -> bypasses RLS (used only by the backend API)
--   * authenticated   -> gated by application role via helper functions:
--       VIEWER  : read application data
--       STAFF   : + create/update catalog, vendors, movements, POs, receipts
--       MANAGER : + manage configuration (categories, locations)
--       ADMIN   : + delete catalog/vendor records, manage user roles
--       OWNER   : same as ADMIN (top of the ladder)
--
-- `inventory` has read-only access and no write policy at all. Ledger and
-- receipt tables have no UPDATE/DELETE policy (they are append-only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reference / configuration data: read for any active user, write for MANAGER+
-- ---------------------------------------------------------------------------
create policy "categories: read"  on public.categories for select to authenticated
  using (public.is_active_user());
create policy "categories: write" on public.categories for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "locations: read"  on public.locations for select to authenticated
  using (public.is_active_user());
create policy "locations: write" on public.locations for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Catalog: read for any active user, write for STAFF+, delete for ADMIN+
-- ---------------------------------------------------------------------------
create policy "products: read"        on public.products for select to authenticated
  using (public.is_active_user());
create policy "products: staff write" on public.products for insert to authenticated
  with check (public.is_staff());
create policy "products: staff update" on public.products for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "products: admin delete" on public.products for delete to authenticated
  using (public.is_admin());

create policy "product_variants: read" on public.product_variants for select to authenticated
  using (public.is_active_user());
create policy "product_variants: staff write" on public.product_variants for insert to authenticated
  with check (public.is_staff());
create policy "product_variants: staff update" on public.product_variants for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "product_variants: admin delete" on public.product_variants for delete to authenticated
  using (public.is_admin());

create policy "barcodes: read" on public.barcodes for select to authenticated
  using (public.is_active_user());
create policy "barcodes: staff write" on public.barcodes for insert to authenticated
  with check (public.is_staff());
create policy "barcodes: staff update" on public.barcodes for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "barcodes: admin delete" on public.barcodes for delete to authenticated
  using (public.is_admin());

-- Product images churn a lot; STAFF fully manage them.
create policy "product_images: read" on public.product_images for select to authenticated
  using (public.is_active_user());
create policy "product_images: staff write" on public.product_images for insert to authenticated
  with check (public.is_staff());
create policy "product_images: staff update" on public.product_images for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "product_images: staff delete" on public.product_images for delete to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Vendors: read for any active user, write for STAFF+, delete for ADMIN+
-- ---------------------------------------------------------------------------
create policy "vendors: read" on public.vendors for select to authenticated
  using (public.is_active_user());
create policy "vendors: staff write" on public.vendors for insert to authenticated
  with check (public.is_staff());
create policy "vendors: staff update" on public.vendors for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "vendors: admin delete" on public.vendors for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Inventory: READ ONLY. No write policy — the movements trigger is the only writer.
-- ---------------------------------------------------------------------------
create policy "inventory: read" on public.inventory for select to authenticated
  using (public.is_active_user());

-- ---------------------------------------------------------------------------
-- Inventory movements: read for any active user, insert for STAFF+.
-- No UPDATE/DELETE policy (append-only; also blocked by trigger).
-- ---------------------------------------------------------------------------
create policy "inventory_movements: read" on public.inventory_movements for select to authenticated
  using (public.is_active_user());
create policy "inventory_movements: staff insert" on public.inventory_movements for insert to authenticated
  with check (
    public.is_staff()
    and (created_by is null or created_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Purchasing
-- ---------------------------------------------------------------------------
create policy "purchase_orders: read" on public.purchase_orders for select to authenticated
  using (public.is_active_user());
create policy "purchase_orders: staff insert" on public.purchase_orders for insert to authenticated
  with check (public.is_staff());
create policy "purchase_orders: staff update" on public.purchase_orders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "purchase_orders: manager delete (draft only)" on public.purchase_orders for delete to authenticated
  using (public.is_manager() and status = 'DRAFT');

create policy "purchase_order_items: read" on public.purchase_order_items for select to authenticated
  using (public.is_active_user());
create policy "purchase_order_items: staff insert" on public.purchase_order_items for insert to authenticated
  with check (public.is_staff());
create policy "purchase_order_items: staff update" on public.purchase_order_items for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "purchase_order_items: staff delete" on public.purchase_order_items for delete to authenticated
  using (public.is_staff());

create policy "purchase_receipts: read" on public.purchase_receipts for select to authenticated
  using (public.is_active_user());
create policy "purchase_receipts: staff insert" on public.purchase_receipts for insert to authenticated
  with check (
    public.is_staff()
    and (received_by is null or received_by = (select auth.uid()))
  );

create policy "purchase_receipt_items: read" on public.purchase_receipt_items for select to authenticated
  using (public.is_active_user());
create policy "purchase_receipt_items: staff insert" on public.purchase_receipt_items for insert to authenticated
  with check (public.is_staff());
