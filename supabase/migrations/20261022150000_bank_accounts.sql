-- ============================================================================
-- Bank accounts for the petty book.
--
-- A manually maintained snapshot of each bank account's current balance, so
-- the petty book can show cash in hand alongside money in the bank. The
-- balance is typed in (from the bank app / statement) with the date it was
-- checked; it is not derived from petty entries.
--
-- Same access as petty_entries: STAFF+ read and write, ADMIN+ delete.
-- ============================================================================

create table public.bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  account_name     text not null check (length(btrim(account_name)) between 1 and 120),
  account_number   text not null check (length(btrim(account_number)) between 4 and 34),
  bank_name        text check (bank_name is null or length(btrim(bank_name)) between 1 and 120),
  current_balance  numeric(14,2) not null default 0,
  balance_as_of    date not null default current_date,
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.bank_accounts is
  'Bank accounts with a manually updated current balance, shown in the petty book.';
comment on column public.bank_accounts.current_balance is
  'Balance as last checked; may be negative for an overdraft.';
comment on column public.bank_accounts.balance_as_of is 'Date the current_balance was checked.';

create unique index bank_accounts_number_key on public.bank_accounts (btrim(account_number));

create trigger bank_accounts_set_updated_at
  before update on public.bank_accounts
  for each row execute function internal.set_updated_at();

alter table public.bank_accounts enable row level security;

create policy "bank_accounts: staff read" on public.bank_accounts for select to authenticated
  using (public.is_staff());
create policy "bank_accounts: staff write" on public.bank_accounts for insert to authenticated
  with check (public.is_staff());
create policy "bank_accounts: staff update" on public.bank_accounts for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "bank_accounts: admin delete" on public.bank_accounts for delete to authenticated
  using (public.is_admin());
