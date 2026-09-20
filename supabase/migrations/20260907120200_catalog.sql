-- ============================================================================
-- 02 · Catalog: categories, products, variants, barcodes, product images
-- ============================================================================

-- PRODUCT  = finished / sellable item (mug, keychain, t-shirt, gift box)
-- RAW_MATERIAL = consumed by a future production module (sublimation sheet,
--                blank mug, packaging material)
create type public.product_type as enum ('PRODUCT', 'RAW_MATERIAL');

create type public.barcode_symbology as enum (
  'EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'CODE39', 'ITF14', 'GS1_128',
  'QR', 'DATAMATRIX', 'OTHER'
);

-- ============================================================================
-- categories (self-referencing tree)
-- ============================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete set null,
  name        text not null check (length(btrim(name)) between 1 and 120),
  slug        extensions.citext,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);
comment on table public.categories is 'Hierarchical product categories.';

-- Unique slug (when present) and unique name within the same parent.
create unique index categories_slug_key
  on public.categories (slug) where slug is not null;
create unique index categories_parent_name_key
  on public.categories (
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );
create index categories_parent_id_idx on public.categories (parent_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function internal.set_updated_at();

-- Reject cycles in the hierarchy (A -> B -> A).
create or replace function internal.categories_prevent_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid := new.parent_id;
  v_hops   int := 0;
begin
  while v_parent is not null loop
    if v_parent = new.id then
      raise exception 'Category % would create a cycle', new.id
        using errcode = 'check_violation';
    end if;
    select parent_id into v_parent from public.categories where id = v_parent;
    v_hops := v_hops + 1;
    if v_hops > 50 then
      raise exception 'Category hierarchy is too deep' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

create trigger categories_prevent_cycle
  before insert or update of parent_id on public.categories
  for each row execute function internal.categories_prevent_cycle();

alter table public.categories enable row level security;

-- ============================================================================
-- products
-- ============================================================================
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 extensions.citext not null,
  name                text not null check (length(btrim(name)) between 1 and 200),
  description         text,
  category_id         uuid references public.categories (id) on delete set null,
  product_type        public.product_type not null default 'PRODUCT',
  unit_of_measure     text not null default 'PCS' check (length(btrim(unit_of_measure)) between 1 and 16),
  hsn_sac_code        text check (hsn_sac_code is null or hsn_sac_code ~ '^[0-9]{4,8}$'),
  cost_price          numeric(14,4) not null default 0 check (cost_price >= 0),
  selling_price       numeric(14,4) not null default 0 check (selling_price >= 0),
  tax_rate            numeric(5,2)  not null default 0 check (tax_rate between 0 and 100),
  minimum_stock_level numeric(14,3) not null default 0 check (minimum_stock_level >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id) on delete set null,
  constraint products_sku_len check (length(btrim(sku::text)) between 1 and 64)
);
comment on table public.products is
  'Master catalog record for finished goods and raw materials.';
comment on column public.products.minimum_stock_level is
  'Reorder threshold, compared against the sum of inventory rows for the product.';

create unique index products_sku_key       on public.products (sku);
create index products_category_id_idx      on public.products (category_id);
create index products_product_type_idx     on public.products (product_type);
create index products_active_idx           on public.products (id) where is_active;
create index products_name_lower_idx       on public.products (lower(name));
create index products_name_trgm_idx        on public.products using gin (name extensions.gin_trgm_ops);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function internal.set_updated_at();

alter table public.products enable row level security;

-- ============================================================================
-- product_variants
-- ============================================================================
create table public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  sku           extensions.citext not null,
  name          text,
  size          text,
  color         text,
  design        text,
  cost_price    numeric(14,4) check (cost_price is null or cost_price >= 0),
  selling_price numeric(14,4) check (selling_price is null or selling_price >= 0),
  attributes    jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint product_variants_sku_len check (length(btrim(sku::text)) between 1 and 64)
);
comment on table public.product_variants is
  'Sellable variations of a product. cost_price / selling_price fall back to the parent product when NULL.';
comment on column public.product_variants.attributes is
  'Free-form key/value attributes (JSON object) for anything not modelled as a column.';

create unique index product_variants_sku_key on public.product_variants (sku);
create unique index product_variants_combo_key
  on public.product_variants (
    product_id,
    lower(coalesce(size, '')),
    lower(coalesce(color, '')),
    lower(coalesce(design, ''))
  );
create index product_variants_product_id_idx  on public.product_variants (product_id);
create index product_variants_attributes_idx  on public.product_variants using gin (attributes jsonb_path_ops);

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function internal.set_updated_at();

-- SKUs share a single namespace across products and variants (a scanned SKU
-- must resolve to exactly one thing).
create or replace function internal.assert_sku_unique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sku text := lower(btrim(new.sku::text));
begin
  -- Compare with explicit text/lower() rather than relying on the citext
  -- operator, which is not visible under `search_path = ''`.
  if tg_table_name = 'products' then
    if exists (
      select 1 from public.product_variants v where lower(v.sku::text) = v_sku
    ) then
      raise exception 'SKU % is already used by a product variant', new.sku
        using errcode = 'unique_violation';
    end if;
  else
    if exists (
      select 1 from public.products p where lower(p.sku::text) = v_sku
    ) then
      raise exception 'SKU % is already used by a product', new.sku
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger products_assert_sku_unique
  before insert or update of sku on public.products
  for each row execute function internal.assert_sku_unique();
create trigger product_variants_assert_sku_unique
  before insert or update of sku on public.product_variants
  for each row execute function internal.assert_sku_unique();

alter table public.product_variants enable row level security;

-- ============================================================================
-- Shared "single primary per owner" trigger (barcodes + product_images)
-- ============================================================================
create or replace function internal.enforce_single_primary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := coalesce(new.variant_id, new.product_id);
begin
  if tg_table_name = 'barcodes' then
    update public.barcodes set is_primary = false
     where owner_key = v_owner and id <> new.id and is_primary;
  elsif tg_table_name = 'product_images' then
    update public.product_images set is_primary = false
     where owner_key = v_owner and id <> new.id and is_primary;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- barcodes  (a product OR a variant can have many; one flagged primary)
-- ============================================================================
create sequence if not exists public.internal_barcode_seq;

create table public.barcodes (
  id         uuid primary key default gen_random_uuid(),
  barcode    text not null check (length(btrim(barcode)) between 4 and 64),
  symbology  public.barcode_symbology not null default 'CODE128',
  product_id uuid references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  owner_key  uuid generated always as (coalesce(variant_id, product_id)) stored,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint barcodes_exactly_one_owner check (num_nonnulls(product_id, variant_id) = 1)
);
comment on table public.barcodes is
  'Barcode values attached to a product or a variant. Satisfies the "variant has a barcode" requirement while allowing multiples.';

create unique index barcodes_barcode_key         on public.barcodes (barcode);
create index        barcodes_product_id_idx      on public.barcodes (product_id);
create index        barcodes_variant_id_idx      on public.barcodes (variant_id);
create unique index barcodes_primary_per_owner   on public.barcodes (owner_key) where is_primary;

create trigger barcodes_single_primary
  before insert or update of is_primary on public.barcodes
  for each row when (new.is_primary) execute function internal.enforce_single_primary();

alter table public.barcodes enable row level security;

-- Barcode generation helpers (image rendering / camera scanning are client-side)
create or replace function public.ean13_check_digit(p_digits text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s int := 0;
begin
  if p_digits !~ '^[0-9]{12}$' then
    raise exception 'ean13_check_digit expects exactly 12 digits'
      using errcode = 'invalid_parameter_value';
  end if;
  for i in 1..12 loop
    s := s + substr(p_digits, i, 1)::int * case when i % 2 = 0 then 3 else 1 end;
  end loop;
  return ((10 - (s % 10)) % 10)::text;
end;
$$;

create or replace function public.generate_ean13(p_prefix text default '200')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
begin
  if p_prefix !~ '^[0-9]{1,6}$' then
    raise exception 'generate_ean13 prefix must be 1-6 digits'
      using errcode = 'invalid_parameter_value';
  end if;
  v_base := p_prefix
    || lpad(nextval('public.internal_barcode_seq')::text, 12 - length(p_prefix), '0');
  return v_base || public.ean13_check_digit(v_base);
end;
$$;
comment on function public.generate_ean13(text) is
  'Returns a fresh, check-digit-valid EAN-13 in the internal-use prefix range (default 200).';

grant execute on function public.ean13_check_digit(text), public.generate_ean13(text)
  to authenticated;

-- ============================================================================
-- product_images  (paths only — bytes live in Supabase Storage)
-- ============================================================================
create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references public.products (id) on delete cascade,
  variant_id   uuid references public.product_variants (id) on delete cascade,
  owner_key    uuid generated always as (coalesce(variant_id, product_id)) stored,
  bucket_id    text not null default 'product-images',
  storage_path text not null check (length(btrim(storage_path)) between 1 and 1024),
  alt_text     text,
  position     integer not null default 0 check (position >= 0),
  is_primary   boolean not null default false,
  content_type text,
  size_bytes   bigint  check (size_bytes is null or size_bytes >= 0),
  width        integer check (width  is null or width  > 0),
  height       integer check (height is null or height > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint product_images_exactly_one_owner check (num_nonnulls(product_id, variant_id) = 1),
  constraint product_images_path_key unique (bucket_id, storage_path),
  constraint product_images_owner_position_key unique (owner_key, position)
    deferrable initially deferred
);
comment on table public.product_images is
  'Ordered image references for a product or variant. Files are stored in Supabase Storage; only the bucket + path are kept here.';
comment on constraint product_images_owner_position_key on public.product_images is
  'Deferrable so the client can renumber positions within a single transaction (reordering).';

create index        product_images_product_id_idx    on public.product_images (product_id);
create index        product_images_variant_id_idx    on public.product_images (variant_id);
create unique index  product_images_primary_per_owner on public.product_images (owner_key) where is_primary;

create trigger product_images_set_updated_at
  before update on public.product_images
  for each row execute function internal.set_updated_at();
create trigger product_images_single_primary
  before insert or update of is_primary on public.product_images
  for each row when (new.is_primary) execute function internal.enforce_single_primary();

alter table public.product_images enable row level security;
