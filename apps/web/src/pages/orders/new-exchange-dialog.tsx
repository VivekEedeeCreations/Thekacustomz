import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { OrderPicker } from '@/components/order-picker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateExchange } from '@/features/exchanges/mutations';
import { useLocations } from '@/features/locations/queries';
import { useOrderItems, type Order } from '@/features/orders/queries';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { formatCurrency, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

const REASONS = [
  'Size exchange',
  'Colour / design exchange',
  'Defective — replacement',
  'Wrong item sent',
  'Other',
];
const NONE = '__none__';

/** Issues an exchange against an original order: one item comes back, another goes out. */
export function NewExchangeDialog({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [itemId, setItemId] = useState('');
  const [returnedQty, setReturnedQty] = useState('1');
  const [newProductId, setNewProductId] = useState('');
  const [newVariantId, setNewVariantId] = useState(NONE);
  const [newQty, setNewQty] = useState('1');
  const [priceDiff, setPriceDiff] = useState<string | null>(null);
  const [reason, setReason] = useState(REASONS[0] ?? '');
  const [locationId, setLocationId] = useState(NONE);
  const [notes, setNotes] = useState('');
  const createExchange = useCreateExchange();

  const { data: items } = useOrderItems(orderId || undefined);
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: locations } = useLocations();

  const eligible = useMemo(() => orders.filter((o) => o.dispatched_at !== null), [orders]);
  const order = orders.find((o) => o.id === orderId);
  const item = items?.find((i) => i.id === itemId);
  const newProduct = products?.find((p) => p.id === newProductId);
  const newVariants = (variants ?? []).filter((v) => v.product_id === newProductId);
  const newVariant = newVariants.find((v) => v.id === newVariantId);

  const label = (productId: string, variantId: string | null) => {
    const name = products?.find((p) => p.id === productId)?.name ?? 'Product';
    const sku = variantId ? variants?.find((v) => v.id === variantId)?.sku : undefined;
    return sku ? `${name} (${sku})` : name;
  };

  // What the customer pays (or is owed) for the swap: new goods minus the returned goods.
  const suggestedDiff = useMemo(() => {
    if (!item || !newProduct) return 0;
    const newPrice = newVariant?.selling_price ?? newProduct.selling_price;
    const diff = newPrice * (Number(newQty) || 0) - item.unit_price * (Number(returnedQty) || 0);
    return Math.round(diff * 100) / 100;
  }, [item, newProduct, newVariant, newQty, returnedQty]);
  const diffValue = priceDiff ?? String(suggestedDiff);

  const reset = () => {
    setOrderId('');
    setItemId('');
    setReturnedQty('1');
    setNewProductId('');
    setNewVariantId(NONE);
    setNewQty('1');
    setPriceDiff(null);
    setReason(REASONS[0] ?? '');
    setLocationId(NONE);
    setNotes('');
  };

  const chooseOrder = (id: string) => {
    setOrderId(id);
    setItemId('');
    setLocationId(orders.find((o) => o.id === id)?.location_id ?? NONE);
  };

  const valid =
    !!order && !!item && !!newProductId && Number(returnedQty) > 0 && Number(newQty) > 0;

  const submit = async () => {
    if (!valid || !item) return;
    try {
      await createExchange.mutateAsync({
        header: {
          original_order_id: orderId,
          reason,
          location_id: locationId === NONE ? undefined : locationId,
          notes: notes.trim() || undefined,
        },
        items: [
          {
            original_order_item_id: item.id,
            returned_quantity: Number(returnedQty),
            new_product_id: newProductId,
            new_variant_id: newVariantId === NONE ? null : newVariantId,
            new_quantity: Number(newQty),
            price_difference: Number(diffValue) || 0,
          },
        ],
      });
      toast.success('Exchange recorded');
      reset();
      setOpen(false);
    } catch (e) {
      toast.error('Could not record the exchange', { description: (e as Error).message });
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New exchange
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
            <DialogTitle>New exchange</DialogTitle>
            <DialogDescription>
              Pick the original order, what comes back, and what goes out instead. Stock moves when
              the exchange is completed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Original order</Label>
              <OrderPicker orders={eligible} value={orderId} onChange={chooseOrder} />
            </div>

            {order ? (
              <>
                <div className="space-y-1.5">
                  <Label>Item coming back</Label>
                  <ul className="divide-y rounded-md border">
                    {(items ?? []).map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setItemId(i.id);
                            setReturnedQty(String(Math.min(Number(returnedQty) || 1, i.quantity)));
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-accent',
                            itemId === i.id && 'bg-accent',
                          )}
                        >
                          <span className="truncate">{label(i.product_id, i.variant_id)}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatQuantity(i.quantity)} × {formatCurrency(i.unit_price)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {item ? (
                  <div className="grid gap-4 sm:grid-cols-[6rem_minmax(0,1fr)_6rem]">
                    <div className="space-y-1.5">
                      <Label>Return qty</Label>
                      <Input
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={returnedQty}
                        onChange={(e) => setReturnedQty(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Replace with</Label>
                      <Select
                        value={newProductId}
                        onValueChange={(id) => {
                          setNewProductId(id);
                          setNewVariantId(NONE);
                          setPriceDiff(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Send qty</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newQty}
                        onChange={(e) => {
                          setNewQty(e.target.value);
                          setPriceDiff(null);
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {newVariants.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Replacement variant</Label>
                    <Select
                      value={newVariantId}
                      onValueChange={(id) => {
                        setNewVariantId(id);
                        setPriceDiff(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Base product</SelectItem>
                        {newVariants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.sku}
                            {v.size || v.color || v.design
                              ? ` — ${[v.size, v.color, v.design].filter(Boolean).join(' / ')}`
                              : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-3">
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
                    <Label>Stock location</Label>
                    <Select value={locationId} onValueChange={setLocationId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Order&apos;s location</SelectItem>
                        {locations?.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="price-diff">Price difference</Label>
                    <Input
                      id="price-diff"
                      type="number"
                      step="0.01"
                      value={diffValue}
                      onChange={(e) => setPriceDiff(e.target.value)}
                    />
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
            <Button onClick={submit} disabled={!valid || createExchange.isPending}>
              {createExchange.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record exchange
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
