import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { SearchableSelect } from '@/components/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ItemOption } from '@/features/products/item-options';

import { newMaterialLine, toSearchOptions, type MaterialLine } from './fba-materials';

/** Raw materials used by one finished unit: searchable item + quantity per unit, any number of rows. */
export function MaterialLinesEditor({
  lines,
  onChange,
  materialOptions,
}: {
  lines: MaterialLine[];
  onChange: (lines: MaterialLine[]) => void;
  materialOptions: ItemOption[];
}) {
  const searchable = useMemo(() => toSearchOptions(materialOptions), [materialOptions]);
  const update = (rowId: number, patch: Partial<MaterialLine>) =>
    onChange(lines.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <div key={line.rowId} className="flex items-center gap-2">
          <SearchableSelect
            className="min-w-0 flex-1"
            aria-label="Raw material"
            options={searchable}
            value={line.key}
            onChange={(key) => update(line.rowId, { key })}
            placeholder="Select a raw material"
            searchPlaceholder="Search raw materials…"
          />
          <Input
            type="number"
            min="0"
            step="any"
            aria-label="Quantity per unit"
            className="w-24 shrink-0"
            placeholder="Qty"
            value={line.quantity}
            onChange={(e) => update(line.rowId, { quantity: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove raw material"
            onClick={() => onChange(lines.filter((l) => l.rowId !== line.rowId))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {materialOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No raw materials in the catalog yet — add products with type “Raw material” first.
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, newMaterialLine()])}
        >
          <Plus className="h-4 w-4" />
          Add raw material
        </Button>
      )}
    </div>
  );
}
