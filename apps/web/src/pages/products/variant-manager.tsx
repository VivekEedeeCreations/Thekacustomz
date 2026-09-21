import { useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Barcode as BarcodeIcon, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { RoleGate } from '@/components/auth/role-gate';
import { ActiveBadge } from '@/components/active-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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
  useDeleteVariant,
  useUpdateVariant,
} from '@/features/products/mutations';
import { useProduct, useProductVariants, type ProductVariant } from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';

import { BarcodeManager } from './barcode-manager';
import { InheritedValue } from './inherited-value';
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
    defaultValues: {
      sku: variant?.sku ?? '',
      name: variant?.name ?? '',
      size: variant?.size ?? '',
      color: variant?.color ?? '',
      design: variant?.design ?? '',
      cost_price: variant?.cost_price ?? undefined,
      selling_price: variant?.selling_price ?? undefined,
      hsn_sac_code: variant?.hsn_sac_code ?? '',
      is_active: variant?.is_active ?? true,
    },
  });

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
        form.reset({
          sku: '',
          name: '',
          size: '',
          color: '',
          design: '',
          hsn_sac_code: '',
          is_active: true,
        });
      }
      setOpen(false);
    } catch (error) {
      toast.error('Could not save variant', { description: (error as Error).message });
    }
  });

  const isSubmitting = createVariant.isPending || updateVariant.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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

export function VariantManager({ productId }: { productId: string }) {
  const { data: variants, isLoading } = useProductVariants(productId);
  const deleteVariant = useDeleteVariant(productId);
  const { data: product } = useProduct(productId);
  const [pendingDelete, setPendingDelete] = useState<ProductVariant | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const variantIds = (variants ?? []).map((v) => v.id);
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

  return (
    <div className="space-y-3">
      <VariantBulkBar selectedIds={selectedIds} onClear={() => setSelected(new Set())} />

      <div className="flex justify-end">
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
                <TableHead>SKU</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Design</TableHead>
                <TableHead>HSN/SAC</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((variant) => (
                <TableRow
                  key={variant.id}
                  data-state={selected.has(variant.id) ? 'selected' : undefined}
                >
                  <TableCell>
                    <RoleGate min="STAFF">
                      <Checkbox
                        aria-label={`Select variant ${variant.sku}`}
                        checked={selected.has(variant.id)}
                        onCheckedChange={(checked) => setSelection([variant.id], checked === true)}
                      />
                    </RoleGate>
                  </TableCell>
                  <TableCell className="font-medium">{variant.sku}</TableCell>
                  <TableCell>{variant.size || '—'}</TableCell>
                  <TableCell>{variant.color || '—'}</TableCell>
                  <TableCell>{variant.design || '—'}</TableCell>
                  <TableCell>
                    <InheritedValue
                      own={variant.hsn_sac_code}
                      inherited={product?.hsn_sac_code ?? null}
                    />
                  </TableCell>
                  <TableCell>
                    <InheritedValue
                      own={variant.cost_price != null ? formatCurrency(variant.cost_price) : null}
                      inherited={product ? formatCurrency(product.cost_price) : null}
                    />
                  </TableCell>
                  <TableCell>
                    <InheritedValue
                      own={
                        variant.selling_price != null ? formatCurrency(variant.selling_price) : null
                      }
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete variant?"
        description={`"${pendingDelete?.sku}" will be permanently removed. This is blocked if it has inventory history.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteVariant.mutateAsync(pendingDelete.id);
            toast.success('Variant deleted');
          } catch (error) {
            toast.error('Could not delete variant', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
