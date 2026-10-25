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

/**
 * Removes FBA targets (one or many) with their raw-material lists. Planning data only — stock and
 * orders are untouched. Resolves to how many were removed.
 */
export function useDeleteFbaTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { data, error } = await supabase
        .from('fba_targets')
        .delete()
        .in('id', ids)
        .select('id');
      if (error) throw error;
      // RLS hides rows the caller may not delete instead of raising.
      if (!data || data.length === 0) {
        throw new Error("You don't have permission to remove FBA targets.");
      }
      return data.length;
    },
    onSuccess: () => invalidate(queryClient),
  });
}
