import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['vendors'] });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'vendors'>) => {
      const { data, error } = await supabase.from('vendors').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'vendors'> & { id: string }) => {
      const { data, error } = await supabase
        .from('vendors')
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

export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}
