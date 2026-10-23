import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Combine, Loader2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/features/categories/queries';
import { useMergeProducts } from '@/features/products/mutations';
import { useAllVariants, useProducts, type Product } from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { compareSize } from '@/lib/variant-sort';

/**
 * "Merge another product into this one": pick the duplicate parent, see what changes, confirm.
 * The other product's variants (with their stock and order history) move here and it is deleted.
 */
export function MergeProductDialog({ keep }: { keep: Product }) {
  const [open, setOpen] = useState(false);
  const [mergeId, setMergeId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: categories } = useCategories();
  const merge = useMergeProducts();

  useEffect(() => {
    if (!open) return;
    setMergeId('');
    setConfirmed(false);
  }, [open]);
  useEffect(() => setConfirmed(false), [mergeId]);

  const variantCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of variants ?? []) map.set(v.product_id, (map.get(v.product_id) ?? 0) + 1);
    return map;
  }, [variants]);

  const candidates = (products ?? [])
    .filter((p) => p.id !== keep.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const other = candidates.find((p) => p.id === mergeId);
  const moving = (variants ?? [])
    .filter((v) => v.product_id === mergeId)
    .sort((a, b) => compareSize(a.size, b.size) || a.sku.localeCompare(b.sku));
  const categoryName = (id: string | null) =>
    (id && categories?.find((c) => c.id === id)?.name) || 'Uncategorized';

  const rows = other
    ? [
        { label: 'SKU', keep: keep.sku, other: other.sku, mono: true },
        {
          label: 'Category',
          keep: categoryName(keep.category_id),
          other: categoryName(other.category_id),
        },
        {
          label: 'GST rate',
          keep: `${Number(keep.tax_rate)}%`,
          other: `${Number(other.tax_rate)}%`,
        },
        {
          label: 'Cost price',
          keep: formatCurrency(keep.cost_price),
          other: formatCurrency(other.cost_price),
        },
        {
          label: 'Selling price',
          keep: formatCurrency(keep.selling_price),
          other: formatCurrency(other.selling_price),
        },
        { label: 'HSN/SAC', keep: keep.hsn_sac_code || '—', other: other.hsn_sac_code || '—' },
      ]
    : [];
  const gstDiffers = other && Number(other.tax_rate) !== Number(keep.tax_rate);

  const run = async () => {
    if (!other) return;
    try {
      const moved = await merge.mutateAsync({ keepId: keep.id, mergeId: other.id });
      toast.success(`Merged "${other.name}" into "${keep.name}"`, {
        description: `${moved} variant${moved === 1 ? '' : 's'} moved.`,
      });
      setOpen(false);
    } catch (error) {
      toast.error('Could not merge', { description: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !merge.isPending && setOpen(next)}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Combine className="h-4 w-4" />
        Merge another product
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge a product into “{keep.name}”</DialogTitle>
          <DialogDescription>
            For when the same design was created as two parent products. The other product&apos;s
            variants move here, together with their stock, orders, purchases, returns, barcodes and
            images. The other product is then deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product to merge in</Label>
            <Select value={mergeId} onValueChange={setMergeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose the duplicate product" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.sku} ({variantCount.get(p.id) ?? 0} variants)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {other ? (
            <>
              <div className="rounded-lg border">
                <div className="grid grid-cols-[7rem_1fr_auto_1fr] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium">
                  <span />
                  <span className="truncate">{other.name} (removed)</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{keep.name} (kept)</span>
                </div>
                {rows.map((r) => {
                  const differs = r.keep !== r.other;
                  return (
                    <div
                      key={r.label}
                      className="grid grid-cols-[7rem_1fr_auto_1fr] items-center gap-2 px-3 py-1.5 text-sm"
                    >
                      <span className="text-muted-foreground">{r.label}</span>
                      <span
                        className={cn(
                          r.mono && 'font-mono text-xs',
                          differs && 'line-through opacity-60',
                        )}
                      >
                        {r.other}
                      </span>
                      <span />
                      <span className={cn(r.mono && 'font-mono text-xs', differs && 'font-medium')}>
                        {r.keep}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="font-medium">
                  {moving.length} variant{moving.length === 1 ? '' : 's'} will move here
                </p>
                {moving.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {moving.slice(0, 24).map((v) => (
                      <Badge key={v.id} variant="outline" className="font-mono font-normal">
                        {v.sku}
                        {v.size || v.color
                          ? ` · ${[v.size, v.color].filter(Boolean).join(' ')}`
                          : ''}
                      </Badge>
                    ))}
                    {moving.length > 24 ? (
                      <Badge variant="secondary">+{moving.length - 24} more</Badge>
                    ) : null}
                  </div>
                ) : null}
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>
                    Variant SKUs, sizes, colors and designs stay as they are. Variants that used “
                    {other.name}”&apos;s price or HSN keep those values.
                  </li>
                  {gstDiffers ? (
                    <li className="text-amber-700 dark:text-amber-500">
                      GST becomes {Number(keep.tax_rate)}% for the moved variants (GST is set on the
                      parent product).
                    </li>
                  ) : null}
                  <li>
                    The parent SKU <span className="font-mono">{other.sku}</span> is removed and can
                    be reused. Its own barcodes and images are added to “{keep.name}”.
                  </li>
                  <li>This can&apos;t be undone.</li>
                </ul>
              </div>

              <div className="flex items-start gap-2 rounded-lg border p-3">
                <Checkbox
                  id="confirm-merge"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                />
                <Label htmlFor="confirm-merge" className="text-sm font-normal leading-snug">
                  Move {moving.length} variant{moving.length === 1 ? '' : 's'} into “{keep.name}”
                  and delete “{other.name}”.
                </Label>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => void run()}
            disabled={!other || !confirmed || merge.isPending}
          >
            {merge.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Merge products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
