import { useEffect, useId, useState } from 'react';
import { Calculator, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleGate } from '@/components/auth/role-gate';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreatePricingCalculation,
  useDeletePricingCalculation,
  useUpdatePricingCalculation,
} from '@/features/pricing-calculations/mutations';
import {
  usePricingCalculations,
  type PricingCalculation,
} from '@/features/pricing-calculations/queries';
import { formatCurrency, formatDateTime } from '@/lib/format';

import { stateFromJson, toJson, type CalculatorState } from './calculator-state';

export function SaveCalculationDialog({
  open,
  onOpenChange,
  state,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: CalculatorState;
  /** The saved calculation currently loaded, if any — offers "update" alongside "save as new". */
  current: PricingCalculation | null;
  onSaved: (saved: PricingCalculation) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreatePricingCalculation();
  const update = useUpdatePricingCalculation();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setTitle(current?.title ?? '');
    setDescription(current?.description ?? '');
  }, [open, current]);

  const save = async (asNew: boolean) => {
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      inputs: toJson(state),
    };
    try {
      const saved =
        !asNew && current
          ? await update.mutateAsync({ id: current.id, ...payload })
          : await create.mutateAsync(payload);
      toast.success(!asNew && current ? 'Calculation updated' : 'Calculation saved');
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not save calculation', { description: (error as Error).message });
    }
  };

  const canSave = title.trim().length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save calculation</DialogTitle>
          <DialogDescription>
            Saves the costs, GST rate, selling price and target so you can load them again later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) void save(!current);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>Title</Label>
            <Input
              id={titleId}
              maxLength={120}
              placeholder="e.g. 11oz white mug — Amazon"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              id={descriptionId}
              rows={3}
              placeholder="Optional notes — supplier, assumptions, where this price is used"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            {current ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSave}
                  onClick={() => void save(true)}
                >
                  Save as new
                </Button>
                <Button type="submit" disabled={!canSave}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Update
                </Button>
              </>
            ) : (
              <Button type="submit" disabled={!canSave}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SavedCalculationsList({
  currentId,
  onLoad,
  onDeleted,
}: {
  currentId: string | null;
  onLoad: (calculation: PricingCalculation) => void;
  onDeleted: (id: string) => void;
}) {
  const { data: calculations, isLoading } = usePricingCalculations();
  const deleteCalculation = useDeletePricingCalculation();
  const [pendingDelete, setPendingDelete] = useState<PricingCalculation | null>(null);

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium">Saved calculations</h3>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !calculations || calculations.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calculator className="h-4 w-4" />
          Nothing saved yet. Use “Save” above to keep a calculation.
        </div>
      ) : (
        <ul className="divide-y">
          {calculations.map((calc) => {
            const state = stateFromJson(calc.inputs);
            const rawCost = Number(state.rawCost) || 0;
            const sellingPrice = Number(state.sellingPrice) || 0;
            return (
              <li
                key={calc.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{calc.title}</span>
                    {calc.id === currentId ? (
                      <span className="text-xs text-primary">(loaded)</span>
                    ) : null}
                  </div>
                  {calc.description ? (
                    <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                      {calc.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Raw cost {formatCurrency(rawCost)}
                    {sellingPrice > 0 ? ` · Selling price ${formatCurrency(sellingPrice)}` : ''}
                    {' · '}Updated {formatDateTime(calc.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" onClick={() => onLoad(calc)}>
                    <FolderOpen className="h-4 w-4" />
                    Load
                  </Button>
                  <RoleGate min="STAFF">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${calc.title}`}
                      onClick={() => setPendingDelete(calc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </RoleGate>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete saved calculation?"
        description={`"${pendingDelete?.title}" will be removed for everyone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteCalculation.mutateAsync(pendingDelete.id);
            onDeleted(pendingDelete.id);
            toast.success('Calculation deleted');
          } catch (error) {
            toast.error('Could not delete calculation', {
              description: (error as Error).message,
            });
          }
        }}
      />
    </div>
  );
}
