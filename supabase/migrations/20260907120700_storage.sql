-- ============================================================================
-- 07 · Supabase Storage: product-images bucket + object policies
-- ============================================================================
-- Bucket layout (path stored in public.product_images.storage_path):
--   product-images/products/<product_id>/<image_id>.<ext>
--   product-images/variants/<variant_id>/<image_id>.<ext>
--
-- The bucket is public, so <project>/storage/v1/object/public/product-images/...
-- serves image bytes without a session (fast <img> loads). Writes (upload /
-- replace / delete) are restricted to STAFF+ via storage.objects policies.
-- To make images private instead: set `public = false` below and have the
-- backend hand out signed URLs.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MiB
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by Supabase; we only add policies.
create policy "product-images: authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images');

create policy "product-images: staff upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_staff()
    and coalesce((storage.foldername(name))[1], '') in ('products', 'variants')
  );

create policy "product-images: staff replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_staff())
  with check (bucket_id = 'product-images' and public.is_staff());

create policy "product-images: staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_staff());
