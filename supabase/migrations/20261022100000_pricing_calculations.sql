-- ============================================================================
-- Saved price calculations.
--
-- The price calculator page is a scratchpad; this lets a user keep a snapshot
-- of it under a title/description and reload it later. `inputs` is the
-- calculator's form state as the web app serializes it (raw cost, cost lines,
-- GST choice, selling price, target) — results are recomputed on load, not
-- stored, so they always follow the current math.
--
-- Access: any active user can read; STAFF+ can save/update; a saved
-- calculation can be deleted by whoever created it, or by an ADMIN+.
-- ============================================================================

create table public.pricing_calculations (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 120),
  description text,
  inputs      jsonb not null default '{}'::jsonb,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.pricing_calculations is
  'Saved snapshots of the price calculator, with a title and description.';

create index pricing_calculations_created_at_idx
  on public.pricing_calculations (created_at desc);

create trigger pricing_calculations_set_updated_at
  before update on public.pricing_calculations
  for each row execute function internal.set_updated_at();

alter table public.pricing_calculations enable row level security;

create policy "pricing_calculations: read" on public.pricing_calculations
  for select to authenticated
  using (public.is_active_user());
create policy "pricing_calculations: staff write" on public.pricing_calculations
  for insert to authenticated
  with check (public.is_staff());
create policy "pricing_calculations: staff update" on public.pricing_calculations
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "pricing_calculations: owner or admin delete" on public.pricing_calculations
  for delete to authenticated
  using (public.is_staff() and (created_by = (select auth.uid()) or public.is_admin()));
