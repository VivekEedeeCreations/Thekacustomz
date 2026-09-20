-- ============================================================================
-- 04 · Inventory (derived) and inventory_movements (source of truth)
-- ============================================================================
-- Design rule: the number in `inventory.quantity` is NEVER edited directly.
-- Every stock change is an append-only row in `inventory_movements`; a trigger
-- folds each movement into the matching `inventory` slot.
-- ============================================================================

create type public.movement_type as enum (
  'PURCHASE',        -- goods received from a vendor          (+)
  'SALE',            -- goods sold / shipped to a customer    (-)
  'ADJUSTMENT',      -- manual correction, cycle count        (+/-)
  'TRANSFER_IN',     -- arriving half of a location transfer  (+)
  'TRANSFER_OUT',    -- leaving half of a location transfer   (-)
  'RETURN',          -- customer return back into stock       (+)
  'INITIAL_STOCK',   -- opening balance when onboarding       (+)
  'PRODUCTION_IN',   -- output of a production run            (+)
  'PRODUCTION_OUT'   -- raw material consumed by production   (-)
);

-- ============================================================================
-- inventory  (one row per product/variant/location — maintained by trigger)
-- ============================================================================
create table public.inventory (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products (id) on delete cascade,
  variant_id         uuid references public.product_variants (id) on delete cascade,
  variant_key        uuid generated always as
                       (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  location_id        uuid not null references public.locations (id) on delete restrict,
  quantity           numeric(14,3) not null default 0,
  reserved_quantity  numeric(14,3) not null default 0 check (reserved_quantity >= 0),
  available_quantity numeric(14,3) generated always as (quantity - reserved_quantity) stored,
  updated_at         timestamptz not null default now(),
  constraint inventory_unique_slot unique (product_id, variant_key, location_id)
);
comment on table public.inventory is
  'Cached on-hand quantity per product/variant/location. Read-only to clients; written only by the inventory_movements trigger.';

create index inventory_product_location_idx on public.inventory (product_id, location_id);
create index inventory_location_idx         on public.inventory (location_id);
create index inventory_variant_idx          on public.inventory (variant_id) where variant_id is not null;
create index inventory_negative_idx         on public.inventory (product_id) where quantity < 0;

create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function internal.set_updated_at();

-- Hard block on direct writes. The movement trigger opens a transaction-local
-- window (app.inventory_write = 'on') around its own upsert; nothing else can.
create or replace function internal.guard_inventory_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.inventory_write', true) is distinct from 'on' then
    raise exception
      'public.inventory is derived from public.inventory_movements; direct % is not allowed', tg_op
      using errcode = 'restrict_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger inventory_guard_write
  before insert or update or delete on public.inventory
  for each row execute function internal.guard_inventory_write();

alter table public.inventory enable row level security;

-- ============================================================================
-- inventory_movements  (append-only ledger)
-- ============================================================================
create table public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete restrict,
  variant_id     uuid references public.product_variants (id) on delete restrict,
  location_id    uuid not null references public.locations (id) on delete restrict,
  movement_type  public.movement_type not null,
  quantity       numeric(14,3) not null check (quantity <> 0),
  unit_cost      numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  reference_type text,
  reference_id   uuid,
  notes          text,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  -- Sign must match the movement's direction; ADJUSTMENT may be either way.
  constraint inventory_movements_sign_ck check (
    (movement_type in ('PURCHASE','TRANSFER_IN','RETURN','INITIAL_STOCK','PRODUCTION_IN') and quantity > 0)
    or (movement_type in ('SALE','TRANSFER_OUT','PRODUCTION_OUT') and quantity < 0)
    or (movement_type = 'ADJUSTMENT')
  ),
  constraint inventory_movements_reference_ck check ((reference_type is null) = (reference_id is null))
);
comment on table public.inventory_movements is
  'Immutable stock ledger. One row per stock change; corrections are new compensating rows.';
comment on column public.inventory_movements.quantity is
  'Signed change applied to the slot: positive = stock in, negative = stock out.';

create index inventory_movements_slot_idx
  on public.inventory_movements (product_id, variant_id, location_id, occurred_at desc);
create index inventory_movements_location_idx    on public.inventory_movements (location_id);
create index inventory_movements_occurred_at_idx on public.inventory_movements (occurred_at desc);
create index inventory_movements_type_idx        on public.inventory_movements (movement_type);
create index inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id) where reference_type is not null;
create index inventory_movements_created_by_idx  on public.inventory_movements (created_by);

-- Ledger is append-only.
create trigger inventory_movements_no_mutation
  before update or delete on public.inventory_movements
  for each row execute function internal.reject_mutation();

-- Fold a movement into the matching inventory slot.
create or replace function internal.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform internal.assert_variant_of_product(new.product_id, new.variant_id);

  perform set_config('app.inventory_write', 'on', true);

  insert into public.inventory as inv (product_id, variant_id, location_id, quantity)
  values (new.product_id, new.variant_id, new.location_id, new.quantity)
  on conflict on constraint inventory_unique_slot
  do update set quantity   = inv.quantity + excluded.quantity,
               updated_at = now();

  perform set_config('app.inventory_write', 'off', true);
  return new;
end;
$$;

create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function internal.apply_inventory_movement();

alter table public.inventory_movements enable row level security;
