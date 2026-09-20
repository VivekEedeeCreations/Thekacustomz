import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { OrderPicker } from '@/components/order-picker';
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
import { useLocations } from '@/features/locations/queries';
import { useOrderItems, type Order } from '@/features/orders/queries';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { useCreateReturn } from '@/features/returns/mutations';
import { useReturnItems, useReturns } from '@/features/returns/queries';
import { formatQuantity } from '@/lib/format';

const REASONS = [
  'Wrong size / item received',
  'Damaged or defective',
  'Not as described',
  'Customer changed their mind',
  'Delivered late',
  'Other',
];
const NONE = '__none__';

/** Records a customer return against an order that has already gone out. */
export function NewReturnDialog({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState(REASONS[0] ?? '');
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState(NONE);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const createReturn = useCreateReturn();

  const { data: items } = useOrderItems(orderId || undefined);
  const { data: returns } = useReturns();
  const { data: returnItems } = useReturnItems();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: locations } = useLocations();

  const eligible = useMemo(() => orders.filter((o) => o.dispatched_at !== null), [orders]);
  const order = orders.find((o) => o.id === orderId);

  const alreadyReturned = useMemo(() => {
    const active = new Set((returns ?? []).filter((r) => r.status !== 'REJECTED').map((r) => r.id));
    const map = new Map<string, number>();
    for (const ri of returnItems ?? []) {
      if (active.has(ri.return_id)) {
        map.set(ri.order_item_id, (map.get(ri.order_item_id) ?? 0) + ri.quantity);
      }
    }
    return map;
  }, [returns, returnItems]);

  const label = (productId: string, variantId: string | null) => {
    const name = products?.find((p) => p.id === productId)?.name ?? 'Product';
    const sku = variantId ? variants?.find((v) => v.id === variantId)?.sku : undefined;
    return sku ? `${name} (${sku})` : name;
  };

  const reset = () => {
    setOrderId('');
    setReason(REASONS[0] ?? '');
    setNotes('');
    setLocationId(NONE);
    setPicked({});
  };

  const chooseOrder = (id: string) => {
    setOrderId(id);
    setPicked({});
    setLocationId(orders.find((o) => o.id === id)?.location_id ?? NONE);
  };

  const chosen = Object.entries(picked).filter(([, qty]) => qty > 0);

  const submit = async () => {
    if (!orderId || chosen.length === 0) {
      toast.error('Pick an order and at least one item to return');
      return;
    }
    try {
      await createReturn.mutateAsync({
        header: {
          order_id: orderId,
          reason,
          location_id: locationId === NONE ? undefined : locationId,
          notes: notes.trim() || undefined,
        },
        items: chosen.map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
      });
      toast.success('Return recorded');
      reset();
      setOpen(false);
    } catch (e) {
      toast.error('Could not record the return', { description: (e as Error).message });
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New return
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New return</DialogTitle>
            <DialogDescription>
              Only orders that have been dispatched can be returned. Stock goes back when you mark
              the return received.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Order</Label>
              <OrderPicker orders={eligible} value={orderId} onChange={chooseOrder} />
            </div>

            {order ? (
              <>
                <div className="space-y-1.5">
                  <Label>Items being returned</Label>
                  <ul className="divide-y rounded-md border">
                    {(items ?? []).map((item) => {
                      const remaining = item.quantity - (alreadyReturned.get(item.id) ?? 0);
                      const qty = picked[item.id] ?? 0;
                      return (
                        <li key={item.id} className="flex items-center gap-3 p-2 text-sm">
                          <Checkbox
                            aria-label={`Return ${label(item.product_id, item.variant_id)}`}
                            disabled={remaining <= 0}
                            checked={qty > 0}
                            onCheckedChange={(checked) =>
                              setPicked((prev) => ({ ...prev, [item.id]: checked ? remaining : 0 }))
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {label(item.product_id, item.variant_id)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {remaining > 0
                                ? `${formatQuantity(remaining)} of ${formatQuantity(item.quantity)} returnable`
                                : 'Already fully returned'}
                            </span>
                          </span>
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            step="1"
                            className="h-8 w-20"
                            disabled={remaining <= 0}
                            value={qty || ''}
                            placeholder="0"
                            onChange={(e) =>
                              setPicked((prev) => ({
                                ...prev,
                                [item.id]: Math.min(remaining, Math.max(0, Number(e.target.value))),
                              }))
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Reason</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Return stock to</Label>
                    <Select value={locationId} onValueChange={setLocationId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Order&apos;s ship-from location</SelectItem>
                        {locations?.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              onClick={submit}
              disabled={createReturn.isPending || !order || chosen.length === 0}
            >
              {createReturn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
