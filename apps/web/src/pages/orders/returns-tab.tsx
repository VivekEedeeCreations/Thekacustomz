import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { RETURN_STATUS_LABELS, RETURN_STATUSES, type ReturnStatus } from '@inventory/shared';

import { RoleGate } from '@/components/auth/role-gate';
import { ChannelBadge } from '@/components/channel-badge';
import { ChannelFilter } from '@/components/channel-filter';
import { EmptyState } from '@/components/empty-state';
import { ReturnStatusBadge } from '@/components/status-badges';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLocations } from '@/features/locations/queries';
import { useOrderItems, type Order } from '@/features/orders/queries';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { useUpdateReturn } from '@/features/returns/mutations';
import {
  useReturnItems,
  useReturns,
  type OrderReturn,
  type ReturnItem,
} from '@/features/returns/queries';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/format';
import { countByChannel, type ChannelFilterValue } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

import { NewReturnDialog } from './new-return-dialog';

const ALL = 'ALL';

export function ReturnsTab({ orders }: { orders: Order[] }) {
  const { data: returns, isLoading } = useReturns();
  const { data: returnItems } = useReturnItems();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const updateReturn = useUpdateReturn();

  const [channel, setChannel] = useState<ChannelFilterValue>('ALL');
  const [status, setStatus] = useState<ReturnStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const [receiving, setReceiving] = useState<OrderReturn | null>(null);
  const [refunding, setRefunding] = useState<OrderReturn | null>(null);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const itemsByReturn = useMemo(() => {
    const map = new Map<string, ReturnItem[]>();
    for (const item of returnItems ?? []) {
      map.set(item.return_id, [...(map.get(item.return_id) ?? []), item]);
    }
    return map;
  }, [returnItems]);

  const summary = (returnId: string) =>
    (itemsByReturn.get(returnId) ?? [])
      .map((item) => {
        const name = products?.find((p) => p.id === item.product_id)?.name ?? 'Product';
        const sku = item.variant_id ? variants?.find((v) => v.id === item.variant_id)?.sku : null;
        return `${formatQuantity(item.quantity)} × ${name}${sku ? ` (${sku})` : ''}`;
      })
      .join(', ');

  const all = returns ?? [];
  const byChannel = all.filter((r) => channel === 'ALL' || r.sales_channel === channel);
  const rows = byChannel.filter((r) => {
    if (status !== ALL && r.status !== status) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const order = orderById.get(r.order_id);
    return [
      r.return_number,
      order?.order_number,
      order?.external_order_id,
      order?.customer_name,
    ].some((f) => f?.toLowerCase().includes(term));
  });

  const statusCount = (s: ReturnStatus) => byChannel.filter((r) => r.status === s).length;

  const move = async (ret: OrderReturn, next: ReturnStatus, success: string) => {
    try {
      await updateReturn.mutateAsync({ id: ret.id, status: next });
      toast.success(success);
    } catch (e) {
      toast.error('Could not update the return', { description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChannelFilter value={channel} onChange={setChannel} counts={countByChannel(all)} />
        <RoleGate min="STAFF">
          <div className="shrink-0 self-start sm:self-auto">
            <NewReturnDialog orders={orders} />
          </div>
        </RoleGate>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['REQUESTED', 'AUTHORIZED', 'RECEIVED', 'REFUNDED'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? ALL : s)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors hover:bg-accent',
              status === s && 'border-primary bg-accent',
            )}
          >
            <p className="text-xs text-muted-foreground">{RETURN_STATUS_LABELS[s]}</p>
            <p className="text-2xl font-semibold">{statusCount(s)}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search return no., order no., channel order ID or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ReturnStatus | typeof ALL)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {RETURN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {RETURN_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title={all.length === 0 ? 'No returns yet' : 'No returns match these filters'}
          description={
            all.length === 0
              ? 'Record a return against an order that has been dispatched.'
              : undefined
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="hidden lg:table-cell">Items</TableHead>
                <TableHead className="hidden md:table-cell">Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Refund</TableHead>
                <RoleGate min="STAFF">
                  <TableHead className="w-44" />
                </RoleGate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((ret) => {
                const order = orderById.get(ret.order_id);
                return (
                  <TableRow key={ret.id}>
                    <TableCell>
                      <p className="font-medium">{ret.return_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(ret.requested_at)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ChannelBadge channel={ret.sales_channel} />
                        <Link
                          to={`/orders/${ret.order_id}`}
                          className="font-medium hover:underline"
                        >
                          {order?.order_number ?? 'Order'}
                        </Link>
                      </div>
                      <p className="text-xs text-muted-foreground">{order?.external_order_id}</p>
                    </TableCell>
                    <TableCell className="hidden max-w-64 text-sm text-muted-foreground lg:table-cell">
                      {summary(ret.id) || '—'}
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate text-muted-foreground md:table-cell">
                      {ret.reason || '—'}
                    </TableCell>
                    <TableCell>
                      <ReturnStatusBadge status={ret.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {ret.status === 'REFUNDED' ? formatCurrency(ret.refund_amount) : '—'}
                    </TableCell>
                    <RoleGate min="STAFF">
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {ret.status === 'REQUESTED' ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => move(ret, 'AUTHORIZED', 'Return authorized')}
                              >
                                Authorize
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => move(ret, 'REJECTED', 'Return rejected')}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {ret.status === 'AUTHORIZED' ? (
                            <Button size="sm" onClick={() => setReceiving(ret)}>
                              Mark received
                            </Button>
                          ) : null}
                          {ret.status === 'RECEIVED' ? (
                            <Button size="sm" onClick={() => setRefunding(ret)}>
                              Mark refunded
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </RoleGate>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {receiving ? <ReceiveDialog ret={receiving} onClose={() => setReceiving(null)} /> : null}
      {refunding ? (
        <RefundDialog
          ret={refunding}
          items={itemsByReturn.get(refunding.id) ?? []}
          onClose={() => setRefunding(null)}
        />
      ) : null}
    </div>
  );
}

/** RECEIVED is the moment the goods physically arrive — stock goes back into the chosen location. */
function ReceiveDialog({ ret, onClose }: { ret: OrderReturn; onClose: () => void }) {
  const { data: locations } = useLocations();
  const updateReturn = useUpdateReturn();
  const [locationId, setLocationId] = useState(ret.location_id ?? '');

  const confirm = async () => {
    try {
      await updateReturn.mutateAsync({ id: ret.id, status: 'RECEIVED', location_id: locationId });
      toast.success('Return received — stock added back');
      onClose();
    } catch (e) {
      toast.error('Could not receive the return', { description: (e as Error).message });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive {ret.return_number}</DialogTitle>
          <DialogDescription>
            The returned items go back into stock at the location you choose.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Receive into</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
              {locations?.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={!locationId || updateReturn.isPending}>
            {updateReturn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Mark received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Suggests the refund from what the customer actually paid for the returned units. */
function RefundDialog({
  ret,
  items,
  onClose,
}: {
  ret: OrderReturn;
  items: ReturnItem[];
  onClose: () => void;
}) {
  const { data: orderItems } = useOrderItems(ret.order_id);
  const updateReturn = useUpdateReturn();
  const [amount, setAmount] = useState<string | null>(null);

  const suggested = useMemo(() => {
    if (!orderItems) return 0;
    const total = items.reduce((sum, ri) => {
      const line = orderItems.find((oi) => oi.id === ri.order_item_id);
      return line && line.quantity > 0
        ? sum + (line.line_total / line.quantity) * ri.quantity
        : sum;
    }, 0);
    return Math.round(total * 100) / 100;
  }, [orderItems, items]);

  const value = amount ?? String(suggested);

  const confirm = async () => {
    try {
      await updateReturn.mutateAsync({
        id: ret.id,
        status: 'REFUNDED',
        refund_amount: Number(value) || 0,
      });
      toast.success('Refund recorded');
      onClose();
    } catch (e) {
      toast.error('Could not record the refund', { description: (e as Error).message });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {ret.return_number}</DialogTitle>
          <DialogDescription>
            Record the amount refunded to the customer. Suggested from the order&apos;s prices and
            tax.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="refund-amount">Refund amount</Label>
          <Input
            id="refund-amount"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={updateReturn.isPending}>
            {updateReturn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Mark refunded
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
