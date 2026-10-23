import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Barcode as BarcodeIcon,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { RoleGate } from '@/components/auth/role-gate';
import { ActiveBadge } from '@/components/active-badge';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCreateVariant,
  useDeleteVariants,
  useUpdateVariant,
} from '@/features/products/mutations';
import {
  buildThumbnails,
  useAllProductImages,
  useProduct,
  useProductVariants,
  type ProductImage,
  type ProductVariant,
} from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';
import { compareSize, compareText, sortBy, type SortDirection } from '@/lib/variant-sort';

import { BarcodeManager } from './barcode-manager';
import { ImageManager } from './image-manager';
import { InheritedValue } from './inherited-value';
import { ItemThumbnail } from './item-thumbnail';
import { VariantBulkBar } from './variant-bulk-bar';

const schema = z.object({
  sku: z.string().min(1, 'Required').max(64),
  name: z.string().max(120).optional().or(z.literal('')),
  size: z.string().max(60).optional().or(z.literal('')),
  color: z.string().max(60).optional().or(z.literal('')),
  design: z.string().max(60).optional().or(z.literal('')),
  cost_price: z.coerce.number().min(0).optional(),
  selling_price: z.coerce.number().min(0).optional(),
  hsn_sac_code: z
    .string()
    .regex(/^[0-9]{4,8}$/, 'HSN/SAC must be 4 to 8 digits')
    .optional()
    .or(z.literal('')),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

/** Form values for a variant (or a blank one), read fresh each time the dialog opens. */
function formValuesFor(variant?: ProductVariant): FormValues {
  return {
    sku: variant?.sku ?? '',
    name: variant?.name ?? '',
    size: variant?.size ?? '',
    color: variant?.color ?? '',
    design: variant?.design ?? '',
    cost_price: variant?.cost_price ?? undefined,
    selling_price: variant?.selling_price ?? undefined,
    hsn_sac_code: variant?.hsn_sac_code ?? '',
    is_active: variant?.is_active ?? true,
  };
}

function VariantFormDialog({
  productId,
  variant,
  trigger,
}: {
  productId: string;
  variant?: ProductVariant;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const createVariant = useCreateVariant();
  const updateVariant = useUpdateVariant(productId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: formValuesFor(variant),
  });

  // The dialog stays mounted, so without this it would reopen showing whatever was typed last
  // time — even if that was never saved — instead of what the variant actually has now.
  const handleOpenChange = (next: boolean) => {
    if (next) form.reset(formValuesFor(variant));
    setOpen(next);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      sku: values.sku,
      name: values.name || null,
      size: values.size || null,
      color: values.color || null,
      design: values.design || null,
      cost_price: values.cost_price ?? null,
      selling_price: values.selling_price ?? null,
      hsn_sac_code: values.hsn_sac_code || null,
      is_active: values.is_active,
    };
    try {
      if (variant) {
        await updateVariant.mutateAsync({ id: variant.id, ...payload });
        toast.success('Variant updated');
      } else {
        await createVariant.mutateAsync({ ...payload, product_id: productId });
        toast.success('Variant created');
      }
      setOpen(false);
    } catch (error) {
      toast.error('Could not save variant', { description: (error as Error).message });
    }
  });

  const isSubmitting = createVariant.isPending || updateVariant.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{variant ? 'Edit variant' : 'New variant'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Large / Blue" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="design"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Design</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cost_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost price (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Uses product's"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling price (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Uses product's"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="hsn_sac_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HSN/SAC code (optional)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Uses product's"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="!m-0">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {variant ? 'Save changes' : 'Create variant'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function VariantBarcodesDialog({ variant }: { variant: ProductVariant }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Barcodes">
          <BarcodeIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Barcodes — {variant.sku}</DialogTitle>
        </DialogHeader>
        <BarcodeManager owner={{ variantId: variant.id }} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * A variant's own image set (separate from the parent product's), opened from its thumbnail.
 * Until the variant has a picture, the thumbnail shows the parent's, faded.
 */
function VariantImagesDialog({
  variant,
  image,
  fallback,
}: {
  variant: ProductVariant;
  image?: ProductImage;
  fallback?: ProductImage;
}) {
  const [open, setOpen] = useState(false);
  const detail = [variant.size, variant.color, variant.design].filter(Boolean).join(' / ');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Images of ${variant.sku}`}
          title={image ? 'Variant images' : 'No variant images yet (showing the product image)'}
        >
          <ItemThumbnail image={image} fallback={fallback} alt={variant.sku} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Images: {variant.sku}</DialogTitle>
          <DialogDescription>
            {detail ? `${detail}. ` : ''}These belong to this variant only. Without any, it shows
            the parent product&apos;s images.
          </DialogDescription>
        </DialogHeader>
        <ImageManager owner={{ variantId: variant.id }} />
      </DialogContent>
    </Dialog>
  );
}

type SortKey = 'size' | 'color';

/** Column header that cycles ascending → descending → unsorted (original order). */
function SortableHead({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: SortDirection } | null;
  onSort: (column: SortKey) => void;
}) {
  const active = sort?.key === column ? sort.direction : null;
  const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
      >
        {label}
        <Icon className={active ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5 opacity-40'} />
      </button>
    </TableHead>
  );
}

export function VariantManager({ productId }: { productId: string }) {
  const { data: variants, isLoading } = useProductVariants(productId);
  const deleteVariants = useDeleteVariants();
  const { data: product } = useProduct(productId);
  const { data: allImages } = useAllProductImages();
  const thumbnails = useMemo(() => buildThumbnails(allImages ?? []), [allImages]);
  const [pendingDelete, setPendingDelete] = useState<ProductVariant | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [groupByDesign, setGroupByDesign] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sortedVariants = useMemo(() => {
    const list = variants ?? [];
    if (!sort) return list;
    return sort.key === 'size'
      ? sortBy(list, (v) => v.size, compareSize, sort.direction)
      : sortBy(list, (v) => v.color, compareText, sort.direction);
  }, [variants, sort]);

  /**
   * Variants clubbed by design (case/space-insensitive), in name order with "No design" last.
   * Null when grouping is off or there's only one design — nothing to club.
   */
  const groups = useMemo(() => {
    if (!groupByDesign) return null;
    const map = new Map<string, { key: string; label: string; variants: ProductVariant[] }>();
    for (const v of sortedVariants) {
      const label = v.design?.trim().replace(/\s+/g, ' ') ?? '';
      const key = label.toLowerCase();
      const group = map.get(key);
      if (group) group.variants.push(v);
      else map.set(key, { key, label: label || 'No design', variants: [v] });
    }
    if (map.size < 2) return null;
    return [...map.values()]
      .sort((x, y) => (!x.key ? 1 : !y.key ? -1 : compareText(x.label, y.label)))
      .map((g) => ({
        ...g,
        // Distinct sizes in size order, as a quick summary on the group header.
        sizes: [...new Set(g.variants.map((v) => v.size?.trim()).filter(Boolean) as string[])]
          .sort(compareSize)
          .join(' · '),
      }));
  }, [sortedVariants, groupByDesign]);

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key !== key
        ? { key, direction: 'asc' }
        : prev.direction === 'asc'
          ? { key, direction: 'desc' }
          : null,
    );

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const variantIds = (variants ?? []).map((v) => v.id);
  const hasSeveralDesigns =
    new Set((variants ?? []).map((v) => v.design?.trim().toLowerCase() ?? '')).size > 1;
  const selectedIds = variantIds.filter((id) => selected.has(id));
  const allState =
    selectedIds.length === 0
      ? false
      : selectedIds.length === variantIds.length
        ? true
        : ('indeterminate' as const);

  const setSelection = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const renderRow = (variant: ProductVariant) => (
    <TableRow key={variant.id} data-state={selected.has(variant.id) ? 'selected' : undefined}>
      <TableCell>
        <RoleGate min="STAFF">
          <Checkbox
            aria-label={`Select variant ${variant.sku}`}
            checked={selected.has(variant.id)}
            onCheckedChange={(checked) => setSelection([variant.id], checked === true)}
          />
        </RoleGate>
      </TableCell>
      <TableCell>
        <VariantImagesDialog
          variant={variant}
          image={thumbnails.byVariant.get(variant.id)}
          fallback={thumbnails.byProduct.get(productId)}
        />
      </TableCell>
      <TableCell className="font-medium">{variant.sku}</TableCell>
      <TableCell>{variant.size || '—'}</TableCell>
      <TableCell>{variant.color || '—'}</TableCell>
      <TableCell>{variant.design || '—'}</TableCell>
      <TableCell>
        <InheritedValue own={variant.hsn_sac_code} inherited={product?.hsn_sac_code ?? null} />
      </TableCell>
      <TableCell>
        <InheritedValue
          own={variant.cost_price != null ? formatCurrency(variant.cost_price) : null}
          inherited={product ? formatCurrency(product.cost_price) : null}
        />
      </TableCell>
      <TableCell>
        <InheritedValue
          own={variant.selling_price != null ? formatCurrency(variant.selling_price) : null}
          inherited={product ? formatCurrency(product.selling_price) : null}
        />
      </TableCell>
      <TableCell>
        <ActiveBadge active={variant.is_active} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <VariantBarcodesDialog variant={variant} />
          <RoleGate min="STAFF">
            <VariantFormDialog
              productId={productId}
              variant={variant}
              trigger={
                <Button variant="ghost" size="icon" aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
              }
            />
          </RoleGate>
          <RoleGate min="ADMIN">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete"
              onClick={() => setPendingDelete(variant)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </RoleGate>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-3">
      <VariantBulkBar selectedIds={selectedIds} onClear={() => setSelected(new Set())} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {hasSeveralDesigns ? (
          <div className="mr-auto flex items-center gap-2">
            <Switch
              id="group-by-design"
              checked={groupByDesign}
              onCheckedChange={setGroupByDesign}
            />
            <label htmlFor="group-by-design" className="text-sm">
              Group by design
            </label>
          </div>
        ) : null}
        <RoleGate min="STAFF">
          <VariantFormDialog
            productId={productId}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New variant
              </Button>
            }
          />
        </RoleGate>
      </div>

      {!variants || variants.length === 0 ? (
        <EmptyState
          title="No variants"
          description="Add size, color, or design variations of this product."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <RoleGate min="STAFF">
                    <Checkbox
                      aria-label="Select all variants"
                      checked={allState}
                      onCheckedChange={(checked) => setSelection(variantIds, checked === true)}
                    />
                  </RoleGate>
                </TableHead>
                <TableHead className="w-14">Image</TableHead>
                <TableHead>SKU</TableHead>
                <SortableHead label="Size" column="size" sort={sort} onSort={toggleSort} />
                <SortableHead label="Color" column="color" sort={sort} onSort={toggleSort} />
                <TableHead>Design</TableHead>
                <TableHead>HSN/SAC</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups
                ? groups.map((group) => {
                    const ids = group.variants.map((v) => v.id);
                    const count = ids.filter((id) => selected.has(id)).length;
                    const isCollapsed = collapsed.has(group.key);
                    return (
                      <Fragment key={group.key || '__none__'}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell>
                            <RoleGate min="STAFF">
                              <Checkbox
                                aria-label={`Select all ${group.label} variants`}
                                checked={
                                  count === 0
                                    ? false
                                    : count === ids.length
                                      ? true
                                      : 'indeterminate'
                                }
                                onCheckedChange={(checked) => setSelection(ids, checked === true)}
                              />
                            </RoleGate>
                          </TableCell>
                          <TableCell colSpan={10} className="py-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 font-medium"
                              aria-expanded={!isCollapsed}
                              onClick={() => toggleCollapsed(group.key)}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              <span className={group.key ? '' : 'italic text-muted-foreground'}>
                                {group.label}
                              </span>
                              <Badge variant="secondary">{group.variants.length}</Badge>
                            </button>
                            {group.sizes ? (
                              <span className="ml-3 text-xs text-muted-foreground">
                                {group.sizes}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        {isCollapsed ? null : group.variants.map(renderRow)}
                      </Fragment>
                    );
                  })
                : sortedVariants.map(renderRow)}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete variant?"
        description={`"${pendingDelete?.sku}" and its barcodes and images will be permanently removed. This is blocked if it has stock history or orders.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteVariants.mutateAsync([pendingDelete.id]);
            toast.success('Variant deleted');
          } catch (error) {
            toast.error('Could not delete variant', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
