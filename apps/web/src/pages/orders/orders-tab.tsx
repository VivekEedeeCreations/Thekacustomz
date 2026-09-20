import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ShoppingCart } from 'lucide-react';
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from '@inventory/shared';

import { RoleGate } from '@/components/auth/role-gate';
import { ChannelBadge } from '@/components/channel-badge';
import { ChannelFilter } from '@/components/channel-filter';
import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { Order } from '@/features/orders/queries';
import { formatCurrency, formatDate } from '@/lib/format';
import { countByChannel, type ChannelFilterValue } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

const ALL = 'ALL';

function matchesSearch(order: Order, term: string): boolean {
  return [
    order.order_number,
    order.external_order_id,
    order.awb_number,
    order.customer_name,
    order.customer_phone,
  ].some((field) => field?.toLowerCase().includes(term));
}

export function OrdersTab({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<ChannelFilterValue>('ALL');
  const [status, setStatus] = useState<OrderStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState('');

  const channelCounts = useMemo(() => countByChannel(orders), [orders]);

  const byChannel = useMemo(
    () => orders.filter((o) => channel === 'ALL' || o.sales_channel === channel),
    [orders, channel],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<OrderStatus, number> = {
      NEW: 0,
      DISPATCH_READY: 0,
      DISPATCHED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };
    for (const o of byChannel) counts[o.status] += 1;
    return counts;
  }, [byChannel]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return byChannel.filter(
      (o) => (status === ALL || o.status === status) && (!term || matchesSearch(o, term)),
    );
  }, [byChannel, status, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChannelFilter value={channel} onChange={setChannel} counts={channelCounts} />
        <RoleGate min="STAFF">
          <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
            <Link to="/orders/new">
              <Plus className="h-4 w-4" />
              New order
            </Link>
          </Button>
        </RoleGate>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['NEW', 'DISPATCH_READY', 'DISPATCHED', 'DELIVERED'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? ALL : s)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors hover:bg-accent',
              status === s && 'border-primary bg-accent',
            )}
          >
            <p className="text-xs text-muted-foreground">{ORDER_STATUS_LABELS[s]}</p>
            <p className="text-2xl font-semibold">{statusCounts[s]}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search order no., channel order ID, AWB, customer or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | typeof ALL)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={orders.length === 0 ? 'No orders yet' : 'No orders match these filters'}
          description={
            orders.length === 0
              ? 'Log your first Amazon, Flipkart, Meesho, Shopify or Instagram order.'
              : undefined
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="hidden lg:table-cell">Channel order ID</TableHead>
                <TableHead className="hidden md:table-cell">Customer</TableHead>
                <TableHead className="hidden sm:table-cell">AWB</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <TableCell>
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.order_number}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(order.order_date)}</p>
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={order.sales_channel} />
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                    {order.external_order_id || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {order.customer_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">
                    {order.awb_number || (
                      <span className="font-sans text-muted-foreground">Not linked</span>
                    )}
                    {order.courier_name ? (
                      <p className="font-sans text-muted-foreground">{order.courier_name}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(order.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
