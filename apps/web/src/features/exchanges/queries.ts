import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Exchange = Tables<'exchanges'>;
export type ExchangeItem = Tables<'exchange_items'>;

export function useExchanges() {
  return useQuery({
    queryKey: ['exchanges'],
    queryFn: async (): Promise<Exchange[]> => {
      const { data, error } = await supabase
        .from('exchanges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });
}

export function useExchangeItems() {
  return useQuery({
    queryKey: ['exchange-items'],
    queryFn: async (): Promise<ExchangeItem[]> => {
      const { data, error } = await supabase.from('exchange_items').select('*').limit(5000);
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });
}
