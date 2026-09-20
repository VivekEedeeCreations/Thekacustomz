import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['categories'] });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'categories'>) => {
      const { data, error } = await supabase.from('categories').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'categories'> & { id: string }) => {
      const { data, error } = await supabase
        .from('categories')
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

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}
