import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Location = Tables<'locations'>;

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}
