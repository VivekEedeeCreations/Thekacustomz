import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type BankAccount = Tables<'bank_accounts'>;

export function useBankAccounts() {
  return useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('is_active', { ascending: false })
        .order('account_name');
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}
