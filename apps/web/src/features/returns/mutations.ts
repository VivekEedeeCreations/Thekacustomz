import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Json, ReturnStatus } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export interface NewReturnInput {
  header: { order_id: string; reason?: string; location_id?: string; notes?: string };
  items: { order_item_id: string; quantity: number; condition?: string }[];
}

/** A received return puts stock back, so refresh inventory alongside the returns lists. */
function invalidateReturns(queryClient: QueryClient) {
  for (const key of ['returns', 'return-items', 'inventory', 'inventory-movements']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Creates a return and its lines atomically (public.create_return). Resolves to the new id. */
export function useCreateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewReturnInput) => {
      const { data, error } = await supabase.rpc('create_return', {
        p_return: input.header as unknown as Json,
        p_items: input.items as unknown as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateReturns(queryClient),
  });
}

/**
 * Advances a return: REQUESTED → AUTHORIZED/REJECTED → RECEIVED (stock goes back
 * into the chosen location) → REFUNDED (records the refund amount).
 */
export function useUpdateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: ReturnStatus;
      refund_amount?: number;
      location_id?: string | null;
      notes?: string | null;
    }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from('returns')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateReturns(queryClient),
  });
}
