-- ============================================================================
-- Category tax defaults: HSN/SAC code and GST rate.
--
-- Products in a category usually share an HSN code and GST slab (t-shirts,
-- tumblers, mugs…). The category keeps them so the product form can fill
-- them in when a category is picked. They are defaults only: each product
-- still stores its own hsn_sac_code / tax_rate, and changing a category's
-- defaults later does not touch existing products.
-- Existing RLS policies on categories already cover the new columns.
-- ============================================================================

alter table public.categories
  add column hsn_sac_code text
    check (hsn_sac_code is null or hsn_sac_code ~ '^[0-9]{4,8}$'),
  add column tax_rate numeric(5,2)
    check (tax_rate is null or tax_rate between 0 and 100);

comment on column public.categories.hsn_sac_code is
  'Default HSN/SAC code (4-8 digits) for new products in this category.';
comment on column public.categories.tax_rate is
  'Default GST rate (%) for new products in this category. NULL = no default.';
