import type { SearchableOption } from '@/components/searchable-select';
import type { FbaMaterialInput } from '@/features/fba-targets/mutations';
import type { FbaTargetMaterial } from '@/features/fba-targets/queries';
import { itemKey, parseItemKey, type ItemOption } from '@/features/products/item-options';

/** One editable raw-material row: an item key ("productId|variantId") and qty per finished unit. */
export interface MaterialLine {
  rowId: number;
  key: string;
  quantity: string;
}

let nextRowId = 0;
export function newMaterialLine(key = '', quantity = '1'): MaterialLine {
  nextRowId += 1;
  return { rowId: nextRowId, key, quantity };
}

export function linesFromMaterials(materials: FbaTargetMaterial[]): MaterialLine[] {
  return materials.map((m) =>
    newMaterialLine(
      itemKey(m.material_product_id, m.material_variant_id),
      String(m.quantity_per_unit),
    ),
  );
}

/** Checks the filled-in rows; returns an error message, or the rows ready to save. */
export function materialInputs(lines: MaterialLine[]): string | FbaMaterialInput[] {
  const filled = lines.filter((l) => l.key);
  const seen = new Set<string>();
  for (const line of filled) {
    if (!(Number(line.quantity) > 0)) {
      return 'Each raw material needs a quantity per unit greater than 0';
    }
    if (seen.has(line.key)) return 'The same raw material is listed twice — combine the quantities';
    seen.add(line.key);
  }
  return filled.map((l) => {
    const m = parseItemKey(l.key);
    return {
      material_product_id: m.productId,
      material_variant_id: m.variantId,
      quantity_per_unit: Number(l.quantity),
    };
  });
}

/** Catalog items as searchable options; size/color/design and SKU are all searchable. */
export function toSearchOptions(options: ItemOption[], taken?: Set<string>): SearchableOption[] {
  return options.map((o) => ({
    value: o.key,
    label: o.label,
    keywords: [o.product.name, o.product.sku, o.variant?.size, o.variant?.color, o.variant?.design]
      .filter(Boolean)
      .join(' '),
    disabled: taken?.has(o.key),
    hint: taken?.has(o.key) ? 'already added' : undefined,
  }));
}
