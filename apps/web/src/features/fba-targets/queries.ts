import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type FbaTarget = Tables<'fba_targets'>;
export type FbaTargetMaterial = Tables<'fba_target_materials'>;

export function useFbaTargets() {
  return useQuery({
    queryKey: ['fba-targets'],
    queryFn: async (): Promise<FbaTarget[]> => {
      const { data, error } = await supabase
        .from('fba_targets')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useFbaTargetMaterials() {
  return useQuery({
    queryKey: ['fba-target-materials'],
    queryFn: async (): Promise<FbaTargetMaterial[]> => {
      const { data, error } = await supabase.from('fba_target_materials').select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}
