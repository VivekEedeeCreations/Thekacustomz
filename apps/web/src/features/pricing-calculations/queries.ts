import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type PricingCalculation = Tables<'pricing_calculations'>;

export function usePricingCalculations() {
  return useQuery({
    queryKey: ['pricing-calculations'],
    queryFn: async (): Promise<PricingCalculation[]> => {
      const { data, error } = await supabase
        .from('pricing_calculations')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}
