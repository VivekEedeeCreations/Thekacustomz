-- ============================================================================
-- 03 · Vendors and stock locations
-- ============================================================================

create type public.location_type as enum (
  'WAREHOUSE', 'STORE', 'PRODUCTION', 'TRANSIT', 'OTHER'
);

-- ============================================================================
-- locations  (warehouses / stores / production sites)
-- ============================================================================
create table public.locations (
  id            uuid primary key default gen_random_uuid(),
  code          extensions.citext not null,
  name          text not null check (length(btrim(name)) between 1 and 120),
  location_type public.location_type not null default 'WAREHOUSE',
  address       text,
  is_active     boolean not null default true,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint locations_code_len check (length(btrim(code::text)) between 1 and 32)
);
comment on table public.locations is
  'Physical places that hold stock: warehouses, retail stores, production floors, transit.';

create unique index locations_code_key on public.locations (code);
-- At most one default location (only rows with is_default = true are indexed).
create unique index locations_single_default_key on public.locations (is_default) where is_default;
create index locations_type_idx on public.locations (location_type) where is_active;

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function internal.set_updated_at();

alter table public.locations enable row level security;

-- ============================================================================
-- vendors
-- ============================================================================
create table public.vendors (
  id             uuid primary key default gen_random_uuid(),
  company_name   text not null check (length(btrim(company_name)) between 1 and 200),
  contact_person text,
  phone          text,
  email          extensions.citext,
  gstin          text,
  address        text,
  payment_terms  text,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,
  constraint vendors_gstin_format check (
    gstin is null
    or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'
  ),
  constraint vendors_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);
comment on table public.vendors is 'Suppliers that purchase orders are raised against.';
comment on column public.vendors.gstin is 'Indian GST identification number (15 chars), validated by format.';

create unique index vendors_gstin_key            on public.vendors (gstin) where gstin is not null;
create index        vendors_company_name_lower   on public.vendors (lower(company_name));
create index        vendors_company_name_trgm    on public.vendors using gin (company_name extensions.gin_trgm_ops);
create index        vendors_active_idx           on public.vendors (id) where is_active;

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function internal.set_updated_at();

alter table public.vendors enable row level security;
