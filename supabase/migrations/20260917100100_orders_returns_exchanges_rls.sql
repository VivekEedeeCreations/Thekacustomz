-- ============================================================================
-- 11 · RLS policies for orders, returns, exchanges
-- ============================================================================
-- Same tiering as the rest of the schema: any active user reads, STAFF+
-- creates/updates, ADMIN+ (or MANAGER+ for a still-untouched order) deletes.
-- ============================================================================

create policy "orders: read" on public.orders for select to authenticated
  using (public.is_active_user());
create policy "orders: staff insert" on public.orders for insert to authenticated
  with check (public.is_staff());
create policy "orders: staff update" on public.orders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "orders: manager delete (new only)" on public.orders for delete to authenticated
  using (public.is_manager() and status = 'NEW' and dispatched_at is null);

create policy "order_items: read" on public.order_items for select to authenticated
  using (public.is_active_user());
create policy "order_items: staff insert" on public.order_items for insert to authenticated
  with check (public.is_staff());
create policy "order_items: staff update" on public.order_items for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "order_items: staff delete" on public.order_items for delete to authenticated
  using (public.is_staff());

create policy "returns: read" on public.returns for select to authenticated
  using (public.is_active_user());
create policy "returns: staff insert" on public.returns for insert to authenticated
  with check (public.is_staff());
create policy "returns: staff update" on public.returns for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "returns: admin delete (requested only)" on public.returns for delete to authenticated
  using (public.is_admin() and status = 'REQUESTED');

create policy "return_items: read" on public.return_items for select to authenticated
  using (public.is_active_user());
create policy "return_items: staff insert" on public.return_items for insert to authenticated
  with check (public.is_staff());
create policy "return_items: staff delete" on public.return_items for delete to authenticated
  using (public.is_staff());

create policy "exchanges: read" on public.exchanges for select to authenticated
  using (public.is_active_user());
create policy "exchanges: staff insert" on public.exchanges for insert to authenticated
  with check (public.is_staff());
create policy "exchanges: staff update" on public.exchanges for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "exchanges: admin delete (requested only)" on public.exchanges for delete to authenticated
  using (public.is_admin() and status = 'REQUESTED');

create policy "exchange_items: read" on public.exchange_items for select to authenticated
  using (public.is_active_user());
create policy "exchange_items: staff insert" on public.exchange_items for insert to authenticated
  with check (public.is_staff());
create policy "exchange_items: staff delete" on public.exchange_items for delete to authenticated
  using (public.is_staff());
