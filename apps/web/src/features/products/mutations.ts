import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { buildProductImagePath, PRODUCT_IMAGES_BUCKET } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type { BarcodeOwner } from './queries';

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'products'>) => {
      const { data, error } = await supabase.from('products').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'products'> & { id: string }) => {
      const { data, error } = await supabase
        .from('products')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['products', data.id] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------
export function useCreateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'product_variants'>) => {
      const { data, error } = await supabase
        .from('product_variants')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) =>
      void queryClient.invalidateQueries({ queryKey: ['product-variants', data.product_id] }),
  });
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'product_variants'> & { id: string }) => {
      const { data, error } = await supabase
        .from('product_variants')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['product-variants', productId] }),
  });
}

export function useDeleteVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_variants').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['product-variants', productId] }),
  });
}

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------
function barcodeKey(owner: BarcodeOwner) {
  return owner.variantId ?? owner.productId;
}

/**
 * Postgres unique_violation (`23505`) on the barcode value itself. Other unique indexes on the
 * table (e.g. one primary per owner) share the code, so match the constraint by name.
 */
function isDuplicateBarcode(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' && (error.message ?? '').includes('barcodes_barcode_key');
}

const MAX_GENERATE_ATTEMPTS = 5;
const BULK_CHUNK_SIZE = 100;

export function useCreateBarcode(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<'barcodes'>, 'product_id' | 'variant_id'>) => {
      const { data, error } = await supabase
        .from('barcodes')
        .insert({
          ...input,
          product_id: owner.productId ?? null,
          variant_id: owner.variantId ?? null,
        })
        .select()
        .single();
      if (error) {
        if (isDuplicateBarcode(error)) {
          throw new Error(
            `The barcode "${input.barcode}" is already assigned to another product or variant. Every barcode must be unique.`,
          );
        }
        throw error;
      }
      return data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['barcodes', barcodeKey(owner)] }),
  });
}

/**
 * Calls the public.generate_ean13() DB function, then inserts the result as a barcode row.
 * The sequence never repeats a code, but a hand-typed barcode could already occupy the next
 * one, so a collision just draws a fresh number instead of failing.
 */
async function insertGeneratedEan13(owner: BarcodeOwner, isPrimary: boolean) {
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt += 1) {
    const { data: code, error: rpcError } = await supabase.rpc('generate_ean13');
    if (rpcError) throw rpcError;

    const { data, error } = await supabase
      .from('barcodes')
      .insert({
        barcode: code,
        symbology: 'EAN13',
        product_id: owner.productId ?? null,
        variant_id: owner.variantId ?? null,
        is_primary: isPrimary,
      })
      .select()
      .single();
    if (!error) return data;
    if (!isDuplicateBarcode(error)) throw error;
  }
  throw new Error('Could not find an unused barcode number. Please try again.');
}

export function useGenerateEan13Barcode(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { isPrimary?: boolean } = {}) =>
      insertGeneratedEan13(owner, input.isPrimary ?? false),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['barcodes', barcodeKey(owner)] }),
  });
}

export interface BulkBarcodeResult {
  generated: number;
  failed: { variantId: string; message: string }[];
}

/**
 * Generates one EAN-13 (set as primary) for each given variant. Callers pass only variants that
 * have no barcode yet; one failure doesn't stop the rest.
 */
export function useBulkGenerateVariantBarcodes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variantIds: string[]): Promise<BulkBarcodeResult> => {
      const result: BulkBarcodeResult = { generated: 0, failed: [] };
      for (const variantId of variantIds) {
        try {
          await insertGeneratedEan13({ variantId }, true);
          result.generated += 1;
        } catch (error) {
          result.failed.push({ variantId, message: (error as Error).message });
        }
      }
      return result;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['barcodes'] }),
  });
}

/**
 * Fields a bulk edit may change. `undefined` = leave alone, `null` = clear so the variant
 * falls back to the parent product's value, anything else = set.
 */
export interface BulkVariantPatch {
  cost_price?: number | null;
  selling_price?: number | null;
  hsn_sac_code?: string | null;
}

export function useBulkUpdateVariants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: BulkVariantPatch }) => {
      let updated = 0;
      // Ids travel in the URL, so keep each request comfortably under proxy length limits.
      for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
        const { data, error } = await supabase
          .from('product_variants')
          .update(patch)
          .in('id', ids.slice(i, i + BULK_CHUNK_SIZE))
          .select('id');
        if (error) throw error;
        updated += data.length;
      }
      // RLS hides rows the caller can't update instead of raising, so compare counts.
      return { updated, requested: ids.length };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['product-variants'] }),
  });
}

export function useSetPrimaryBarcode(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('barcodes').update({ is_primary: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['barcodes', barcodeKey(owner)] }),
  });
}

export function useDeleteBarcode(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('barcodes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['barcodes', barcodeKey(owner)] }),
  });
}

// ---------------------------------------------------------------------------
// Images (Supabase Storage upload + product_images row)
// ---------------------------------------------------------------------------
function imageKey(owner: BarcodeOwner) {
  return owner.variantId ?? owner.productId;
}

export function useUploadProductImage(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, position }: { file: File; position: number }) => {
      const path = buildProductImagePath(
        owner.variantId ? { variantId: owner.variantId } : { productId: owner.productId as string },
        file,
      );

      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('product_images')
        .insert({
          product_id: owner.productId ?? null,
          variant_id: owner.variantId ?? null,
          storage_path: path,
          content_type: file.type,
          size_bytes: file.size,
          position,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
        throw error;
      }
      return data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['product-images', imageKey(owner)] }),
  });
}

export function useSetPrimaryImage(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['product-images', imageKey(owner)] }),
  });
}

export function useDeleteProductImage(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (image: { id: string; storage_path: string }) => {
      const { error } = await supabase.from('product_images').delete().eq('id', image.id);
      if (error) throw error;
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([image.storage_path]);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['product-images', imageKey(owner)] }),
  });
}

export function useReorderProductImages(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; position: number }[]) => {
      // Each supabase-js call is its own PostgREST request/transaction, so the
      // (owner_key, position) unique constraint is enforced per-request even
      // though it's declared deferrable. Stage through high temporary offsets
      // first so intermediate states (e.g. swapping positions 0 and 1) never
      // collide with an existing row.
      for (const [i, item] of ordered.entries()) {
        const { error } = await supabase
          .from('product_images')
          .update({ position: 1000 + i })
          .eq('id', item.id);
        if (error) throw error;
      }
      for (const item of ordered) {
        const { error } = await supabase
          .from('product_images')
          .update({ position: item.position })
          .eq('id', item.id);
        if (error) throw error;
      }
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['product-images', imageKey(owner)] }),
  });
}
