import { supabase } from './supabase';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

/** Public URL for a stored object (the bucket is public — see supabase/migrations/*_storage.sql). */
export function productImagePublicUrl(storagePath: string): string {
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** Builds the required `products/<id>/...` / `variants/<id>/...` path the upload policy checks. */
export function buildProductImagePath(
  owner: { productId: string; variantId?: null } | { productId?: null; variantId: string },
  file: File,
): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const id = crypto.randomUUID();
  return owner.variantId
    ? `variants/${owner.variantId}/${id}.${ext}`
    : `products/${owner.productId}/${id}.${ext}`;
}
