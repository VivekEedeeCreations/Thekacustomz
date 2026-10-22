import { useEffect, useId, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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

const NONE = '__none__';

interface MaterialLine {
  rowId: number;
  key: string;
  quantity: string;
}

let nextRowId = 0;
const newRowId = () => ++nextRowId;

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
    setLines(
      targetMaterials.map((m) => ({
        rowId: newRowId(),
        key: itemKey(m.material_product_id, m.material_variant_id),
        quantity: String(m.quantity_per_unit),
      })),
    );
    // Only reset when the dialog opens, not when background queries refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  const finishedOptions = data.options.filter((o) => o.product.product_type === 'PRODUCT');
  const materialOptions = data.options.filter((o) => o.product.product_type === 'RAW_MATERIAL');
  const takenTargets = new Set(
    data.targets.filter((t) => t.id !== target?.id).map((t) => itemKey(t.product_id, t.variant_id)),
  );
  const linked = calculationId !== NONE ? data.calculationById.get(calculationId) : undefined;

  const updateLine = (rowId: number, patch: Partial<MaterialLine>) =>
    setLines((prev) => prev.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)));

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
    const filled = lines.filter((l) => l.key);
    const seen = new Set<string>();
    for (const line of filled) {
      const per = Number(line.quantity);
      if (!(per > 0)) {
        toast.error('Each raw material needs a quantity per unit greater than 0');
        return;
      }
      if (seen.has(line.key)) {
        toast.error('The same raw material is listed twice — combine the quantities');
        return;
      }
      seen.add(line.key);
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
        materials: filled.map((l) => {
          const m = parseItemKey(l.key);
          return {
            material_product_id: m.productId,
            material_variant_id: m.variantId,
            quantity_per_unit: Number(l.quantity),
          };
        }),
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
              <Select value={item} onValueChange={setItem}>
                <SelectTrigger id={ids.item}>
                  <SelectValue placeholder="Select a product or variant" />
                </SelectTrigger>
                <SelectContent>
                  {finishedOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key} disabled={takenTargets.has(o.key)}>
                      {o.label}
                      {takenTargets.has(o.key) ? ' (already added)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {lines.map((line) => (
              <div key={line.rowId} className="flex items-center gap-2">
                <Select value={line.key} onValueChange={(key) => updateLine(line.rowId, { key })}>
                  <SelectTrigger className="min-w-0 flex-1" aria-label="Raw material">
                    <SelectValue placeholder="Select a raw material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materialOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  aria-label="Quantity per unit"
                  className="w-24 shrink-0"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.rowId, { quantity: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove raw material"
                  onClick={() => setLines((prev) => prev.filter((l) => l.rowId !== line.rowId))}
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
                onClick={() =>
                  setLines((prev) => [...prev, { rowId: newRowId(), key: '', quantity: '1' }])
                }
              >
                <Plus className="h-4 w-4" />
                Add raw material
              </Button>
            )}
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
