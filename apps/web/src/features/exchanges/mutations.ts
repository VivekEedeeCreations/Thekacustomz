import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ExchangeStatus, Json } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export interface NewExchangeInput {
  header: { original_order_id: string; reason?: string; location_id?: string; notes?: string };
  items: {
    original_order_item_id: string;
    returned_quantity: number;
    new_product_id: string;
    new_variant_id?: string | null;
    new_quantity: number;
    price_difference?: number;
  }[];
}

/** Completing an exchange moves stock both ways, so refresh inventory too. */
function invalidateExchanges(queryClient: QueryClient) {
  for (const key of ['exchanges', 'exchange-items', 'inventory', 'inventory-movements']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Creates an exchange and its lines atomically (public.create_exchange). Resolves to the new id. */
export function useCreateExchange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewExchangeInput) => {
      const { data, error } = await supabase.rpc('create_exchange', {
        p_exchange: input.header as unknown as Json,
        p_items: input.items as unknown as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateExchanges(queryClient),
  });
}

/** REQUESTED → APPROVED/REJECTED → (DISPATCHED) → COMPLETED, which posts the stock movements. */
export function useSetExchangeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ExchangeStatus }) => {
      const { data, error } = await supabase
        .from('exchanges')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateExchanges(queryClient),
  });
}
