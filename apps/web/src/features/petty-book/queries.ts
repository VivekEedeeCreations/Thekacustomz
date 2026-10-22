import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type PettyEntry = Tables<'petty_entries'>;
export type PettyEntryType = PettyEntry['entry_type'];
export type PettyEntryStatus = PettyEntry['status'];

/** Settled entries dated within [from, to] (inclusive, yyyy-mm-dd), newest first. */
export function usePettyEntries(from: string, to: string) {
  return useQuery({
    queryKey: ['petty-entries', 'settled', from, to],
    queryFn: async (): Promise<PettyEntry[]> => {
      const { data, error } = await supabase
        .from('petty_entries')
        .select('*')
        .eq('status', 'SETTLED')
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}

/** Net settled balance (income − expense) of everything before `date` — the opening balance. */
export function usePettyBalanceBefore(date: string) {
  return useQuery({
    queryKey: ['petty-entries', 'balance-before', date],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('petty_entries')
        .select('entry_type, amount')
        .eq('status', 'SETTLED')
        .lt('entry_date', date);
      if (error) throw error;
      return data.reduce((sum, e) => sum + (e.entry_type === 'INCOME' ? e.amount : -e.amount), 0);
    },
    staleTime: 15_000,
  });
}

/** All open receivables (pending income) and payables (pending expense), soonest due first. */
export function usePettyPending() {
  return useQuery({
    queryKey: ['petty-entries', 'pending'],
    queryFn: async (): Promise<PettyEntry[]> => {
      const { data, error } = await supabase
        .from('petty_entries')
        .select('*')
        .eq('status', 'PENDING')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('entry_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}
