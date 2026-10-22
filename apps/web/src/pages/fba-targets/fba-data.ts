import { useMemo } from 'react';

import {
  useFbaTargetMaterials,
  useFbaTargets,
  type FbaTargetMaterial,
} from '@/features/fba-targets/queries';
import { useInventory } from '@/features/inventory/queries';
import { usePricingCalculations } from '@/features/pricing-calculations/queries';
import { buildItemOptions, itemKey } from '@/features/products/item-options';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { stateFromJson, unitCostFromState } from '@/pages/pricing-calculator/calculator-state';

/** Everything the FBA page needs, joined into lookups. */
export function useFbaData() {
  const targets = useFbaTargets();
  const materials = useFbaTargetMaterials();
  const products = useProducts();
  const variants = useAllVariants();
  const inventory = useInventory();
  const calculations = usePricingCalculations();

  const options = useMemo(
    () => buildItemOptions(products.data ?? [], variants.data ?? []),
    [products.data, variants.data],
  );
  const optionByKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  const stockByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of inventory.data ?? []) {
      const key = itemKey(row.product_id, row.variant_id);
      map.set(key, (map.get(key) ?? 0) + row.available_quantity);
    }
    return map;
  }, [inventory.data]);

  const calculationById = useMemo(
    () =>
      new Map(
        (calculations.data ?? []).map((calc) => [
          calc.id,
          { calc, ...unitCostFromState(stateFromJson(calc.inputs)) },
        ]),
      ),
    [calculations.data],
  );

  const materialsByTarget = useMemo(() => {
    const map = new Map<string, FbaTargetMaterial[]>();
    for (const m of materials.data ?? []) {
      const list = map.get(m.fba_target_id);
      if (list) list.push(m);
      else map.set(m.fba_target_id, [m]);
    }
    return map;
  }, [materials.data]);

  return {
    isLoading: targets.isLoading || materials.isLoading || products.isLoading,
    targets: targets.data ?? [],
    calculations: calculations.data ?? [],
    options,
    optionByKey,
    stockByKey,
    calculationById,
    materialsByTarget,
  };
}
