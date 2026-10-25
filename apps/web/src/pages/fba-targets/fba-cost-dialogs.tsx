import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  useBulkUpdateFbaTargets,
  useSaveFbaCategoryDefault,
  type FbaBulkPatch,
} from '@/features/fba-targets/mutations';
import type { PricingCalculation } from '@/features/pricing-calculations/queries';

const KEEP = '__keep__';
const NONE = '__none__';

/** A money field: blank = leave as is; "clear" = remove the value so the next level applies. */
interface MoneyField {
  value: string;
  clear: boolean;
}
const EMPTY: MoneyField = { value: '', clear: false };

function MoneyInput({
  id,
  label,
  field,
  onChange,
  clearLabel,
}: {
  id: string;
  label: string;
  field: MoneyField;
  onChange: (next: MoneyField) => void;
  clearLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
          ₹
        </span>
        <Input
          id={id}
          type="number"
          min="0"
          step="0.01"
          className="pl-7"
          placeholder={field.clear ? 'Will be cleared' : 'Leave unchanged'}
          disabled={field.clear}
          value={field.clear ? '' : field.value}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-clear`}
          checked={field.clear}
          onCheckedChange={(v) => onChange({ value: '', clear: v === true })}
        />
        <Label htmlFor={`${id}-clear`} className="text-xs font-normal text-muted-foreground">
          {clearLabel}
        </Label>
      </div>
    </div>
  );
}

/** Reads a money field: undefined = unchanged, null = clear, number = set, Error = invalid. */
function readMoney(field: MoneyField, label: string): number | null | undefined | Error {
  if (field.clear) return null;
  const text = field.value.trim();
  if (!text) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return new Error(`${label} must be a number, 0 or more`);
  return Math.round(n * 100) / 100;
}

/** Bulk-set target quantity, cost, price and/or linked calculation on the ticked SKUs. */
export function FbaBulkEditDialog({
  open,
  onOpenChange,
  targetIds,
  calculations,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetIds: string[];
  calculations: PricingCalculation[];
  onDone: () => void;
}) {
  const bulkUpdate = useBulkUpdateFbaTargets();
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState<MoneyField>(EMPTY);
  const [price, setPrice] = useState<MoneyField>(EMPTY);
  const [calc, setCalc] = useState(KEEP);

  useEffect(() => {
    if (!open) return;
    setQty('');
    setCost(EMPTY);
    setPrice(EMPTY);
    setCalc(KEEP);
  }, [open]);

  const submit = async () => {
    const patch: FbaBulkPatch = {};
    if (qty.trim()) {
      const n = Number(qty);
      if (!Number.isInteger(n) || n < 0) {
        toast.error('Target quantity must be a whole number, 0 or more');
        return;
      }
      patch.target_quantity = n;
    }
    for (const [field, key, label] of [
      [cost, 'unit_cost', 'Cost per unit'],
      [price, 'unit_price', 'Price per unit'],
    ] as const) {
      const value = readMoney(field, label);
      if (value instanceof Error) {
        toast.error(value.message);
        return;
      }
      if (value !== undefined) patch[key] = value;
    }
    if (calc !== KEEP) patch.pricing_calculation_id = calc === NONE ? null : calc;

    if (Object.keys(patch).length === 0) {
      toast.error('Nothing to change', { description: 'Fill in at least one field.' });
      return;
    }
    try {
      const count = await bulkUpdate.mutateAsync({ ids: targetIds, patch });
      toast.success(`Updated ${count} SKU${count === 1 ? '' : 's'}`);
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error('Bulk update failed', { description: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Update {targetIds.length} SKU{targetIds.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            Only the fields you fill in change. A cost or price set here is used before the linked
            calculation and the category default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fba-bulk-qty">Target quantity</Label>
            <Input
              id="fba-bulk-qty"
              type="number"
              min="0"
              step="1"
              className="w-40"
              placeholder="Leave unchanged"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyInput
              id="fba-bulk-cost"
              label="Cost per unit"
              field={cost}
              onChange={setCost}
              clearLabel="Clear (use calculation / category)"
            />
            <MoneyInput
              id="fba-bulk-price"
              label="Selling price per unit"
              field={price}
              onChange={setPrice}
              clearLabel="Clear (use calculation / category)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Price calculation</Label>
            <Select value={calc} onValueChange={setCalc}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Leave unchanged</SelectItem>
                <SelectItem value={NONE}>Unlink calculation</SelectItem>
                {calculations.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={bulkUpdate.isPending}>
            {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply to {targetIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Default cost/price for every SKU of one category; optionally stamped onto all of them now. */
export function FbaCategoryDefaultDialog({
  category,
  onOpenChange,
}: {
  category: {
    id: string;
    name: string;
    unitCost: number | null;
    unitPrice: number | null;
    targetIds: string[];
  } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveFbaCategoryDefault();
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);

  useEffect(() => {
    if (!category) return;
    setCost(category.unitCost != null ? String(category.unitCost) : '');
    setPrice(category.unitPrice != null ? String(category.unitPrice) : '');
    setApplyToAll(false);
  }, [category]);

  const submit = async () => {
    if (!category) return;
    const parse = (text: string, label: string): number | null | Error => {
      if (!text.trim()) return null;
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) return new Error(`${label} must be a number, 0 or more`);
      return Math.round(n * 100) / 100;
    };
    const unitCost = parse(cost, 'Cost per unit');
    const unitPrice = parse(price, 'Price per unit');
    const problem = [unitCost, unitPrice].find((v): v is Error => v instanceof Error);
    if (problem) {
      toast.error(problem.message);
      return;
    }
    try {
      await save.mutateAsync({
        categoryId: category.id,
        unitCost: unitCost as number | null,
        unitPrice: unitPrice as number | null,
        targetIds: applyToAll ? category.targetIds : undefined,
      });
      toast.success(`Saved defaults for ${category.name}`);
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not save', { description: (error as Error).message });
    }
  };

  const count = category?.targetIds.length ?? 0;

  return (
    <Dialog open={!!category} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>FBA cost & price — {category?.name}</DialogTitle>
          <DialogDescription>
            Used for every SKU in this category that has no cost/price of its own and no linked
            price calculation. Leave a field blank to have no default.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['fba-cat-cost', 'Cost per unit', cost, setCost],
                ['fba-cat-price', 'Selling price per unit', price, setPrice],
              ] as const
            ).map(([id, label, value, set]) => (
              <div key={id} className="space-y-1.5">
                <Label htmlFor={id}>{label}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    placeholder="No default"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          {count > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border p-3">
              <Checkbox
                id="fba-cat-apply-all"
                checked={applyToAll}
                onCheckedChange={(v) => setApplyToAll(v === true)}
              />
              <Label htmlFor="fba-cat-apply-all" className="text-sm font-normal leading-snug">
                Also set these on all {count} SKU{count === 1 ? '' : 's'} in this category now
                <span className="block text-xs text-muted-foreground">
                  Replaces their own cost/price, so it wins over linked calculations too. Blank
                  fields clear the SKU&apos;s own value.
                </span>
              </Label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
