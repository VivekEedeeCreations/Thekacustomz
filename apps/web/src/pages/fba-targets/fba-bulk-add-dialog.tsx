import { useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { useSaveFbaTarget } from '@/features/fba-targets/mutations';
import { itemKey, parseItemKey } from '@/features/products/item-options';
import { formatCurrency } from '@/lib/format';
import { matchesSearch } from '@/lib/search';

import type { useFbaData } from './fba-data';
import { materialInputs, toSearchOptions, type MaterialLine } from './fba-materials';
import { MaterialLinesEditor } from './fba-materials-editor';

const NONE = '__none__';
/** The pick list renders at most this many rows; the search narrows it down. */
const MAX_SHOWN = 300;

/**
 * Add many FBA targets at once: search and tick finished SKUs, give each a quantity (or one for
 * all), and optionally share one price calculation and raw-material list across them. Each SKU
 * becomes its own target; edit any of them later to make it different.
 */
export function FbaBulkAddDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReturnType<typeof useFbaData>;
}) {
  const ids = { search: useId(), all: useId(), notes: useId() };
  const save = useSaveFbaTarget();

  const [search, setSearch] = useState('');
  /** Selected item keys → quantity text, in the order they were ticked. */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [qtyForAll, setQtyForAll] = useState('');
  const [calculationId, setCalculationId] = useState(NONE);
  const [lines, setLines] = useState<MaterialLine[]>([]);
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setPicked(new Map());
    setQtyForAll('');
    setCalculationId(NONE);
    setLines([]);
    setNotes('');
    setProgress(null);
  }, [open]);

  const taken = useMemo(
    () => new Set(data.targets.map((t) => itemKey(t.product_id, t.variant_id))),
    [data.targets],
  );
  const finished = useMemo(
    () => data.options.filter((o) => o.product.product_type === 'PRODUCT' && !taken.has(o.key)),
    [data.options, taken],
  );
  const searchable = useMemo(() => toSearchOptions(finished), [finished]);
  const materialOptions = useMemo(
    () => data.options.filter((o) => o.product.product_type === 'RAW_MATERIAL'),
    [data.options],
  );

  const matches = useMemo(
    () => searchable.filter((o) => matchesSearch(o, search)),
    [searchable, search],
  );
  const shown = matches.slice(0, MAX_SHOWN);
  const allShownPicked = shown.length > 0 && shown.every((o) => picked.has(o.value));
  const labelOf = (key: string) => data.optionByKey.get(key)?.label ?? key;
  const linked = calculationId !== NONE ? data.calculationById.get(calculationId) : undefined;
  const busy = save.isPending || progress !== null;

  const toggle = (key: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(key, next.get(key) ?? qtyForAll);
      else next.delete(key);
      return next;
    });

  const toggleShown = (on: boolean) =>
    setPicked((prev) => {
      const next = new Map(prev);
      for (const o of shown) {
        if (on) next.set(o.value, next.get(o.value) ?? qtyForAll);
        else next.delete(o.value);
      }
      return next;
    });

  const applyQtyToAll = () =>
    setPicked((prev) => new Map([...prev.keys()].map((k) => [k, qtyForAll])));

  const totalUnits = [...picked.values()].reduce((sum, q) => sum + (Number(q) || 0), 0);

  const handleSave = async () => {
    if (picked.size === 0) {
      toast.error('Tick at least one SKU');
      return;
    }
    for (const [key, qty] of picked) {
      const n = Number(qty);
      if (qty.trim() === '' || !Number.isInteger(n) || n < 0) {
        toast.error(`Set a whole-number target quantity for ${labelOf(key)}`);
        return;
      }
    }
    const materials = materialInputs(lines);
    if (typeof materials === 'string') {
      toast.error(materials);
      return;
    }

    const entries = [...picked.entries()];
    const failures: string[] = [];
    const failedKeys = new Set<string>();
    setProgress({ done: 0, total: entries.length });
    for (const [i, [key, qty]] of entries.entries()) {
      const { productId, variantId } = parseItemKey(key);
      try {
        await save.mutateAsync({
          target: {
            product_id: productId,
            variant_id: variantId,
            amazon_sku: '',
            fnsku: '',
            target_quantity: Number(qty),
            pricing_calculation_id: calculationId === NONE ? null : calculationId,
            notes,
          },
          materials,
        });
      } catch (error) {
        const message = (error as Error).message;
        failedKeys.add(key);
        failures.push(
          `${labelOf(key)}: ${message.includes('fba_targets_unique_item') ? 'already has a target' : message}`,
        );
      }
      setProgress({ done: i + 1, total: entries.length });
    }
    setProgress(null);

    const added = entries.length - failures.length;
    if (added > 0) toast.success(`Added ${added} FBA target${added === 1 ? '' : 's'}`);
    if (failures.length > 0) {
      toast.error(`${failures.length} could not be added`, { description: failures.join('\n') });
      // Keep only the failed ones ticked, so they can be fixed and retried.
      setPicked((prev) => new Map([...prev].filter(([k]) => failedKeys.has(k))));
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add multiple FBA targets</DialogTitle>
          <DialogDescription>
            Tick the finished SKUs to send to Amazon FBA and set how many of each. The price
            calculation and raw materials below apply to every SKU you add here — edit any target
            later to change it on its own.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id={ids.search}
                  placeholder="Search SKU, name, size, color, design…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={shown.length === 0}
                onClick={() => toggleShown(!allShownPicked)}
              >
                {allShownPicked ? 'Untick' : 'Tick'} {search ? 'matches' : 'all'} ({shown.length})
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {shown.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  {finished.length === 0
                    ? 'Every finished SKU already has an FBA target.'
                    : 'Nothing matches your search.'}
                </p>
              ) : (
                shown.map((o) => {
                  const checked = picked.has(o.value);
                  return (
                    <label
                      key={o.value}
                      className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggle(o.value, v === true)}
                      />
                      <span className="truncate">{o.label}</span>
                    </label>
                  );
                })
              )}
              {matches.length > MAX_SHOWN ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Showing {MAX_SHOWN} of {matches.length} — search to narrow down.
                </p>
              ) : null}
            </div>
            {taken.size > 0 ? (
              <p className="text-xs text-muted-foreground">
                {taken.size} SKU{taken.size === 1 ? ' already has a' : 's already have'} target and{' '}
                {taken.size === 1 ? "isn't" : "aren't"} listed.
              </p>
            ) : null}
          </section>

          {picked.size > 0 ? (
            <section className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="mr-auto">
                  <h3 className="text-sm font-medium">
                    {picked.size} selected <Badge variant="secondary">{totalUnits} units</Badge>
                  </h3>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={ids.all} className="text-xs text-muted-foreground">
                    Same quantity for all
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={ids.all}
                      type="number"
                      min="0"
                      step="1"
                      className="w-24"
                      placeholder="e.g. 50"
                      value={qtyForAll}
                      onChange={(e) => setQtyForAll(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={qtyForAll.trim() === ''}
                      onClick={applyQtyToAll}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
              <div className="divide-y rounded-lg border">
                {[...picked.entries()].map(([key, qty]) => (
                  <div key={key} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{labelOf(key)}</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Target quantity for ${labelOf(key)}`}
                      className="h-8 w-24"
                      placeholder="Qty"
                      value={qty}
                      onChange={(e) => setPicked((prev) => new Map(prev).set(key, e.target.value))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remove ${labelOf(key)}`}
                      onClick={() => toggle(key, false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-1.5">
            <Label>Price calculation for all (optional)</Label>
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
                {totalUnits > 0
                  ? ` · ${formatCurrency(linked.unitCost * totalUnits)} for all ${totalUnits} units`
                  : ''}
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <Label>Raw materials per finished unit, for all (optional)</Label>
            <MaterialLinesEditor
              lines={lines}
              onChange={setLines}
              materialOptions={materialOptions}
            />
          </section>

          <section className="space-y-1.5">
            <Label htmlFor={ids.notes}>Notes for all (optional)</Label>
            <Textarea
              id={ids.notes}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>
        </div>

        <DialogFooter className="items-center gap-3">
          {progress ? (
            <span className="text-sm text-muted-foreground">
              Adding {progress.done} / {progress.total}…
            </span>
          ) : null}
          <Button onClick={() => void handleSave()} disabled={busy || picked.size === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add {picked.size || ''} target{picked.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
