import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert, TablesUpdate } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
}

/** Unique index on the account number — explain it instead of showing the raw constraint. */
function friendly(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('An account with this number already exists.');
  return new Error(error.message);
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'bank_accounts'>) => {
      const { data, error } = await supabase.from('bank_accounts').insert(input).select().single();
      if (error) throw friendly(error);
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'bank_accounts'> & { id: string }) => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw friendly(error);
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Only an admin can delete bank accounts.');
    },
    onSuccess: () => invalidate(queryClient),
  });
}
