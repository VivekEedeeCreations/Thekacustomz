import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { ChannelBadge } from '@/components/channel-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Order } from '@/features/orders/queries';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const MAX_RESULTS = 6;

function matches(order: Order, term: string): boolean {
  return [
    order.order_number,
    order.external_order_id,
    order.awb_number,
    order.customer_name,
    order.customer_phone,
  ].some((field) => field?.toLowerCase().includes(term));
}

function OrderSummary({ order }: { order: Order }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <ChannelBadge channel={order.sales_channel} />
      <span className="font-medium">{order.order_number}</span>
      {order.external_order_id ? (
        <span className="text-xs text-muted-foreground">{order.external_order_id}</span>
      ) : null}
      <span className="truncate text-xs text-muted-foreground">
        {order.customer_name || 'No customer name'} · {formatDate(order.order_date)}
      </span>
    </span>
  );
}

/** Search-and-pick for an order — scales to thousands of orders where a plain <select> doesn't. */
export function OrderPicker({
  orders,
  value,
  onChange,
  placeholder = 'Search by order no., channel order ID, AWB or customer…',
}: {
  orders: Order[];
  value: string;
  onChange: (orderId: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const selected = orders.find((o) => o.id === value);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pool = term ? orders.filter((o) => matches(o, term)) : orders;
    return pool.slice(0, MAX_RESULTS);
  }, [orders, search]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
        <OrderSummary order={selected} />
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {results.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No matching orders.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {results.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 p-2 text-left text-sm transition-colors hover:bg-accent',
                )}
                onClick={() => {
                  onChange(order.id);
                  setSearch('');
                }}
              >
                <OrderSummary order={order} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
