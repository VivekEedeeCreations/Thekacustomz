import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { buildProductImagePath, PRODUCT_IMAGES_BUCKET } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type { BarcodeOwner } from './queries';

// ---------------------------------------------------------------------------
// SKU clashes
// ---------------------------------------------------------------------------
/**
 * SKUs are unique across products and variants together (unique indexes plus
 * internal.assert_sku_unique). Postgres only says "already used", so look up who holds the SKU
 * and name it — that's what tells the user which item to rename first.
 */
async function skuError(error: { code?: string; message: string }, sku: string | undefined) {
  if (error.code !== '23505' || !sku || !/sku/i.test(error.message)) return error;
  const value = sku.trim();
  const [{ data: product }, { data: variant }] = await Promise.all([
    supabase.from('products').select('name').eq('sku', value).maybeSingle(),
    supabase
      .from('product_variants')
      .select('sku, size, color, design, product_id')
      .eq('sku', value)
      .maybeSingle(),
  ]);
  if (product) {
    return new Error(`SKU "${value}" is already used by the product "${product.name}".`);
  }
  if (variant) {
    const { data: parent } = await supabase
      .from('products')
      .select('name')
      .eq('id', variant.product_id)
      .maybeSingle();
    const detail = [variant.size, variant.color, variant.design].filter(Boolean).join(' / ');
    return new Error(
      `SKU "${value}" is already used by a variant of "${parent?.name ?? 'another product'}"${
        detail ? ` (${detail})` : ''
      }.`,
    );
  }
  return new Error(`SKU "${value}" is already used by another product or variant.`);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'products'>) => {
      const row = { ...input, sku: input.sku.trim() };
      const { data, error } = await supabase.from('products').insert(row).select().single();
      if (error) throw await skuError(error, row.sku);
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'products'> & { id: string }) => {
      const row = patch.sku != null ? { ...patch, sku: patch.sku.trim() } : patch;
      const { data, error } = await supabase
        .from('products')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw await skuError(error, row.sku);
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['products', data.id] });
    },
  });
}

/**
 * Catalog rows referenced by stock movements, orders, purchases or FBA material lists are
 * protected by `on delete restrict` foreign keys (23503); say so in plain words.
 */
function deleteError(error: { code?: string; message: string }, what: string): Error {
  if (error.code === '23503') {
    return new Error(
      `This ${what} is used in stock history, orders, purchases or an FBA target's raw materials, so it can't be deleted. Mark it inactive instead.`,
    );
  }
  return new Error(error.message);
}

/** Storage paths of images owned by the given product and/or variants (rows cascade; files don't). */
async function imagePathsFor(filter: { productId?: string; variantIds?: string[] }) {
  const paths: string[] = [];
  if (filter.productId) {
    const { data } = await supabase
      .from('product_images')
      .select('storage_path')
      .eq('product_id', filter.productId);
    paths.push(...(data ?? []).map((r) => r.storage_path));
  }
  if (filter.variantIds && filter.variantIds.length > 0) {
    const { data } = await supabase
      .from('product_images')
      .select('storage_path')
      .in('variant_id', filter.variantIds);
    paths.push(...(data ?? []).map((r) => r.storage_path));
  }
  return paths;
}

async function removeImageFiles(paths: string[]) {
  // Best effort: the rows are already gone, so a leftover file is only wasted space.
  if (paths.length > 0) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
}

/** Everything a product/variant delete can change, including cascaded rows. */
function invalidateCatalog(queryClient: QueryClient) {
  for (const key of [
    'products',
    'product-variants',
    'product-images',
    'barcodes',
    'fba-targets',
    'fba-target-materials',
    'sku-aliases',
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Deletes a parent product. Its variants, barcodes, images and FBA targets are removed with it
 * by the database (on delete cascade); the image files are cleaned out of storage afterwards.
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', id);
      const paths = await imagePathsFor({
        productId: id,
        variantIds: (variants ?? []).map((v) => v.id),
      });

      const { data, error } = await supabase.from('products').delete().eq('id', id).select('id');
      if (error) throw deleteError(error, 'product or one of its variants');
      if (!data || data.length === 0) throw new Error('Only an admin can delete products.');

      await removeImageFiles(paths);
    },
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

/**
 * Moves every variant of `mergeId` (with its stock, orders, purchases, returns, exchanges and
 * FBA rows) under `keepId` and deletes `mergeId` — public.merge_products, one transaction,
 * admin only. Resolves to the number of variants moved.
 */
export function useMergeProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keepId, mergeId }: { keepId: string; mergeId: string }) => {
      const { data, error } = await supabase.rpc('merge_products', {
        p_keep: keepId,
        p_merge: mergeId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateCatalog(queryClient);
      for (const key of [
        'inventory',
        'inventory-movements',
        'orders',
        'order-items',
        'purchases',
        'purchase-items',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------
export function useCreateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'product_variants'>) => {
      const row = { ...input, sku: input.sku.trim() };
      const { data, error } = await supabase.from('product_variants').insert(row).select().single();
      if (error) throw await skuError(error, row.sku);
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['product-variants', data.product_id] });
      void queryClient.invalidateQueries({ queryKey: ['product-variants', 'all'] });
    },
  });
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'product_variants'> & { id: string }) => {
      const row = patch.sku != null ? { ...patch, sku: patch.sku.trim() } : patch;
      const { data, error } = await supabase
        .from('product_variants')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw await skuError(error, row.sku);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-variants', productId] });
      // The products list reads every variant from this cache.
      void queryClient.invalidateQueries({ queryKey: ['product-variants', 'all'] });
    },
  });
}

/**
 * Deletes variants (one or many) in a single statement, so a variant that can't be deleted
 * (it has stock history or orders) leaves all of them in place. Resolves to how many went.
 */
export function useDeleteVariants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const paths = await imagePathsFor({ variantIds: ids });
      const { data, error } = await supabase
        .from('product_variants')
        .delete()
        .in('id', ids)
        .select('id');
      if (error) throw deleteError(error, ids.length > 1 ? 'selection' : 'variant');
      if (!data || data.length === 0) throw new Error('Only an admin can delete variants.');
      await removeImageFiles(paths);
      return data.length;
    },
    onSuccess: () => invalidateCatalog(queryClient),
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

export interface BulkProductPatch {
  cost_price?: number;
  selling_price?: number;
  tax_rate?: number;
  hsn_sac_code?: string | null;
}

/**
 * Sets the same values on many parent products. With `variantsFollow`, the variants of those
 * products drop their own value for each changed field (cost/selling price/HSN) so they inherit
 * the new one; otherwise variants with their own value keep it.
 */
export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      patch,
      variantsFollow,
    }: {
      ids: string[];
      patch: BulkProductPatch;
      variantsFollow: boolean;
    }) => {
      const variantPatch: BulkVariantPatch = {};
      if (patch.cost_price !== undefined) variantPatch.cost_price = null;
      if (patch.selling_price !== undefined) variantPatch.selling_price = null;
      if (patch.hsn_sac_code !== undefined) variantPatch.hsn_sac_code = null;

      let updated = 0;
      for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
        const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
        const { data, error } = await supabase
          .from('products')
          .update(patch)
          .in('id', chunk)
          .select('id');
        if (error) throw error;
        updated += data.length;
        if (variantsFollow && Object.keys(variantPatch).length > 0) {
          const { error: variantError } = await supabase
            .from('product_variants')
            .update(variantPatch)
            .in('product_id', chunk);
          if (variantError) throw variantError;
        }
      }
      // RLS hides rows the caller can't update instead of raising, so compare counts.
      return { updated, requested: ids.length };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    },
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

function invalidateImages(queryClient: QueryClient, owner: BarcodeOwner) {
  void queryClient.invalidateQueries({ queryKey: ['product-images', imageKey(owner)] });
  void queryClient.invalidateQueries({ queryKey: ['product-images', 'all'] });
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
    onSuccess: () => invalidateImages(queryClient, owner),
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
    onSuccess: () => invalidateImages(queryClient, owner),
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
    onSuccess: () => invalidateImages(queryClient, owner),
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
    onSuccess: () => invalidateImages(queryClient, owner),
  });
}
