import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['fba-targets'] });
  void queryClient.invalidateQueries({ queryKey: ['fba-target-materials'] });
}

export interface FbaTargetInput {
  id?: string;
  product_id: string;
  variant_id: string | null;
  amazon_sku: string;
  fnsku: string;
  target_quantity: number;
  pricing_calculation_id: string | null;
  notes: string;
}

export interface FbaMaterialInput {
  material_product_id: string;
  material_variant_id: string | null;
  quantity_per_unit: number;
}

/** Creates or updates a target and replaces its material lines in one transaction. */
export function useSaveFbaTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      target,
      materials,
    }: {
      target: FbaTargetInput;
      materials: FbaMaterialInput[];
    }) => {
      const { data, error } = await supabase.rpc('save_fba_target', {
        p_target: { ...target },
        p_materials: materials.map((m) => ({ ...m })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteFbaTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('fba_targets').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Only an admin can delete an FBA target.');
    },
    onSuccess: () => invalidate(queryClient),
  });
}
