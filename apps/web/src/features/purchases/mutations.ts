import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Json } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

import { PURCHASE_BILLS_BUCKET, type PurchaseDocument } from './queries';

export const MAX_BILL_BYTES = 10 * 1024 * 1024;
export const BILL_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf';

export interface PurchaseHeaderInput {
  vendor_id: string;
  location_id: string | null;
  order_date: string;
  vendor_bill_number: string;
  discount_amount: number;
  shipping_amount: number;
  notes: string;
  /** Receive every line in full into location_id now (adds stock). */
  receive: boolean;
}

export interface PurchaseItemInput {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_cost: number;
  tax_rate: number;
}

function invalidate(queryClient: QueryClient) {
  for (const key of [
    'purchases',
    'purchase-items',
    'purchase-documents',
    'inventory',
    'inventory-movements',
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Uploads bill files for a purchase and records them. Returns the names that failed. */
async function uploadBills(purchaseId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    if (file.size > MAX_BILL_BYTES) {
      failed.push(`${file.name} (over 10 MB)`);
      continue;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `purchases/${purchaseId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PURCHASE_BILLS_BUCKET)
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) {
      failed.push(`${file.name} (${uploadError.message})`);
      continue;
    }
    const { error } = await supabase.from('purchase_documents').insert({
      purchase_order_id: purchaseId,
      storage_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    });
    if (error) {
      await supabase.storage.from(PURCHASE_BILLS_BUCKET).remove([path]);
      failed.push(`${file.name} (${error.message})`);
    }
  }
  return failed;
}

/**
 * Records a purchase through public.record_purchase (one transaction: purchase, lines and,
 * if asked, the stock receipt), then uploads the bill files. A failed upload doesn't undo the
 * purchase; the failures are returned so they can be retried from the purchase.
 */
export function useRecordPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      header,
      items,
      bills,
    }: {
      header: PurchaseHeaderInput;
      items: PurchaseItemInput[];
      bills: File[];
    }) => {
      const { data: id, error } = await supabase.rpc('record_purchase', {
        p_purchase: { ...header } as Json,
        p_items: items.map((i) => ({ ...i })) as Json,
      });
      if (error) throw error;
      const failedBills = await uploadBills(id, bills);
      return { id, failedBills };
    },
    onSettled: () => invalidate(queryClient),
  });
}

export function useAddPurchaseBills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ purchaseId, files }: { purchaseId: string; files: File[] }) =>
      uploadBills(purchaseId, files),
    onSettled: () => invalidate(queryClient),
  });
}

export function useDeletePurchaseBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (doc: PurchaseDocument) => {
      const { error } = await supabase.from('purchase_documents').delete().eq('id', doc.id);
      if (error) throw error;
      await supabase.storage.from(PURCHASE_BILLS_BUCKET).remove([doc.storage_path]);
    },
    onSettled: () => invalidate(queryClient),
  });
}
