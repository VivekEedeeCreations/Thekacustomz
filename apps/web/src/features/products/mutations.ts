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
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['barcodes', barcodeKey(owner)] }),
  });
}

/** Calls the public.generate_ean13() DB function, then inserts the result as a barcode row. */
export function useGenerateEan13Barcode(owner: BarcodeOwner) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { isPrimary?: boolean } = {}) => {
      const { data: code, error: rpcError } = await supabase.rpc('generate_ean13');
      if (rpcError) throw rpcError;

      const { data, error } = await supabase
        .from('barcodes')
        .insert({
          barcode: code,
          symbology: 'EAN13',
          product_id: owner.productId ?? null,
          variant_id: owner.variantId ?? null,
          is_primary: input.isPrimary ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['barcodes', barcodeKey(owner)] }),
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
