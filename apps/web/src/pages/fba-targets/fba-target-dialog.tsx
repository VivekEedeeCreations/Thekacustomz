import { useEffect, useId, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { SearchableSelect } from '@/components/searchable-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSaveFbaTarget } from '@/features/fba-targets/mutations';
import type { FbaTarget, FbaTargetMaterial } from '@/features/fba-targets/queries';
import { itemKey, parseItemKey } from '@/features/products/item-options';
import { formatCurrency } from '@/lib/format';

import type { useFbaData } from './fba-data';
import {
  linesFromMaterials,
  materialInputs,
  toSearchOptions,
  type MaterialLine,
} from './fba-materials';
import { MaterialLinesEditor } from './fba-materials-editor';

const NONE = '__none__';

export function FbaTargetDialog({
  open,
  onOpenChange,
  target,
  targetMaterials,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The target being edited, or null to add a new one. */
  target: FbaTarget | null;
  targetMaterials: FbaTargetMaterial[];
  data: ReturnType<typeof useFbaData>;
}) {
  const ids = { item: useId(), qty: useId(), sku: useId(), fnsku: useId(), notes: useId() };
  const save = useSaveFbaTarget();

  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amazonSku, setAmazonSku] = useState('');
  const [fnsku, setFnsku] = useState('');
  const [calculationId, setCalculationId] = useState(NONE);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<MaterialLine[]>([]);

  useEffect(() => {
    if (!open) return;
    setItem(target ? itemKey(target.product_id, target.variant_id) : '');
    setQuantity(target ? String(target.target_quantity) : '');
    setAmazonSku(target?.amazon_sku ?? '');
    setFnsku(target?.fnsku ?? '');
    setCalculationId(target?.pricing_calculation_id ?? NONE);
    setNotes(target?.notes ?? '');
    setLines(linesFromMaterials(targetMaterials));
    // Only reset when the dialog opens, not when background queries refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  const materialOptions = data.options.filter((o) => o.product.product_type === 'RAW_MATERIAL');
  const finishedSearch = useMemo(() => {
    const taken = new Set(
      data.targets
        .filter((t) => t.id !== target?.id)
        .map((t) => itemKey(t.product_id, t.variant_id)),
    );
    return toSearchOptions(
      data.options.filter((o) => o.product.product_type === 'PRODUCT'),
      taken,
    );
  }, [data.options, data.targets, target?.id]);
  const linked = calculationId !== NONE ? data.calculationById.get(calculationId) : undefined;

  const handleSave = async () => {
    if (!item) {
      toast.error('Choose the finished SKU to ship');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error('Target quantity must be a whole number, 0 or more');
      return;
    }
    const materials = materialInputs(lines);
    if (typeof materials === 'string') {
      toast.error(materials);
      return;
    }

    const { productId, variantId } = parseItemKey(item);
    try {
      await save.mutateAsync({
        target: {
          id: target?.id,
          product_id: productId,
          variant_id: variantId,
          amazon_sku: amazonSku,
          fnsku,
          target_quantity: qty,
          pricing_calculation_id: calculationId === NONE ? null : calculationId,
          notes,
        },
        materials,
      });
      toast.success(target ? 'FBA target updated' : 'FBA target added');
      onOpenChange(false);
    } catch (error) {
      const message = (error as Error).message;
      toast.error('Could not save FBA target', {
        description: message.includes('fba_targets_unique_item')
          ? 'That SKU already has an FBA target — edit it instead.'
          : message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target ? 'Edit FBA target' : 'Add FBA target'}</DialogTitle>
          <DialogDescription>
            The finished SKU to send to Amazon FBA, how many, and the raw materials one unit uses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor={ids.item}>Finished SKU</Label>
              <SearchableSelect
                id={ids.item}
                options={finishedSearch}
                value={item}
                onChange={setItem}
                placeholder="Select a product or variant"
                searchPlaceholder="Search SKU, name, size, color, design…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.qty}>Target qty</Label>
              <Input
                id={ids.qty}
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 200"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.sku}>Amazon SKU (optional)</Label>
              <Input
                id={ids.sku}
                maxLength={80}
                value={amazonSku}
                onChange={(e) => setAmazonSku(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.fnsku}>FNSKU (optional)</Label>
              <Input
                id={ids.fnsku}
                maxLength={40}
                value={fnsku}
                onChange={(e) => setFnsku(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Price calculation</Label>
            <Select value={calculationId} onValueChange={setCalculationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not linked</SelectItem>
                {data.calculations.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linked ? (
              <p className="text-xs text-muted-foreground">
                Cost per unit {formatCurrency(linked.unitCost)}
                {linked.breakdown
                  ? ` at a selling price of ${formatCurrency(linked.breakdown.sellingPrice)}`
                  : ' (fixed costs only — the calculation has no selling price)'}
                {quantity && Number(quantity) > 0
                  ? ` · ${formatCurrency(linked.unitCost * Number(quantity))} for ${quantity} units`
                  : ''}
              </p>
            ) : data.calculations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Save a calculation on the Price calculator page to link it here.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Raw materials per finished unit</Label>
            <MaterialLinesEditor
              lines={lines}
              onChange={setLines}
              materialOptions={materialOptions}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.notes}>Notes</Label>
            <Textarea
              id={ids.notes}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleSave()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {target ? 'Save changes' : 'Add target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
