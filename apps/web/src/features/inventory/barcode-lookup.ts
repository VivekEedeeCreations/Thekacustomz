import type { Barcode, Product, ProductVariant } from '@/features/products/queries';
import { supabase } from '@/lib/supabase';

export interface ResolvedBarcode {
  product: Product;
  variant: ProductVariant | null;
  barcode: Barcode;
}

/**
 * Resolves a scanned code to its product (and variant, if the code belongs to
 * one) via public.barcodes. Returns null when nothing matches — a normal,
 * expected outcome while scanning (mis-scan, unregistered item), not an error.
 */
export async function lookupBarcode(code: string): Promise<ResolvedBarcode | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { data: barcode, error: barcodeError } = await supabase
    .from('barcodes')
    .select('*')
    .eq('barcode', trimmed)
    .maybeSingle();
  if (barcodeError) throw barcodeError;
  if (!barcode) return null;

  if (barcode.variant_id) {
    const { data: variant, error: variantError } = await supabase
      .from('product_variants')
      .select('*')
      .eq('id', barcode.variant_id)
      .single();
    if (variantError) throw variantError;

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', variant.product_id)
      .single();
    if (productError) throw productError;

    return { product, variant, barcode };
  }

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', barcode.product_id as string)
    .single();
  if (productError) throw productError;

  return { product, variant: null, barcode };
}

/** Current on-hand quantity for a product/variant at a location (0 if no inventory row exists yet). */
export async function fetchOnHand(
  productId: string,
  variantId: string | null,
  locationId: string,
): Promise<number> {
  let query = supabase
    .from('inventory')
    .select('quantity')
    .eq('product_id', productId)
    .eq('location_id', locationId);
  query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.quantity ?? 0;
}
