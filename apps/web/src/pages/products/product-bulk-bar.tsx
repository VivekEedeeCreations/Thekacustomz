import { useState } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBulkUpdateProducts, type BulkProductPatch } from '@/features/products/mutations';

const HSN_PATTERN = /^[0-9]{4,8}$/;
const KEEP = '__keep__';
const GST_RATES = ['0', '5', '12', '18', '28'];

function ProductBulkEditDialog({
  open,
  onOpenChange,
  productIds,
  variantCount,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: string[];
  /** How many variants the selected products have between them. */
  variantCount: number;
  onDone: () => void;
}) {
  const bulkUpdate = useBulkUpdateProducts();
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [hsn, setHsn] = useState('');
  const [clearHsn, setClearHsn] = useState(false);
  const [gst, setGst] = useState(KEEP);
  const [variantsFollow, setVariantsFollow] = useState(true);

  const close = (next: boolean) => {
    if (!next) {
      setCost('');
      setPrice('');
      setHsn('');
      setClearHsn(false);
      setGst(KEEP);
      setVariantsFollow(true);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    const patch: BulkProductPatch = {};
    for (const [text, key, label] of [
      [cost, 'cost_price', 'Cost price'],
      [price, 'selling_price', 'Selling price'],
    ] as const) {
      if (!text.trim()) continue;
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`${label} must be a number, 0 or more`);
        return;
      }
      patch[key] = n;
    }
    if (clearHsn) patch.hsn_sac_code = null;
    else if (hsn.trim()) {
      if (!HSN_PATTERN.test(hsn.trim())) {
        toast.error('HSN/SAC code must be 4 to 8 digits');
        return;
      }
      patch.hsn_sac_code = hsn.trim();
    }
    if (gst !== KEEP) patch.tax_rate = Number(gst);

    if (Object.keys(patch).length === 0) {
      toast.error('Nothing to change', { description: 'Fill in at least one field.' });
      return;
    }

    try {
      const { updated, requested } = await bulkUpdate.mutateAsync({
        ids: productIds,
        patch,
        variantsFollow,
      });
      if (updated < requested) {
        toast.warning(`Updated ${updated} of ${requested} products`, {
          description: "You don't have permission to edit the rest.",
        });
      } else {
        toast.success(`Updated ${updated} product${updated === 1 ? '' : 's'}`);
      }
      close(false);
      onDone();
    } catch (error) {
      toast.error('Bulk edit failed', { description: (error as Error).message });
    }
  };

  const followsSomething = Boolean(cost.trim() || price.trim() || hsn.trim() || clearHsn);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit {productIds.length} product{productIds.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            Only the fields you fill in are changed; blank fields stay as they are on each product.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-product-cost">Cost price</Label>
              <Input
                id="bulk-product-cost"
                type="number"
                step="0.01"
                min="0"
                placeholder="Leave unchanged"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-product-price">Selling price</Label>
              <Input
                id="bulk-product-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="Leave unchanged"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-product-hsn">HSN/SAC code</Label>
              <Input
                id="bulk-product-hsn"
                inputMode="numeric"
                maxLength={8}
                placeholder={clearHsn ? 'Will be cleared' : 'Leave unchanged'}
                disabled={clearHsn}
                value={clearHsn ? '' : hsn}
                onChange={(e) => setHsn(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bulk-product-hsn-clear"
                  checked={clearHsn}
                  onCheckedChange={(v) => setClearHsn(v === true)}
                />
                <Label
                  htmlFor="bulk-product-hsn-clear"
                  className="text-xs font-normal text-muted-foreground"
                >
                  Clear the HSN/SAC code
                </Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>GST rate</Label>
              <Select value={gst} onValueChange={setGst}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Leave unchanged</SelectItem>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                GST is set on the parent; variants always use it.
              </p>
            </div>
          </div>

          {variantCount > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border p-3">
              <Checkbox
                id="bulk-product-variants-follow"
                checked={variantsFollow}
                onCheckedChange={(v) => setVariantsFollow(v === true)}
              />
              <Label
                htmlFor="bulk-product-variants-follow"
                className="text-sm font-normal leading-snug"
              >
                Apply to their {variantCount} variant{variantCount === 1 ? '' : 's'} too
                <span className="block text-xs text-muted-foreground">
                  {variantsFollow
                    ? 'Variants with their own cost, price or HSN drop it for the fields you change, so they use the new value.'
                    : 'Variants that have their own cost, price or HSN keep it; the rest use the new value.'}
                </span>
              </Label>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={bulkUpdate.isPending || (!followsSomething && gst === KEEP)}
          >
            {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply to {productIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Action bar for selected parent products. Renders nothing when none are selected. */
export function ProductBulkBar({
  selectedIds,
  variantCount,
  onClear,
}: {
  selectedIds: string[];
  variantCount: number;
  onClear: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  if (selectedIds.length === 0) return null;

  return (
    <RoleGate min="STAFF">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <span className="text-sm font-medium">
          {selectedIds.length} product{selectedIds.length === 1 ? '' : 's'} selected
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit price / HSN / GST
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <ProductBulkEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        productIds={selectedIds}
        variantCount={variantCount}
        onDone={onClear}
      />
    </RoleGate>
  );
}
