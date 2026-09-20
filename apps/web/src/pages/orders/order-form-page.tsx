import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { SALES_CHANNEL_LABELS, SALES_CHANNELS } from '@inventory/shared';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useCreateOrder } from '@/features/orders/mutations';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';
import { CHANNEL_STYLES } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

const NONE = '__none__';

const itemSchema = z.object({
  product_id: z.string().min(1, 'Select a product'),
  variant_id: z.string(),
  quantity: z.coerce.number().positive('Must be more than 0'),
  unit_price: z.coerce.number().min(0, 'Cannot be negative'),
  tax_rate: z.coerce.number().min(0).max(100),
});

const schema = z.object({
  sales_channel: z.enum(SALES_CHANNELS),
  external_order_id: z.string().max(120),
  order_date: z.string().min(1, 'Required'),
  customer_name: z.string().max(200),
  customer_phone: z.string().max(30),
  customer_email: z.string().email('Invalid email').or(z.literal('')),
  shipping_address: z.string().max(2000),
  location_id: z.string(),
  courier_name: z.string().max(100),
  awb_number: z.string().max(100),
  discount_amount: z.coerce.number().min(0),
  shipping_amount: z.coerce.number().min(0),
  notes: z.string().max(2000),
  items: z.array(itemSchema).min(1, 'Add at least one item'),
});
type FormValues = z.infer<typeof schema>;

const EMPTY_ITEM: FormValues['items'][number] = {
  product_id: '',
  variant_id: NONE,
  quantity: 1,
  unit_price: 0,
  tax_rate: 0,
};

const today = () => new Date().toISOString().slice(0, 10);

export function OrderFormPage() {
  const navigate = useNavigate();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: locations } = useLocations();
  const createOrder = useCreateOrder();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sales_channel: 'AMAZON',
      external_order_id: '',
      order_date: today(),
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      shipping_address: '',
      location_id: NONE,
      courier_name: '',
      awb_number: '',
      discount_amount: 0,
      shipping_amount: 0,
      notes: '',
      items: [EMPTY_ITEM],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  const channel = form.watch('sales_channel');
  const items = form.watch('items');
  const discount = Number(form.watch('discount_amount')) || 0;
  const shipping = Number(form.watch('shipping_amount')) || 0;

  useEffect(() => {
    const defaultLocation = locations?.find((l) => l.is_default)?.id;
    if (defaultLocation && form.getValues('location_id') === NONE) {
      form.setValue('location_id', defaultLocation);
    }
  }, [locations, form]);

  const productById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  // Not memoised on purpose: react-hook-form returns the same `items` array object as
  // nested fields change, so a memo keyed on it would go stale. It's a trivial sum.
  let subtotal = 0;
  let tax = 0;
  for (const item of items) {
    const line = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    subtotal += line;
    tax += (line * (Number(item.tax_rate) || 0)) / 100;
  }
  const totals = { subtotal, tax, total: Math.max(0, subtotal - discount + tax + shipping) };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const id = await createOrder.mutateAsync({
        header: {
          sales_channel: values.sales_channel,
          external_order_id: values.external_order_id.trim(),
          customer_name: values.customer_name.trim(),
          customer_phone: values.customer_phone.trim(),
          customer_email: values.customer_email.trim(),
          shipping_address: values.shipping_address.trim(),
          location_id: values.location_id === NONE ? '' : values.location_id,
          order_date: values.order_date,
          courier_name: values.courier_name.trim(),
          awb_number: values.awb_number.trim(),
          discount_amount: values.discount_amount,
          shipping_amount: values.shipping_amount,
          notes: values.notes.trim(),
        },
        items: values.items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id === NONE ? null : item.variant_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
        })),
      });
      toast.success('Order created');
      navigate(`/orders/${id}`);
    } catch (error) {
      toast.error('Could not create order', { description: (error as Error).message });
    }
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/orders">
          <ArrowLeft className="h-4 w-4" />
          Orders
        </Link>
      </Button>
      <PageHeader
        title="New order"
        description="Log an order from any channel. Link its AWB now, or when the label is printed."
      />

      <Form {...form}>
        <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales channel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="sales_channel"
                  render={({ field }) => (
                    <FormItem>
                      <div
                        className="flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-label="Sales channel"
                      >
                        {SALES_CHANNELS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={field.value === c}
                            onClick={() => field.onChange(c)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-sm font-medium transition-all',
                              field.value === c
                                ? cn(CHANNEL_STYLES[c].badge, 'ring-2 ring-ring ring-offset-1')
                                : 'text-muted-foreground hover:bg-accent',
                            )}
                          >
                            {SALES_CHANNEL_LABELS[c]}
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="external_order_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{CHANNEL_STYLES[channel].idLabel}</FormLabel>
                        <FormControl>
                          <Input placeholder={CHANNEL_STYLES[channel].idHint} {...field} />
                        </FormControl>
                        <FormDescription>
                          Found on the channel&apos;s order screen. Also searchable from the
                          Dispatch scanner.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="order_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer &amp; delivery</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="customer_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customer_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input inputMode="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customer_email"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shipping_address"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Shipping address</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fulfilment</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="location_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ship from</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Not set yet</SelectItem>
                          {locations?.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name} ({l.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Stock leaves this location on dispatch.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="courier_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Courier</FormLabel>
                      <FormControl>
                        <Input placeholder="Delhivery, BlueDart…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="awb_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>AWB number</FormLabel>
                      <FormControl>
                        <Input className="font-mono" placeholder="Scan or type" {...field} />
                      </FormControl>
                      <FormDescription>Needed before it can be dispatched.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Items</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(EMPTY_ITEM)}
                >
                  <Plus className="h-4 w-4" />
                  Add item
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {fields.map((row, index) => {
                  const productId = items[index]?.product_id;
                  const rowVariants = (variants ?? []).filter((v) => v.product_id === productId);
                  const lineTotal =
                    (Number(items[index]?.quantity) || 0) * (Number(items[index]?.unit_price) || 0);

                  return (
                    <div key={row.id} className="rounded-lg border p-3">
                      <div className="grid gap-3 sm:grid-cols-12">
                        <FormField
                          control={form.control}
                          name={`items.${index}.product_id`}
                          render={({ field }) => (
                            <FormItem
                              className={rowVariants.length > 0 ? 'sm:col-span-5' : 'sm:col-span-8'}
                            >
                              <FormLabel>Product</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={(id) => {
                                  field.onChange(id);
                                  const product = productById.get(id);
                                  form.setValue(`items.${index}.variant_id`, NONE);
                                  form.setValue(
                                    `items.${index}.unit_price`,
                                    product?.selling_price ?? 0,
                                  );
                                  form.setValue(`items.${index}.tax_rate`, product?.tax_rate ?? 0);
                                }}
                              >
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

                        {rowVariants.length > 0 ? (
                          <FormField
                            control={form.control}
                            name={`items.${index}.variant_id`}
                            render={({ field }) => (
                              <FormItem className="sm:col-span-3">
                                <FormLabel>Variant</FormLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={(id) => {
                                    field.onChange(id);
                                    const variant = rowVariants.find((v) => v.id === id);
                                    const product = productById.get(productId ?? '');
                                    form.setValue(
                                      `items.${index}.unit_price`,
                                      variant?.selling_price ?? product?.selling_price ?? 0,
                                    );
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value={NONE}>Base product</SelectItem>
                                    {rowVariants.map((v) => (
                                      <SelectItem key={v.id} value={v.id}>
                                        {v.sku}
                                        {v.size || v.color || v.design
                                          ? ` — ${[v.size, v.color, v.design].filter(Boolean).join(' / ')}`
                                          : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        ) : null}

                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Qty</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" step="1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.unit_price`}
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Price</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" step="0.01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                        <span>Line total {formatCurrency(lineTotal)} (before tax)</span>
                        {fields.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {form.formState.errors.items?.root?.message ? (
                  <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.items.root.message}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(totals.tax)}</span>
                </div>
                <FormField
                  control={form.control}
                  name="discount_amount"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-3 space-y-0">
                      <FormLabel className="font-normal text-muted-foreground">Discount</FormLabel>
                      <FormControl>
                        <Input
                          className="h-8 w-28 text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shipping_amount"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-3 space-y-0">
                      <FormLabel className="font-normal text-muted-foreground">Shipping</FormLabel>
                      <FormControl>
                        <Input
                          className="h-8 w-28 text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
                <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                  {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Create order
                </Button>
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>
    </div>
  );
}
