import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['petty-entries'] });
}

export function useCreatePettyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'petty_entries'>) => {
      const { data, error } = await supabase.from('petty_entries').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdatePettyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'petty_entries'> & { id: string }) => {
      const { data, error } = await supabase
        .from('petty_entries')
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

/** Marks a receivable as received / a payable as paid on `date`, so it counts toward the balance. */
export function useSettlePettyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase
        .from('petty_entries')
        .update({ status: 'SETTLED', entry_date: date })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeletePettyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('petty_entries')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Only an admin can delete entries.');
    },
    onSuccess: () => invalidate(queryClient),
  });
}
