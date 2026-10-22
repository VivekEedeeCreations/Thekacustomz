import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json, SalesChannel, Tables, TablesInsert } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type SkuAlias = Tables<'sku_aliases'>;

export function useSkuAliases() {
  return useQuery({
    queryKey: ['sku-aliases'],
    queryFn: async (): Promise<SkuAlias[]> => {
      const { data, error } = await supabase.from('sku_aliases').select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

/**
 * Which of these channel order ids already exist, as "CHANNEL|lowercased id" keys. Orders are
 * unique per (sales_channel, external_order_id), so these get skipped rather than duplicated.
 */
export async function fetchExistingOrderKeys(
  orders: { channel: SalesChannel; externalOrderId: string }[],
): Promise<Set<string>> {
  const found = new Set<string>();
  const ids = [...new Set(orders.map((o) => o.externalOrderId))];
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('orders')
      .select('sales_channel, external_order_id')
      .in('external_order_id', ids.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data) {
      if (row.external_order_id) {
        found.add(`${row.sales_channel}|${row.external_order_id.toLowerCase()}`);
      }
    }
  }
  return found;
}

export interface ImportOrderPayload {
  header: Record<string, string | number | undefined>;
  items: {
    product_id: string;
    variant_id: string | null;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }[];
}

/**
 * Saves new SKU aliases, then creates each order through public.create_order (one transaction per
 * order), reporting progress. One order failing doesn't stop the rest.
 */
export function useImportOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      aliases,
      orders,
      onProgress,
    }: {
      aliases: TablesInsert<'sku_aliases'>[];
      orders: (ImportOrderPayload & { label: string })[];
      onProgress: (done: number) => void;
    }) => {
      let aliasError: string | null = null;
      if (aliases.length > 0) {
        const { error } = await supabase.from('sku_aliases').insert(aliases);
        if (error) aliasError = error.message;
      }

      const failures: { label: string; message: string }[] = [];
      let created = 0;
      for (const [i, order] of orders.entries()) {
        const { error } = await supabase.rpc('create_order', {
          p_order: order.header as Json,
          p_items: order.items as unknown as Json,
        });
        if (error) failures.push({ label: order.label, message: error.message });
        else created += 1;
        onProgress(i + 1);
      }
      return { created, failures, aliasError };
    },
    onSettled: () => {
      for (const key of ['orders', 'order-items', 'sku-aliases']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
