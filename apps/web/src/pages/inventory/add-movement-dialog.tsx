import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_SIGN, MOVEMENT_TYPES } from '@inventory/shared';

import { Button } from '@/components/ui/button';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocations } from '@/features/locations/queries';
import { useCreateMovement } from '@/features/inventory/mutations';
import { useProducts, useProductVariants } from '@/features/products/queries';
import { useVendors } from '@/features/vendors/queries';
import { isVendorRelevant, isVendorRequired } from '@/lib/movement-vendor';

const NONE = '__none__';

const schema = z
  .object({
    movement_type: z.enum(MOVEMENT_TYPES),
    product_id: z.string().min(1, 'Required'),
    variant_id: z.string(),
    location_id: z.string().min(1, 'Required'),
    vendor_id: z.string(),
    direction: z.enum(['increase', 'decrease']),
    quantity: z.coerce.number().positive('Must be greater than 0'),
    unit_cost: z.coerce.number().min(0).optional(),
    occurred_at: z.string().min(1),
    notes: z.string().max(2000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (isVendorRequired(data.movement_type) && data.vendor_id === NONE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vendor_id'],
        message: 'Select the vendor this came from',
      });
    }
  });
type FormValues = z.infer<typeof schema>;

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddMovementDialog() {
  const [open, setOpen] = useState(false);
  const { data: products } = useProducts();
  const { data: locations } = useLocations();
  const { data: vendors } = useVendors();
  const createMovement = useCreateMovement();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      movement_type: 'INITIAL_STOCK',
      product_id: '',
      variant_id: NONE,
      location_id: '',
      vendor_id: NONE,
      direction: 'increase',
      quantity: undefined,
      unit_cost: undefined,
      occurred_at: todayInputValue(),
      notes: '',
    },
  });

  const productId = form.watch('product_id');
  const movementType = form.watch('movement_type');
  const { data: variants } = useProductVariants(productId || undefined);

  useEffect(() => {
    form.setValue('variant_id', NONE);
  }, [productId, form]);

  useEffect(() => {
    if (open) {
      const defaultLocation = locations?.find((l) => l.is_default)?.id;
      if (defaultLocation) form.setValue('location_id', defaultLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locations]);

  const sign = MOVEMENT_TYPE_SIGN[movementType];
  const showVendor = isVendorRelevant(movementType);
  const vendorRequired = isVendorRequired(movementType);

  const onSubmit = form.handleSubmit(async (values) => {
    const magnitude = Math.abs(values.quantity);
    const finalSign = sign ?? (values.direction === 'decrease' ? -1 : 1);
    try {
      await createMovement.mutateAsync({
        movement_type: values.movement_type,
        product_id: values.product_id,
        variant_id: values.variant_id === NONE ? null : values.variant_id,
        location_id: values.location_id,
        vendor_id: showVendor && values.vendor_id !== NONE ? values.vendor_id : null,
        quantity: magnitude * finalSign,
        unit_cost: values.unit_cost ?? null,
        occurred_at: new Date(values.occurred_at).toISOString(),
        notes: values.notes || null,
      });
      toast.success('Stock movement recorded');
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error('Could not record movement', { description: (error as Error).message });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add inventory
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a stock movement</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="movement_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Movement type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MOVEMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {MOVEMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {variants && variants.length > 0 ? (
              <FormField
                control={form.control}
                name="variant_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variant</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Product level (no variant)</SelectItem>
                        {variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.sku}
                            {v.size || v.color || v.design
                              ? ` — ${[v.size, v.color, v.design].filter(Boolean).join(' / ')}`
                              : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="location_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showVendor ? (
              <FormField
                control={form.control}
                name="vendor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor{vendorRequired ? '' : ' (optional)'}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Which vendor did this come from?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!vendorRequired ? (
                          <SelectItem value={NONE}>Not from a vendor</SelectItem>
                        ) : null}
                        {vendors?.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Recorded on this movement so you can trace stock back to its source.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sign === null ? (
                <FormField
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Direction</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="increase">Increase stock</SelectItem>
                          <SelectItem value="decrease">Decrease stock</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Quantity {sign !== null ? (sign > 0 ? '(+)' : '(–)') : ''}
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.001" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit cost (optional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="occurred_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormDescription>Recorded permanently on the inventory ledger.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createMovement.isPending}>
                {createMovement.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Record movement
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
