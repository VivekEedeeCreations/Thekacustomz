import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { SALES_CHANNEL_LABELS, SALES_CHANNELS } from '@inventory/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateOrder } from '@/features/orders/mutations';
import type { Order } from '@/features/orders/queries';
import { CHANNEL_STYLES } from '@/lib/sales-channels';

const schema = z.object({
  sales_channel: z.enum(SALES_CHANNELS),
  external_order_id: z.string().max(120),
  order_date: z.string().min(1, 'Required'),
  customer_name: z.string().max(200),
  customer_phone: z.string().max(30),
  customer_email: z.string().email('Invalid email').or(z.literal('')),
  shipping_address: z.string().max(2000),
  notes: z.string().max(2000),
});
type FormValues = z.infer<typeof schema>;

/** Edits an order's channel, customer and delivery details (only offered while it is still New). */
export function EditOrderDetailsDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const updateOrder = useUpdateOrder();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sales_channel: order.sales_channel,
      external_order_id: order.external_order_id ?? '',
      order_date: order.order_date,
      customer_name: order.customer_name ?? '',
      customer_phone: order.customer_phone ?? '',
      customer_email: order.customer_email ?? '',
      shipping_address: order.shipping_address ?? '',
      notes: order.notes ?? '',
    },
  });
  const channel = form.watch('sales_channel');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        sales_channel: values.sales_channel,
        external_order_id: values.external_order_id.trim() || null,
        order_date: values.order_date,
        customer_name: values.customer_name.trim() || null,
        customer_phone: values.customer_phone.trim() || null,
        customer_email: values.customer_email.trim() || null,
        shipping_address: values.shipping_address.trim() || null,
        notes: values.notes.trim() || null,
      });
      toast.success('Order details updated');
      setOpen(false);
    } catch (error) {
      toast.error('Could not update order', { description: (error as Error).message });
    }
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Edit customer details"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit order details</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sales_channel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SALES_CHANNELS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {SALES_CHANNEL_LABELS[c]}
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
                  name="external_order_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{CHANNEL_STYLES[channel].idLabel}</FormLabel>
                      <FormControl>
                        <Input placeholder={CHANNEL_STYLES[channel].idHint} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                    <FormItem>
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
              <FormField
                control={form.control}
                name="shipping_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping address</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <DialogFooter>
                <Button type="submit" disabled={updateOrder.isPending}>
                  {updateOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
