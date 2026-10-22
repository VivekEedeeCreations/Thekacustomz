import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, PackageCheck, RotateCcw, Truck } from 'lucide-react';

import { ChannelBadge } from '@/components/channel-badge';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useOrders, type Order } from '@/features/orders/queries';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETURN_WINDOWS = [7, 10, 15, 30] as const;
const LIST_LIMIT = 10;

/** Whole days from a yyyy-mm-dd date or timestamp to today (local time). */
function daysSince(value: string, now: number): number {
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(date);
  startOfThen.setHours(0, 0, 0, 0);
  return Math.round((startOfToday.getTime() - startOfThen.getTime()) / DAY_MS);
}

function OrderStat({
  label,
  value,
  hint,
  icon: Icon,
  isLoading,
  to,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Truck;
  isLoading: boolean;
  to: string;
}) {
  return (
    <Link to={to} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <p className="text-2xl font-semibold">{value}</p>
          )}
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">{children}</h3>
      {action}
    </div>
  );
}

function OrderLink({ order }: { order: Order }) {
  return (
    <Link to={`/orders/${order.id}`} className="font-medium hover:underline">
      {order.external_order_id || order.order_number}
    </Link>
  );
}

export function DashboardOrders() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = useOrders();
  const [windowDays, setWindowDays] = useState<number>(7);
  const now = Date.now();

  const groups = useMemo(() => {
    const all = orders ?? [];
    const pending = all.filter((o) => o.status === 'NEW' || o.status === 'DISPATCH_READY');
    const dispatched = all
      .filter((o) => o.status === 'DISPATCHED')
      .sort((a, b) => (a.dispatched_at ?? '').localeCompare(b.dispatched_at ?? ''));
    const delivered = all.filter((o) => o.status === 'DELIVERED');

    const byDate = new Map<string, { date: string; fresh: number; ready: number }>();
    for (const o of pending) {
      const row = byDate.get(o.order_date) ?? { date: o.order_date, fresh: 0, ready: 0 };
      if (o.status === 'NEW') row.fresh += 1;
      else row.ready += 1;
      byDate.set(o.order_date, row);
    }
    const pendingByDate = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    return { pending, pendingByDate, dispatched, delivered };
  }, [orders]);

  // Recomputed with the window so changing it doesn't re-group everything.
  const returnWindow = useMemo(
    () =>
      groups.delivered
        .filter((o) => o.delivered_at)
        .map((o) => ({ order: o, daysLeft: windowDays - daysSince(o.delivered_at!, now) }))
        .filter((r) => r.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    // `now` changes every render; the list only needs to follow the data and the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups.delivered, windowDays],
  );

  const deliveredLast30 = groups.delivered.filter(
    (o) => o.delivered_at && daysSince(o.delivered_at, now) <= 30,
  ).length;
  const oldestPending = groups.pendingByDate[0];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OrderStat
          label="Pending dispatch"
          value={groups.pending.length}
          hint={oldestPending ? `Oldest from ${formatDate(oldestPending.date)}` : 'Nothing waiting'}
          icon={CalendarClock}
          isLoading={isLoading}
          to="/orders?tab=dispatch"
        />
        <OrderStat
          label="Dispatched (in transit)"
          value={groups.dispatched.length}
          icon={Truck}
          isLoading={isLoading}
          to="/orders"
        />
        <OrderStat
          label="Delivered"
          value={groups.delivered.length}
          hint={`${deliveredLast30} in the last 30 days`}
          icon={PackageCheck}
          isLoading={isLoading}
          to="/orders"
        />
        <OrderStat
          label="Return window open"
          value={returnWindow.length}
          hint={`Delivered in the last ${windowDays} days`}
          icon={RotateCcw}
          isLoading={isLoading}
          to="/orders?tab=returns"
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <section>
          <SectionTitle>Pending dispatch by order date</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : groups.pendingByDate.length === 0 ? (
            <EmptyState title="No orders waiting to be dispatched" />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order date</TableHead>
                    <TableHead>Waiting</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Ready</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.pendingByDate.map((row) => {
                    const age = daysSince(row.date, now);
                    return (
                      <TableRow
                        key={row.date}
                        className="cursor-pointer"
                        onClick={() => navigate('/orders?tab=dispatch')}
                      >
                        <TableCell className="font-medium">{formatDate(row.date)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={age >= 3 ? 'destructive' : age >= 1 ? 'outline' : 'secondary'}
                          >
                            {age <= 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{row.fresh || '—'}</TableCell>
                        <TableCell className="text-right">{row.ready || '—'}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {row.fresh + row.ready}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
                <SelectTrigger className="h-8 w-36" aria-label="Return window length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_WINDOWS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}-day window
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          >
            Return window open
          </SectionTitle>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : returnWindow.length === 0 ? (
            <EmptyState title={`No deliveries in the last ${windowDays} days`} />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead className="text-right">Window closes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnWindow.slice(0, LIST_LIMIT).map(({ order, daysLeft }) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <OrderLink order={order} />
                          <ChannelBadge channel={order.sales_channel} className="w-fit" />
                        </div>
                      </TableCell>
                      <TableCell>{order.customer_name || '—'}</TableCell>
                      <TableCell>{formatDate(order.delivered_at)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right',
                          daysLeft <= 1 && 'font-medium text-destructive',
                        )}
                      >
                        {daysLeft === 0
                          ? 'Today'
                          : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {returnWindow.length > LIST_LIMIT ? (
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                  Showing the {LIST_LIMIT} closing soonest of {returnWindow.length}.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionTitle>Dispatched — in transit</SectionTitle>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : groups.dispatched.length === 0 ? (
          <EmptyState title="Nothing in transit" />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Courier / AWB</TableHead>
                  <TableHead>Dispatched</TableHead>
                  <TableHead className="text-right">In transit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.dispatched.slice(0, LIST_LIMIT).map((order) => {
                  const days = order.dispatched_at ? daysSince(order.dispatched_at, now) : null;
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <OrderLink order={order} />
                      </TableCell>
                      <TableCell>
                        <ChannelBadge channel={order.sales_channel} />
                      </TableCell>
                      <TableCell>{order.customer_name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {order.courier_name ? `${order.courier_name} · ` : ''}
                        {order.awb_number ?? '—'}
                      </TableCell>
                      <TableCell>{formatDate(order.dispatched_at)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right',
                          days != null && days >= 7 && 'text-destructive',
                        )}
                      >
                        {days == null ? '—' : `${days} day${days === 1 ? '' : 's'}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {groups.dispatched.length > LIST_LIMIT ? (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                Showing the {LIST_LIMIT} longest in transit of {groups.dispatched.length}.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
