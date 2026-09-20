import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Product = Tables<'products'>;
export type ProductVariant = Tables<'product_variants'>;
export type Barcode = Tables<'barcodes'>;
export type ProductImage = Tables<'product_images'>;

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId],
    queryFn: async (): Promise<Product | null> => {
      if (!productId) return null;
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });
}

/** All variants across all products — used to label inventory/movement rows. */
export function useAllVariants() {
  return useQuery({
    queryKey: ['product-variants', 'all'],
    queryFn: async (): Promise<ProductVariant[]> => {
      const { data, error } = await supabase.from('product_variants').select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useProductVariants(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async (): Promise<ProductVariant[]> => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('sku');
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });
}

/** All barcodes across all products/variants — used to pick a printable code per item. */
export function useAllBarcodes() {
  return useQuery({
    queryKey: ['barcodes', 'all'],
    queryFn: async (): Promise<Barcode[]> => {
      const { data, error } = await supabase
        .from('barcodes')
        .select('*')
        .order('is_primary', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}

export type BarcodeOwner =
  { productId: string; variantId?: null } | { productId?: null; variantId: string };

export function useBarcodes(owner: BarcodeOwner | undefined) {
  const key = owner ? (owner.variantId ?? owner.productId) : undefined;
  return useQuery({
    queryKey: ['barcodes', key],
    queryFn: async (): Promise<Barcode[]> => {
      if (!owner) return [];
      let query = supabase.from('barcodes').select('*');
      query = owner.variantId
        ? query.eq('variant_id', owner.variantId)
        : query.eq('product_id', owner.productId as string).is('variant_id', null);
      const { data, error } = await query.order('is_primary', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!owner,
  });
}

export function useProductImages(owner: BarcodeOwner | undefined) {
  const key = owner ? (owner.variantId ?? owner.productId) : undefined;
  return useQuery({
    queryKey: ['product-images', key],
    queryFn: async (): Promise<ProductImage[]> => {
      if (!owner) return [];
      let query = supabase.from('product_images').select('*');
      query = owner.variantId
        ? query.eq('variant_id', owner.variantId)
        : query.eq('product_id', owner.productId as string).is('variant_id', null);
      const { data, error } = await query.order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!owner,
  });
}
