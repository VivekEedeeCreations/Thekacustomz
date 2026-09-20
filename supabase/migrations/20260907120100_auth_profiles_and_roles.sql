-- ============================================================================
-- 01 · Profiles, roles, and authorization helpers
-- ============================================================================
-- One profile row per auth.users record. The profile carries the application
-- role that every RLS policy in later migrations keys off.
-- ============================================================================

-- Roles are ordered from least to most privileged so that enum comparison
-- (`>=`) expresses "has at least this role".
create type public.user_role as enum ('VIEWER', 'STAFF', 'MANAGER', 'ADMIN', 'OWNER');

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      extensions.citext,
  full_name  text,
  role       public.user_role not null default 'STAFF',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'Application profile and role for each authenticated user. Created automatically on sign-up.';

create index profiles_role_idx on public.profiles (role) where is_active;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function internal.set_updated_at();

alter table public.profiles enable row level security;

-- ----------------------------------------------------------------------------
-- Sign-up / email-sync handlers on auth.users
-- ----------------------------------------------------------------------------
create or replace function internal.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  -- The very first account bootstraps the OWNER; everyone else starts as STAFF
  -- and is promoted by an admin.
  if exists (select 1 from public.profiles) then
    v_role := 'STAFF';
  else
    v_role := 'OWNER';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
comment on function internal.handle_new_user() is
  'AFTER INSERT on auth.users: provisions the matching public.profiles row.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function internal.handle_new_user();

create or replace function internal.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function internal.sync_user_email();

-- ----------------------------------------------------------------------------
-- Authorization helpers (used by every RLS policy)
-- ----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active;
$$;
comment on function public.current_app_role() is
  'Effective role of the caller, or NULL when unauthenticated / deactivated.';

create or replace function public.has_min_role(min_role public.user_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.current_app_role() >= min_role, false);
$$;

create or replace function public.is_active_user()
returns boolean language sql stable set search_path = '' as $$
  select public.current_app_role() is not null;
$$;

create or replace function public.is_staff()
returns boolean language sql stable set search_path = '' as $$
  select public.has_min_role('STAFF');
$$;

create or replace function public.is_manager()
returns boolean language sql stable set search_path = '' as $$
  select public.has_min_role('MANAGER');
$$;

create or replace function public.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select public.has_min_role('ADMIN');
$$;

grant execute on function
  public.current_app_role(),
  public.has_min_role(public.user_role),
  public.is_active_user(),
  public.is_staff(),
  public.is_manager(),
  public.is_admin()
to anon, authenticated;

-- Hard guard: role / is_active can only be changed by an admin, regardless of
-- which RLS policy allowed the row through.
create or replace function internal.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin() then
    raise exception 'Only an admin may change a profile''s role or is_active flag'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function internal.profiles_guard_privileged_columns();

-- ----------------------------------------------------------------------------
-- RLS policies for profiles
-- ----------------------------------------------------------------------------
create policy "profiles: read own or elevated"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_manager());

-- A user may edit their own profile but cannot change their role or reactivate
-- themselves (current_app_role() returns their existing role).
create policy "profiles: self update (safe columns)"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = public.current_app_role()
    and is_active = true
  );

create policy "profiles: admin manage"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
