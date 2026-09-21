-- ============================================================================
-- Per-variant HSN/SAC code.
--
-- Until now the HSN/SAC code lived only on the parent product. Variants already
-- override the parent's cost_price / selling_price when they set their own (NULL
-- = "use the product's"); the HSN code follows the same rule so it can be bulk
-- edited across a selection of variants. Same format check as products.
-- Existing RLS policies on product_variants already cover the new column.
-- ============================================================================

alter table public.product_variants
  add column hsn_sac_code text
    check (hsn_sac_code is null or hsn_sac_code ~ '^[0-9]{4,8}$');

comment on column public.product_variants.hsn_sac_code is
  'HSN/SAC code override (4-8 digits). NULL = use the parent product''s code.';
