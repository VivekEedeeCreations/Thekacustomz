import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['pricing-calculations'] });
}

export function useCreatePricingCalculation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'pricing_calculations'>) => {
      const { data, error } = await supabase
        .from('pricing_calculations')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdatePricingCalculation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'pricing_calculations'> & { id: string }) => {
      const { data, error } = await supabase
        .from('pricing_calculations')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeletePricingCalculation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // RLS silently filters rows the user may not delete, so check something was removed.
      const { data, error } = await supabase
        .from('pricing_calculations')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Only the person who saved it, or an admin, can delete this.');
      }
    },
    onSuccess: () => invalidate(queryClient),
  });
}
