import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Vendor = Tables<'vendors'>;

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: async (): Promise<Vendor[]> => {
      const { data, error } = await supabase.from('vendors').select('*').order('company_name');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}
