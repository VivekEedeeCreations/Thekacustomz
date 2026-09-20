import { useMemo, useState } from 'react';
import { Loader2, PackageCheck, Truck, Undo2 } from 'lucide-react';

import { ChannelBadge } from '@/components/channel-badge';
import { OrderStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocations } from '@/features/locations/queries';
import { useOrderItems, type Order } from '@/features/orders/queries';
import type { ScanMatchKind } from '@/features/orders/scan';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { formatCurrency, formatQuantity } from '@/lib/format';

const NONE = '__none__';

const MATCH_LABELS: Record<ScanMatchKind, string> = {
  awb: 'AWB',
  order_number: 'order number',
  channel_order_id: 'channel order ID',
};

/**
 * The order a scan landed on when it can't be dispatched hands-free: several orders
 * share the scanned ID, the AWB/location is missing, or it's already dispatch-ready.
 */
export function ScanResultCard({
  orders,
  matchedBy,
  code,
  busy,
  onChoose,
  onReady,
  onDispatch,
  onUndo,
}: {
  orders: Order[];
  matchedBy: ScanMatchKind;
  code: string;
  busy: boolean;
  onChoose: (order: Order) => void;
  onReady: (order: Order, details: { awb: string; courier: string; locationId: string }) => void;
  onDispatch: (order: Order) => void;
  onUndo: (order: Order) => void;
}) {
  if (orders.length > 1) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
        <p className="text-sm font-medium">
          {orders.length} orders share {MATCH_LABELS[matchedBy]}{' '}
          <span className="font-mono">{code}</span>
        </p>
        <p className="mb-3 text-xs text-muted-foreground">Pick the one you&apos;re packing.</p>
        <ul className="space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm"
            >
              <ChannelBadge channel={order.sales_channel} />
              <span className="flex-1 truncate">
                <span className="font-medium">{order.order_number}</span>{' '}
                <span className="text-muted-foreground">{order.customer_name}</span>
              </span>
              <OrderStatusBadge status={order.status} />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChoose(order)}>
                Use
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const order = orders[0];
  if (!order) return null;
  return (
    <SingleOrderCard
      key={order.id + order.updated_at}
      order={order}
      matchedBy={matchedBy}
      code={code}
      busy={busy}
      onReady={onReady}
      onDispatch={onDispatch}
      onUndo={onUndo}
    />
  );
}

function SingleOrderCard({
  order,
  matchedBy,
  code,
  busy,
  onReady,
  onDispatch,
  onUndo,
}: {
  order: Order;
  matchedBy: ScanMatchKind;
  code: string;
  busy: boolean;
  onReady: (order: Order, details: { awb: string; courier: string; locationId: string }) => void;
  onDispatch: (order: Order) => void;
  onUndo: (order: Order) => void;
}) {
  const { data: items } = useOrderItems(order.id);
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: locations } = useLocations();
  const [awb, setAwb] = useState(order.awb_number ?? '');
  const [courier, setCourier] = useState(order.courier_name ?? '');
  const [locationId, setLocationId] = useState(
    order.location_id ?? locations?.find((l) => l.is_default)?.id ?? NONE,
  );

  const productName = useMemo(() => {
    const byId = new Map((products ?? []).map((p) => [p.id, p.name]));
    const skuByVariant = new Map((variants ?? []).map((v) => [v.id, v.sku]));
    return (productId: string, variantId: string | null) =>
      `${byId.get(productId) ?? 'Product'}${variantId ? ` (${skuByVariant.get(variantId) ?? 'variant'})` : ''}`;
  }, [products, variants]);

  const needsInfo = order.status === 'NEW' && (!order.awb_number || !order.location_id);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ChannelBadge channel={order.sales_channel} />
        <span className="font-semibold">{order.order_number}</span>
        <OrderStatusBadge status={order.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          matched {MATCH_LABELS[matchedBy]} <span className="font-mono">{code}</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {order.customer_name || 'No customer name'}
        {order.external_order_id ? ` · ${order.external_order_id}` : ''}
      </p>

      <ul className="mt-3 divide-y rounded-md border text-sm">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex justify-between gap-2 p-2">
            <span className="min-w-0 truncate">
              {productName(item.product_id, item.variant_id)}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {formatQuantity(item.quantity)} × {formatCurrency(item.unit_price)}
            </span>
          </li>
        ))}
        {items && items.length === 0 ? (
          <li className="p-2 text-muted-foreground">This order has no items.</li>
        ) : null}
      </ul>

      {needsInfo ? (
        <div className="mt-4 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="text-sm font-medium">
            Needs {!order.awb_number ? 'an AWB' : ''}
            {!order.awb_number && !order.location_id ? ' and ' : ''}
            {!order.location_id ? 'a ship-from location' : ''} before it can be dispatched
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="scan-awb">AWB</Label>
              <Input
                id="scan-awb"
                autoFocus={!order.awb_number}
                className="font-mono"
                placeholder="Scan the label"
                value={awb}
                onChange={(e) => setAwb(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scan-courier">Courier</Label>
              <Input
                id="scan-courier"
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ship from</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            disabled={busy || !awb.trim() || locationId === NONE}
            onClick={() => onReady(order, { awb: awb.trim(), courier: courier.trim(), locationId })}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="h-4 w-4" />
            )}
            Link AWB &amp; mark dispatch ready
          </Button>
        </div>
      ) : null}

      {order.status === 'DISPATCH_READY' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-muted-foreground">
            Already dispatch ready — AWB <span className="font-mono">{order.awb_number}</span>.
          </p>
          <Button size="sm" disabled={busy} onClick={() => onDispatch(order)}>
            <Truck className="h-4 w-4" />
            Mark dispatched
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onUndo(order)}>
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}
