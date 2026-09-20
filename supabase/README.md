# Database (Supabase / PostgreSQL)

Schema is managed as **plain SQL migrations** in [`migrations/`](./migrations). No
ORM, no Prisma — application code uses `@supabase/supabase-js`.

## Migrations

| File                                                  | Contents                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260907120000_extensions_and_helpers.sql`           | Extensions (`citext`, `pg_trgm`), `internal` helper schema, generic trigger functions (`set_updated_at`, `reject_mutation`, `assert_variant_of_product`).                  |
| `20260907120100_auth_profiles_and_roles.sql`          | `profiles` table, `user_role` enum, sign-up trigger on `auth.users`, authorization helpers (`current_app_role`, `is_staff`, …), profile RLS + privileged-column guard.     |
| `20260907120200_catalog.sql`                          | `categories`, `products`, `product_variants`, `barcodes`, `product_images`; shared SKU namespace; EAN-13 generation helpers; "single primary" trigger.                     |
| `20260907120300_vendors_and_locations.sql`            | `locations`, `vendors`.                                                                                                                                                    |
| `20260907120400_inventory_and_movements.sql`          | `inventory` (derived, guarded), `inventory_movements` (append-only ledger) + fold-into-inventory trigger.                                                                  |
| `20260907120500_purchasing.sql`                       | `purchase_orders`, `purchase_order_items`, `purchase_receipts`, `purchase_receipt_items`; PO numbering; totals maintenance; partial-receiving / anti-double-receive logic. |
| `20260907120600_row_level_security.sql`               | RLS policies for every application table.                                                                                                                                  |
| `20260907120700_storage.sql`                          | `product-images` storage bucket + `storage.objects` policies.                                                                                                              |
| `20260914090000_inventory_movements_vendor.sql`       | Adds `inventory_movements.vendor_id` (nullable FK to `vendors`) so stock-in movements can record which vendor they came from.                                              |
| `20260916100000_categories_locations_staff_write.sql` | Aligns `categories`/`locations` write access with the rest of the schema: STAFF+ create/update, ADMIN+ delete (previously MANAGER+ for everything).                        |

## Local development

Requires Docker.

```bash
npx supabase start          # boot local stack + apply every migration + seed.sql
npx supabase db reset       # re-apply migrations from scratch (use while iterating)
npx supabase db lint        # static analysis (RLS, search_path, …)
npx supabase migration list # applied vs pending
npx supabase stop           # tear down
```

Local dashboard: http://localhost:54323 · API: http://localhost:54321

## Applying to a hosted Supabase project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # runs the migrations against the linked project
```

The `product-images` bucket is created by `20260907120700_storage.sql`. If your
hosted project restricts creating policies on `storage.objects` from `db push`,
paste that migration's policy statements into the dashboard SQL editor once.

## New migrations

```bash
npx supabase migration new <name>     # creates supabase/migrations/<ts>_<name>.sql
```

Never edit an already-applied migration — add a new one.

## Conventions baked into the schema

- **Stock is never edited directly.** `inventory.quantity` is maintained only by
  a trigger on `inventory_movements`; direct writes raise an exception even for
  the service role.
- **Ledgers are append-only.** `inventory_movements`, `purchase_receipts` and
  `purchase_receipt_items` reject `UPDATE`/`DELETE`; corrections are new rows.
- **Money/qty types:** `numeric(14,4)` for money, `numeric(14,3)` for quantities.
- **Roles:** `VIEWER < STAFF < MANAGER < ADMIN < OWNER`. The first user to sign
  up becomes `OWNER` automatically.
