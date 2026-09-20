import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type OrderReturn = Tables<'returns'>;
export type ReturnItem = Tables<'return_items'>;

export function useReturns() {
  return useQuery({
    queryKey: ['returns'],
    queryFn: async (): Promise<OrderReturn[]> => {
      const { data, error } = await supabase
        .from('returns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });
}

/** All return lines — small enough at this scale to join client-side for the list summary. */
export function useReturnItems() {
  return useQuery({
    queryKey: ['return-items'],
    queryFn: async (): Promise<ReturnItem[]> => {
      const { data, error } = await supabase.from('return_items').select('*').limit(5000);
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });
}
