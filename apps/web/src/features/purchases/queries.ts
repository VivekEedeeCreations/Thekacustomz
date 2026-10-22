import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Purchase = Tables<'purchase_orders'>;
export type PurchaseItem = Tables<'purchase_order_items'>;
export type PurchaseDocument = Tables<'purchase_documents'>;

export const PURCHASE_BILLS_BUCKET = 'purchase-bills';

export function usePurchases() {
  return useQuery({
    queryKey: ['purchases'],
    queryFn: async (): Promise<Purchase[]> => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}

export function usePurchaseItems(purchaseId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-items', purchaseId],
    queryFn: async (): Promise<PurchaseItem[]> => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', purchaseId!)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!purchaseId,
  });
}

/** Every bill attachment, so the list can show a count per purchase. */
export function usePurchaseDocuments() {
  return useQuery({
    queryKey: ['purchase-documents'],
    queryFn: async (): Promise<PurchaseDocument[]> => {
      const { data, error } = await supabase
        .from('purchase_documents')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}

/** Short-lived links to view private bill files, keyed by storage path. */
export function useBillUrls(paths: string[]) {
  return useQuery({
    queryKey: ['purchase-bill-urls', paths],
    queryFn: async (): Promise<Record<string, string>> => {
      if (paths.length === 0) return {};
      const { data, error } = await supabase.storage
        .from(PURCHASE_BILLS_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const item of data) if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      return map;
    },
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
