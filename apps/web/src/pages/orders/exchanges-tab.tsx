import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Repeat, Search } from 'lucide-react';
import { toast } from 'sonner';
import { EXCHANGE_STATUS_LABELS, EXCHANGE_STATUSES, type ExchangeStatus } from '@inventory/shared';

import { RoleGate } from '@/components/auth/role-gate';
import { ChannelBadge } from '@/components/channel-badge';
import { ChannelFilter } from '@/components/channel-filter';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ExchangeStatusBadge } from '@/components/status-badges';
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
import { useSetExchangeStatus } from '@/features/exchanges/mutations';
import {
  useExchangeItems,
  useExchanges,
  type Exchange,
  type ExchangeItem,
} from '@/features/exchanges/queries';
import type { Order } from '@/features/orders/queries';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/format';
import { countByChannel, type ChannelFilterValue } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

import { NewExchangeDialog } from './new-exchange-dialog';

const ALL = 'ALL';

export function ExchangesTab({ orders }: { orders: Order[] }) {
  const { data: exchanges, isLoading } = useExchanges();
  const { data: exchangeItems } = useExchangeItems();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const setStatus = useSetExchangeStatus();

  const [channel, setChannel] = useState<ChannelFilterValue>('ALL');
  const [status, setStatusFilter] = useState<ExchangeStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const [completing, setCompleting] = useState<Exchange | null>(null);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const itemsByExchange = useMemo(() => {
    const map = new Map<string, ExchangeItem[]>();
    for (const item of exchangeItems ?? []) {
      map.set(item.exchange_id, [...(map.get(item.exchange_id) ?? []), item]);
    }
    return map;
  }, [exchangeItems]);

  const name = (productId: string, variantId: string | null) => {
    const product = products?.find((p) => p.id === productId)?.name ?? 'Product';
    const sku = variantId ? variants?.find((v) => v.id === variantId)?.sku : null;
    return sku ? `${product} (${sku})` : product;
  };

  const all = exchanges ?? [];
  const byChannel = all.filter((x) => channel === 'ALL' || x.sales_channel === channel);
  const rows = byChannel.filter((x) => {
    if (status !== ALL && x.status !== status) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const order = orderById.get(x.original_order_id);
    return [
      x.exchange_number,
      order?.order_number,
      order?.external_order_id,
      order?.customer_name,
    ].some((f) => f?.toLowerCase().includes(term));
  });
  const statusCount = (s: ExchangeStatus) => byChannel.filter((x) => x.status === s).length;

  const move = async (exchange: Exchange, next: ExchangeStatus, success: string) => {
    try {
      await setStatus.mutateAsync({ id: exchange.id, status: next });
      toast.success(success);
    } catch (e) {
      toast.error('Could not update the exchange', { description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChannelFilter value={channel} onChange={setChannel} counts={countByChannel(all)} />
        <RoleGate min="STAFF">
          <div className="shrink-0 self-start sm:self-auto">
            <NewExchangeDialog orders={orders} />
          </div>
        </RoleGate>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['REQUESTED', 'APPROVED', 'DISPATCHED', 'COMPLETED'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(status === s ? ALL : s)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors hover:bg-accent',
              status === s && 'border-primary bg-accent',
            )}
          >
            <p className="text-xs text-muted-foreground">{EXCHANGE_STATUS_LABELS[s]}</p>
            <p className="text-2xl font-semibold">{statusCount(s)}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search exchange no., original order no., channel order ID or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatusFilter(v as ExchangeStatus | typeof ALL)}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {EXCHANGE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {EXCHANGE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={all.length === 0 ? 'No exchanges yet' : 'No exchanges match these filters'}
          description={
            all.length === 0
              ? 'Issue an exchange against an order that has been dispatched.'
              : undefined
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead>Original order</TableHead>
                <TableHead className="hidden md:table-cell">Swap</TableHead>
                <TableHead>Status</TableHead>
                <RoleGate min="STAFF">
                  <TableHead className="w-52" />
                </RoleGate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((exchange) => {
                const order = orderById.get(exchange.original_order_id);
                const lines = itemsByExchange.get(exchange.id) ?? [];
                return (
                  <TableRow key={exchange.id}>
                    <TableCell>
                      <p className="font-medium">{exchange.exchange_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(exchange.requested_at)}
                      </p>
                      {exchange.reason ? (
                        <p className="text-xs text-muted-foreground">{exchange.reason}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ChannelBadge channel={exchange.sales_channel} />
                        <Link
                          to={`/orders/${exchange.original_order_id}`}
                          className="font-medium hover:underline"
                        >
                          {order?.order_number ?? 'Order'}
                        </Link>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {order?.external_order_id}
                      </p>
                      <p className="text-xs text-muted-foreground">{order?.customer_name}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {lines.map((line) => (
                        <p key={line.id} className="flex flex-wrap items-center gap-1 text-sm">
                          <span>
                            {formatQuantity(line.returned_quantity)} ×{' '}
                            {name(line.returned_product_id, line.returned_variant_id)}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {formatQuantity(line.new_quantity)} ×{' '}
                            {name(line.new_product_id, line.new_variant_id)}
                          </span>
                          {line.price_difference !== 0 ? (
                            <span className="text-xs text-muted-foreground">
                              ({line.price_difference > 0 ? '+' : ''}
                              {formatCurrency(line.price_difference)})
                            </span>
                          ) : null}
                        </p>
                      ))}
                    </TableCell>
                    <TableCell>
                      <ExchangeStatusBadge status={exchange.status} />
                    </TableCell>
                    <RoleGate min="STAFF">
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {exchange.status === 'REQUESTED' ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => move(exchange, 'APPROVED', 'Exchange approved')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => move(exchange, 'REJECTED', 'Exchange rejected')}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {exchange.status === 'APPROVED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                move(exchange, 'DISPATCHED', 'Replacement marked dispatched')
                              }
                            >
                              Replacement sent
                            </Button>
                          ) : null}
                          {exchange.status === 'APPROVED' || exchange.status === 'DISPATCHED' ? (
                            <Button size="sm" onClick={() => setCompleting(exchange)}>
                              Complete
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

      <ConfirmDialog
        open={!!completing}
        onOpenChange={(open) => !open && setCompleting(null)}
        title={`Complete ${completing?.exchange_number ?? 'exchange'}?`}
        description="This moves stock: the returned item goes back into the location and the replacement is taken out. It can't be reopened."
        confirmLabel="Complete exchange"
        destructive={false}
        onConfirm={async () => {
          if (completing) await move(completing, 'COMPLETED', 'Exchange completed — stock updated');
        }}
      />
    </div>
  );
}
