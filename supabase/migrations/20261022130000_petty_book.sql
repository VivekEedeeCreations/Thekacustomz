-- ============================================================================
-- Petty book: day-to-day income and expense entries.
--
-- A simple cash book, separate from orders/purchasing: money in (cash sales,
-- refunds received, owner top-ups) and money out (packaging, courier, tea,
-- small purchases). `category` and `payment_mode` are free text with
-- suggestions in the app, so the team can add their own without a migration.
--
-- status: SETTLED entries are money that actually moved and count toward the
-- balance. PENDING entries are promises: an INCOME that is still receivable,
-- or an EXPENSE still to be paid (a payable), optionally with a due_date.
-- Settling one flips it to SETTLED and sets entry_date to the day it was paid.
--
-- Money is sensitive, so even reading needs STAFF+. STAFF+ can add and edit,
-- ADMIN+ can delete.
-- ============================================================================

create table public.petty_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null default current_date,
  entry_type   text not null check (entry_type in ('INCOME', 'EXPENSE')),
  amount       numeric(14,2) not null check (amount > 0),
  category     text not null check (length(btrim(category)) between 1 and 60),
  payment_mode text check (payment_mode is null or length(btrim(payment_mode)) between 1 and 30),
  description  text,
  reference    text,
  status       text not null default 'SETTLED' check (status in ('SETTLED', 'PENDING')),
  due_date     date,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.petty_entries is 'Petty book: income and expense entries.';
comment on column public.petty_entries.amount is 'Always positive; entry_type says which way the money moved.';
comment on column public.petty_entries.status is
  'SETTLED = money moved (counts toward balance); PENDING = receivable (income) or payable (expense).';
comment on column public.petty_entries.due_date is 'When a PENDING entry is expected to be received/paid.';
comment on column public.petty_entries.reference is 'Bill number, UPI ref, order id — anything to trace it back.';

create index petty_entries_entry_date_idx on public.petty_entries (entry_date desc);
create index petty_entries_type_date_idx  on public.petty_entries (entry_type, entry_date desc);
create index petty_entries_pending_idx    on public.petty_entries (due_date) where status = 'PENDING';

create trigger petty_entries_set_updated_at
  before update on public.petty_entries
  for each row execute function internal.set_updated_at();

alter table public.petty_entries enable row level security;

create policy "petty_entries: staff read" on public.petty_entries for select to authenticated
  using (public.is_staff());
create policy "petty_entries: staff write" on public.petty_entries for insert to authenticated
  with check (public.is_staff());
create policy "petty_entries: staff update" on public.petty_entries for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "petty_entries: admin delete" on public.petty_entries for delete to authenticated
  using (public.is_admin());
