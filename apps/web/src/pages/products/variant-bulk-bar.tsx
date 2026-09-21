import { useMemo, useState, type ComponentProps } from 'react';
import { Barcode as BarcodeIcon, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { RoleGate } from '@/components/auth/role-gate';
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
  useBulkGenerateVariantBarcodes,
  useBulkUpdateVariants,
  type BulkVariantPatch,
} from '@/features/products/mutations';
import { useAllBarcodes } from '@/features/products/queries';

const HSN_PATTERN = /^[0-9]{4,8}$/;

/** One field of the bulk-edit dialog: blank = leave alone, ticked = reset to the product's. */
interface FieldState {
  value: string;
  reset: boolean;
}
const EMPTY_FIELD: FieldState = { value: '', reset: false };

function BulkField({
  id,
  label,
  field,
  onChange,
  ...inputProps
}: {
  id: string;
  label: string;
  field: FieldState;
  onChange: (next: FieldState) => void;
} & Pick<ComponentProps<typeof Input>, 'type' | 'step' | 'min' | 'inputMode' | 'maxLength'>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        {...inputProps}
        placeholder={field.reset ? "Will use the product's" : 'Leave unchanged'}
        value={field.reset ? '' : field.value}
        disabled={field.reset}
        onChange={(e) => onChange({ ...field, value: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-reset`}
          checked={field.reset}
          onCheckedChange={(checked) => onChange({ value: '', reset: checked === true })}
        />
        <Label htmlFor={`${id}-reset`} className="text-xs font-normal text-muted-foreground">
          Use the product&apos;s value
        </Label>
      </div>
    </div>
  );
}

function BulkEditDialog({
  open,
  onOpenChange,
  variantIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variantIds: string[];
  onDone: () => void;
}) {
  const bulkUpdate = useBulkUpdateVariants();
  const [cost, setCost] = useState<FieldState>(EMPTY_FIELD);
  const [price, setPrice] = useState<FieldState>(EMPTY_FIELD);
  const [hsn, setHsn] = useState<FieldState>(EMPTY_FIELD);

  const close = (next: boolean) => {
    if (!next) {
      setCost(EMPTY_FIELD);
      setPrice(EMPTY_FIELD);
      setHsn(EMPTY_FIELD);
    }
    onOpenChange(next);
  };

  /** Turns a field into a patch value, or reports why it is invalid. */
  const readMoney = (field: FieldState, label: string): number | null | undefined | Error => {
    if (field.reset) return null;
    const text = field.value.trim();
    if (!text) return undefined;
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) return new Error(`${label} must be a number, 0 or more`);
    return n;
  };

  const submit = async () => {
    const costValue = readMoney(cost, 'Cost price');
    const priceValue = readMoney(price, 'Selling price');
    const problem = [costValue, priceValue].find((v): v is Error => v instanceof Error);
    if (problem) {
      toast.error(problem.message);
      return;
    }

    const hsnText = hsn.value.trim();
    if (!hsn.reset && hsnText && !HSN_PATTERN.test(hsnText)) {
      toast.error('HSN/SAC code must be 4 to 8 digits');
      return;
    }

    const patch: BulkVariantPatch = {};
    if (costValue !== undefined && !(costValue instanceof Error)) patch.cost_price = costValue;
    if (priceValue !== undefined && !(priceValue instanceof Error))
      patch.selling_price = priceValue;
    if (hsn.reset) patch.hsn_sac_code = null;
    else if (hsnText) patch.hsn_sac_code = hsnText;

    if (Object.keys(patch).length === 0) {
      toast.error('Nothing to change', { description: 'Fill in at least one field.' });
      return;
    }

    try {
      const { updated, requested } = await bulkUpdate.mutateAsync({ ids: variantIds, patch });
      if (updated < requested) {
        toast.warning(`Updated ${updated} of ${requested} variants`, {
          description: "You don't have permission to edit the rest.",
        });
      } else {
        toast.success(`Updated ${updated} variant${updated === 1 ? '' : 's'}`);
      }
      close(false);
      onDone();
    } catch (error) {
      toast.error('Bulk edit failed', { description: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit {variantIds.length} variant{variantIds.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            Only the fields you fill in are changed. Tick &quot;Use the product&apos;s value&quot;
            to clear a variant&apos;s own value so it follows the parent product again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <BulkField
              id="bulk-cost"
              label="Cost price"
              type="number"
              step="0.01"
              min="0"
              field={cost}
              onChange={setCost}
            />
            <BulkField
              id="bulk-price"
              label="Selling price"
              type="number"
              step="0.01"
              min="0"
              field={price}
              onChange={setPrice}
            />
          </div>
          <BulkField
            id="bulk-hsn"
            label="HSN/SAC code"
            inputMode="numeric"
            maxLength={8}
            field={hsn}
            onChange={setHsn}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={bulkUpdate.isPending}>
            {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply to {variantIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Action bar for a selection of variants (from any product): generate EAN-13 barcodes for the
 * ones that have none, or bulk-edit prices and HSN. Renders nothing when nothing is selected.
 */
export function VariantBulkBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const { data: allBarcodes } = useAllBarcodes();
  const generate = useBulkGenerateVariantBarcodes();
  const [editOpen, setEditOpen] = useState(false);

  const withoutBarcode = useMemo(() => {
    const have = new Set((allBarcodes ?? []).map((b) => b.variant_id).filter(Boolean));
    return selectedIds.filter((id) => !have.has(id));
  }, [allBarcodes, selectedIds]);

  if (selectedIds.length === 0) return null;

  const skipped = selectedIds.length - withoutBarcode.length;

  const handleGenerate = async () => {
    if (withoutBarcode.length === 0) {
      toast.info('Nothing to generate', {
        description: 'Every selected variant already has a barcode.',
      });
      return;
    }
    try {
      const { generated, failed } = await generate.mutateAsync(withoutBarcode);
      const skippedNote = skipped > 0 ? ` ${skipped} already had one.` : '';
      if (failed.length === 0) {
        toast.success(`Generated ${generated} barcode${generated === 1 ? '' : 's'}`, {
          description: skippedNote.trim() || undefined,
        });
        onClear();
      } else {
        toast.error(`Generated ${generated}, ${failed.length} failed`, {
          description: failed[0]?.message,
        });
      }
    } catch (error) {
      toast.error('Could not generate barcodes', { description: (error as Error).message });
    }
  };

  return (
    <RoleGate min="STAFF">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <span className="text-sm font-medium">{selectedIds.length} selected</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerate}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BarcodeIcon className="h-4 w-4" />
            )}
            Generate barcodes
            {withoutBarcode.length !== selectedIds.length ? ` (${withoutBarcode.length})` : ''}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit price / HSN
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <BulkEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        variantIds={selectedIds}
        onDone={onClear}
      />
    </RoleGate>
  );
}
