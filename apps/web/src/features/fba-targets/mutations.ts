import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesUpdate } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['fba-targets'] });
  void queryClient.invalidateQueries({ queryKey: ['fba-target-materials'] });
  void queryClient.invalidateQueries({ queryKey: ['fba-category-defaults'] });
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
  /** Leave out to keep the target's current value; null clears it. */
  unit_cost?: number | null;
  unit_price?: number | null;
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

export type FbaBulkPatch = TablesUpdate<'fba_targets'>;

/** Sets the same quantity / cost / price / calculation on many targets. Resolves to how many changed. */
export function useBulkUpdateFbaTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: FbaBulkPatch }) => {
      if (ids.length === 0 || Object.keys(patch).length === 0) return 0;
      const { data, error } = await supabase
        .from('fba_targets')
        .update(patch)
        .in('id', ids)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("You don't have permission to edit FBA targets.");
      }
      return data.length;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * Saves a category's default FBA cost/price (both null removes the default). With `targetIds`,
 * also writes those values onto each of those targets, so they apply even where a SKU has its
 * own value or a linked calculation.
 */
export function useSaveFbaCategoryDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      unitCost,
      unitPrice,
      targetIds,
    }: {
      categoryId: string;
      unitCost: number | null;
      unitPrice: number | null;
      targetIds?: string[];
    }) => {
      if (unitCost == null && unitPrice == null) {
        const { error } = await supabase
          .from('fba_category_defaults')
          .delete()
          .eq('category_id', categoryId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('fba_category_defaults')
          .upsert({ category_id: categoryId, unit_cost: unitCost, unit_price: unitPrice });
        if (error) throw error;
      }
      if (targetIds && targetIds.length > 0) {
        const { error } = await supabase
          .from('fba_targets')
          .update({ unit_cost: unitCost, unit_price: unitPrice })
          .in('id', targetIds);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(queryClient),
  });
}
