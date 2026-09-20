import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OrderStatus } from '@inventory/shared';

import { ChannelBadge } from '@/components/channel-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { RoleGate } from '@/components/auth/role-gate';
import {
  ExchangeStatusBadge,
  OrderStatusBadge,
  ReturnStatusBadge,
} from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useExchanges } from '@/features/exchanges/queries';
import { useLocations } from '@/features/locations/queries';
import {
  useAddOrderItem,
  useDeleteOrder,
  useDeleteOrderItem,
  useSetOrderStatus,
  useUpdateOrder,
} from '@/features/orders/mutations';
import { useOrder, useOrderItems, type Order } from '@/features/orders/queries';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { useReturns } from '@/features/returns/queries';
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from '@/lib/format';

import { EditOrderDetailsDialog } from './edit-order-details-dialog';

const NONE = '__none__';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { data: order, isLoading, error } = useOrder(orderId);
  const { data: items } = useOrderItems(orderId);
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: locations } = useLocations();
  const { data: returns } = useReturns();
  const { data: exchanges } = useExchanges();
  const setStatus = useSetOrderStatus();
  const deleteOrder = useDeleteOrder();
  const deleteItem = useDeleteOrderItem();

  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);

  const productById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const variantById = useMemo(() => new Map((variants ?? []).map((v) => [v.id, v])), [variants]);
  const locationName = (id: string | null) => locations?.find((l) => l.id === id)?.name;

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !order) {
    return (
      <EmptyState
        title="Order not found"
        description="It may have been deleted, or you may not have access."
        action={
          <Button asChild variant="outline">
            <Link to="/orders">Back to orders</Link>
          </Button>
        }
      />
    );
  }

  const isNew = order.status === 'NEW';
  const orderReturns = (returns ?? []).filter((r) => r.order_id === order.id);
  const orderExchanges = (exchanges ?? []).filter((x) => x.original_order_id === order.id);

  const missing: string[] = [];
  if (!order.awb_number) missing.push('an AWB number');
  if (!order.location_id) missing.push('a ship-from location');
  if (!items || items.length === 0) missing.push('at least one item');

  const move = async (status: OrderStatus, success: string) => {
    try {
      await setStatus.mutateAsync({ id: order.id, status });
      toast.success(success);
    } catch (e) {
      toast.error('Could not update the order', { description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/orders">
            <ArrowLeft className="h-4 w-4" />
            Orders
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{order.order_number}</h2>
              <ChannelBadge channel={order.sales_channel} />
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.external_order_id ? `${order.external_order_id} · ` : ''}
              Ordered {formatDate(order.order_date)}
            </p>
          </div>

          <RoleGate min="STAFF">
            <div className="flex flex-wrap gap-2">
              {order.status === 'NEW' ? (
                <Button
                  disabled={missing.length > 0 || setStatus.isPending}
                  onClick={() => move('DISPATCH_READY', 'Marked dispatch ready — stock taken out')}
                >
                  {setStatus.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackageCheck className="h-4 w-4" />
                  )}
                  Mark dispatch ready
                </Button>
              ) : null}
              {order.status === 'DISPATCH_READY' ? (
                <>
                  <Button onClick={() => move('DISPATCHED', 'Marked dispatched')}>
                    <Truck className="h-4 w-4" />
                    Mark dispatched
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => move('NEW', 'Back to New — stock restored')}
                  >
                    <Undo2 className="h-4 w-4" />
                    Undo
                  </Button>
                </>
              ) : null}
              {order.status === 'DISPATCHED' ? (
                <Button onClick={() => move('DELIVERED', 'Marked delivered')}>
                  <CheckCircle2 className="h-4 w-4" />
                  Mark delivered
                </Button>
              ) : null}
              {order.status === 'CANCELLED' ? (
                <Button variant="outline" onClick={() => move('NEW', 'Order reopened')}>
                  <Undo2 className="h-4 w-4" />
                  Reopen
                </Button>
              ) : null}
              {order.status === 'NEW' || order.status === 'DISPATCH_READY' ? (
                <Button variant="outline" onClick={() => setConfirm('cancel')}>
                  <Ban className="h-4 w-4" />
                  Cancel order
                </Button>
              ) : null}
              {isNew ? (
                <RoleGate min="MANAGER">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete order"
                    onClick={() => setConfirm('delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </RoleGate>
              ) : null}
            </div>
          </RoleGate>
        </div>

        {isNew && missing.length > 0 ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            To mark this dispatch ready it needs {missing.join(', ')}.
          </p>
        ) : null}
        {order.status === 'DISPATCH_READY' ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Stock has left {locationName(order.location_id) ?? 'the location'}. Use Undo to restore
            it and edit the AWB or items.
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Items</CardTitle>
            {isNew ? (
              <RoleGate min="STAFF">
                <AddItemDialog orderId={order.id} />
              </RoleGate>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {isNew ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((item) => {
                  const product = productById.get(item.product_id);
                  const variant = item.variant_id ? variantById.get(item.variant_id) : undefined;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{product?.name ?? item.product_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {variant?.sku ?? product?.sku}
                          {variant && (variant.size || variant.color || variant.design)
                            ? ` — ${[variant.size, variant.color, variant.design].filter(Boolean).join(' / ')}`
                            : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatQuantity(item.quantity)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.tax_rate}%
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.line_total)}
                      </TableCell>
                      {isNew ? (
                        <TableCell>
                          <RoleGate min="STAFF">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove item"
                              onClick={async () => {
                                try {
                                  await deleteItem.mutateAsync(item.id);
                                } catch (e) {
                                  toast.error('Could not remove item', {
                                    description: (e as Error).message,
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </RoleGate>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-muted-foreground">
                    Subtotal
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(order.subtotal)}</TableCell>
                  {isNew ? <TableCell /> : null}
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-muted-foreground">
                    Tax
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(order.tax_amount)}</TableCell>
                  {isNew ? <TableCell /> : null}
                </TableRow>
                {order.discount_amount > 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-right text-muted-foreground">
                      Discount
                    </TableCell>
                    <TableCell className="text-right">
                      −{formatCurrency(order.discount_amount)}
                    </TableCell>
                    {isNew ? <TableCell /> : null}
                  </TableRow>
                ) : null}
                {order.shipping_amount > 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-right text-muted-foreground">
                      Shipping
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(order.shipping_amount)}
                    </TableCell>
                    {isNew ? <TableCell /> : null}
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(order.total_amount)}
                  </TableCell>
                  {isNew ? <TableCell /> : null}
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ShipmentCard key={order.updated_at} order={order} locations={locations ?? []} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Customer</CardTitle>
              {isNew ? (
                <RoleGate min="STAFF">
                  <EditOrderDetailsDialog order={order} />
                </RoleGate>
              ) : null}
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Field label="Name">{order.customer_name}</Field>
                <Field label="Phone">{order.customer_phone}</Field>
                <Field label="Email">{order.customer_email}</Field>
                <Field label="Address">
                  <span className="whitespace-pre-line">{order.shipping_address}</span>
                </Field>
                {order.notes ? <Field label="Notes">{order.notes}</Field> : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Field label="Created">{formatDateTime(order.created_at)}</Field>
                <Field label="Dispatch ready">
                  {order.ready_at ? formatDateTime(order.ready_at) : null}
                </Field>
                <Field label="Dispatched">
                  {order.dispatched_at ? formatDateTime(order.dispatched_at) : null}
                </Field>
              </dl>
            </CardContent>
          </Card>

          {orderReturns.length > 0 || orderExchanges.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Returns &amp; exchanges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {orderReturns.map((r) => (
                  <Link
                    key={r.id}
                    to="/orders?tab=returns"
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-accent"
                  >
                    <span>Return {r.return_number}</span>
                    <ReturnStatusBadge status={r.status} />
                  </Link>
                ))}
                {orderExchanges.map((x) => (
                  <Link
                    key={x.id}
                    to="/orders?tab=exchanges"
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-accent"
                  >
                    <span>Exchange {x.exchange_number}</span>
                    <ExchangeStatusBadge status={x.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Cancel this order?"
        description={
          order.status === 'DISPATCH_READY'
            ? 'Its stock has already left the location — cancelling puts it back.'
            : 'The order will be marked cancelled. You can reopen it later.'
        }
        confirmLabel="Cancel order"
        onConfirm={() => move('CANCELLED', 'Order cancelled')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this order?"
        description="This permanently removes the order and its items. Only untouched (New) orders can be deleted."
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await deleteOrder.mutateAsync(order.id);
            toast.success('Order deleted');
            navigate('/orders');
          } catch (e) {
            toast.error('Could not delete order', { description: (e as Error).message });
          }
        }}
      />
    </div>
  );
}

/** AWB, courier and ship-from location — editable while the order is New, frozen afterwards. */
function ShipmentCard({
  order,
  locations,
}: {
  order: Order;
  locations: { id: string; name: string; code: string }[];
}) {
  const updateOrder = useUpdateOrder();
  const [awb, setAwb] = useState(order.awb_number ?? '');
  const [courier, setCourier] = useState(order.courier_name ?? '');
  const [locationId, setLocationId] = useState(order.location_id ?? NONE);
  const editable = order.status === 'NEW';
  const dirty =
    awb.trim() !== (order.awb_number ?? '') ||
    courier.trim() !== (order.courier_name ?? '') ||
    locationId !== (order.location_id ?? NONE);

  const save = async () => {
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        awb_number: awb.trim() || null,
        courier_name: courier.trim() || null,
        location_id: locationId === NONE ? null : locationId,
      });
      toast.success('Shipment details saved');
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shipment</CardTitle>
      </CardHeader>
      <CardContent>
        {editable ? (
          <RoleGate
            min="STAFF"
            fallback={
              <dl className="space-y-3">
                <Field label="AWB">{order.awb_number}</Field>
                <Field label="Courier">{order.courier_name}</Field>
              </dl>
            }
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="awb">AWB number</Label>
                <Input
                  id="awb"
                  className="font-mono"
                  placeholder="Scan or type the AWB"
                  value={awb}
                  onChange={(e) => setAwb(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="courier">Courier</Label>
                <Input
                  id="courier"
                  placeholder="Delhivery, BlueDart…"
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ship from</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set yet</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={!dirty || updateOrder.isPending} onClick={save}>
                {updateOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save shipment details
              </Button>
            </div>
          </RoleGate>
        ) : (
          <dl className="space-y-3">
            <Field label="AWB">
              <span className="font-mono">{order.awb_number}</span>
            </Field>
            <Field label="Courier">{order.courier_name}</Field>
            <Field label="Ship from">
              {locations.find((l) => l.id === order.location_id)?.name}
            </Field>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function AddItemDialog({ orderId }: { orderId: string }) {
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const addItem = useAddOrderItem();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState(NONE);
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('0');
  const [tax, setTax] = useState('0');

  const productVariants = (variants ?? []).filter((v) => v.product_id === productId);

  const reset = () => {
    setProductId('');
    setVariantId(NONE);
    setQuantity('1');
    setPrice('0');
    setTax('0');
  };

  const submit = async () => {
    if (!productId || !(Number(quantity) > 0)) {
      toast.error('Choose a product and a quantity above 0');
      return;
    }
    try {
      await addItem.mutateAsync({
        order_id: orderId,
        product_id: productId,
        variant_id: variantId === NONE ? null : variantId,
        quantity: Number(quantity),
        unit_price: Number(price) || 0,
        tax_rate: Number(tax) || 0,
      });
      toast.success('Item added');
      reset();
      setOpen(false);
    } catch (e) {
      toast.error('Could not add item', { description: (e as Error).message });
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add item
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select
                value={productId}
                onValueChange={(id) => {
                  setProductId(id);
                  setVariantId(NONE);
                  const p = products?.find((x) => x.id === id);
                  setPrice(String(p?.selling_price ?? 0));
                  setTax(String(p?.tax_rate ?? 0));
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
            {productVariants.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Variant</Label>
                <Select
                  value={variantId}
                  onValueChange={(id) => {
                    setVariantId(id);
                    const v = productVariants.find((x) => x.id === id);
                    const p = products?.find((x) => x.id === productId);
                    setPrice(String(v?.selling_price ?? p?.selling_price ?? 0));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Base product</SelectItem>
                    {productVariants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Qty</Label>
                <Input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tax %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={addItem.isPending}>
              {addItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
