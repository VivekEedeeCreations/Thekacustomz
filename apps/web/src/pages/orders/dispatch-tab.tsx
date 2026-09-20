import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleSlash,
  Info,
  Loader2,
  PackageCheck,
  ScanLine,
  Truck,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SalesChannel } from '@inventory/shared';

import { RoleGate } from '@/components/auth/role-gate';
import { ChannelBadge } from '@/components/channel-badge';
import { ChannelFilter } from '@/components/channel-filter';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSetOrderStatus, useUpdateOrder } from '@/features/orders/mutations';
import type { Order } from '@/features/orders/queries';
import { findOrdersByScan, type ScanMatchKind } from '@/features/orders/scan';
import { useCameraScanner } from '@/hooks/use-camera-scanner';
import { beep } from '@/lib/beep';
import { formatDateTime } from '@/lib/format';
import { countByChannel, type ChannelFilterValue } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

import { ScanResultCard } from './scan-result-card';

type LogKind = 'ready' | 'undone' | 'info' | 'blocked' | 'not_found' | 'error';

interface LogEntry {
  id: number;
  at: Date;
  code: string;
  kind: LogKind;
  message: string;
  orderId?: string;
  orderNumber?: string;
  channel?: SalesChannel;
}

interface Pending {
  code: string;
  orders: Order[];
  matchedBy: ScanMatchKind;
}

const LOG_STYLE: Record<LogKind, { icon: typeof CheckCircle2; className: string }> = {
  ready: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  undone: { icon: Undo2, className: 'text-muted-foreground' },
  info: { icon: Info, className: 'text-blue-600 dark:text-blue-400' },
  blocked: { icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  not_found: { icon: CircleSlash, className: 'text-destructive' },
  error: { icon: AlertTriangle, className: 'text-destructive' },
};

const CAMERA_REPEAT_MS = 3000;

export function DispatchTab({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  const setStatus = useSetOrderStatus();
  const updateOrder = useUpdateOrder();

  const [channel, setChannel] = useState<ChannelFilterValue>('ALL');
  const [cameraOn, setCameraOn] = useState(false);
  const [sound, setSound] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const logId = useRef(0);
  const lastCameraScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const workload = useMemo(
    () => orders.filter((o) => o.status === 'NEW' || o.status === 'DISPATCH_READY'),
    [orders],
  );
  const channelCounts = useMemo(() => countByChannel(workload), [workload]);
  const visible = useMemo(
    () => workload.filter((o) => channel === 'ALL' || o.sales_channel === channel),
    [workload, channel],
  );
  const awaiting = visible.filter((o) => o.status === 'NEW');
  const ready = visible.filter((o) => o.status === 'DISPATCH_READY');

  const readyByCourier = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of ready) {
      const key = o.courier_name || 'No courier';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [ready]);

  const cue = (kind: 'ok' | 'warn' | 'error') => {
    if (sound) beep(kind);
  };

  const addLog = (entry: Omit<LogEntry, 'id' | 'at'>) => {
    logId.current += 1;
    setLog((prev) => [{ ...entry, id: logId.current, at: new Date() }, ...prev].slice(0, 40));
  };

  const refocus = () => setTimeout(() => inputRef.current?.focus(), 0);

  /** NEW → DISPATCH_READY: the database takes the stock out of the order's location. */
  const markReady = async (order: Order, code: string) => {
    try {
      await setStatus.mutateAsync({ id: order.id, status: 'DISPATCH_READY' });
      addLog({
        code,
        kind: 'ready',
        message: 'Dispatch ready — stock taken out',
        orderId: order.id,
        orderNumber: order.order_number,
        channel: order.sales_channel,
      });
      cue('ok');
      setPending(null);
    } catch (e) {
      addLog({
        code,
        kind: 'error',
        message: (e as Error).message,
        orderNumber: order.order_number,
        channel: order.sales_channel,
      });
      cue('error');
      toast.error(`Could not dispatch ${order.order_number}`, {
        description: (e as Error).message,
      });
    }
  };

  const handleOrder = async (order: Order, code: string, matchedBy: ScanMatchKind) => {
    const ref = {
      orderId: order.id,
      orderNumber: order.order_number,
      channel: order.sales_channel,
    };

    if (order.status === 'NEW') {
      if (!order.awb_number || !order.location_id) {
        setPending({ code, orders: [order], matchedBy });
        addLog({ code, kind: 'blocked', message: 'Needs an AWB / location first', ...ref });
        cue('warn');
        return;
      }
      await markReady(order, code);
      return;
    }
    if (order.status === 'DISPATCH_READY') {
      setPending({ code, orders: [order], matchedBy });
      addLog({ code, kind: 'info', message: 'Already dispatch ready', ...ref });
    } else if (order.status === 'CANCELLED') {
      addLog({ code, kind: 'blocked', message: 'This order is cancelled', ...ref });
      setPending(null);
    } else {
      addLog({ code, kind: 'info', message: `Already ${order.status.toLowerCase()}`, ...ref });
      setPending(null);
    }
    cue('warn');
  };

  const processScan = async (raw: string) => {
    const code = raw.trim();
    if (!code || busy) return;
    setBusy(true);
    try {
      const found = await findOrdersByScan(code);
      if (!found) {
        addLog({ code, kind: 'not_found', message: 'No order matches this scan' });
        cue('error');
        setPending(null);
        return;
      }
      if (found.orders.length > 1) {
        setPending({ code, orders: found.orders, matchedBy: found.matchedBy });
        addLog({
          code,
          kind: 'blocked',
          message: `${found.orders.length} orders match — pick one`,
        });
        cue('warn');
        return;
      }
      const [order] = found.orders;
      if (order) await handleOrder(order, code, found.matchedBy);
    } catch (e) {
      addLog({ code, kind: 'error', message: (e as Error).message });
      cue('error');
      toast.error('Scan lookup failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
      refocus();
    }
  };

  const { videoRef, error: cameraError } = useCameraScanner(cameraOn, (text) => {
    const now = Date.now();
    const last = lastCameraScan.current;
    // A label held in frame is decoded repeatedly — treat that as one scan.
    if (text === last.code && now - last.at < CAMERA_REPEAT_MS) return;
    lastCameraScan.current = { code: text, at: now };
    void processScan(text);
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = manualCode;
    setManualCode('');
    void processScan(code);
  };

  const linkAndReady = async (
    order: Order,
    details: { awb: string; courier: string; locationId: string },
  ) => {
    setBusy(true);
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        awb_number: details.awb,
        courier_name: details.courier || null,
        location_id: details.locationId,
      });
      await markReady(order, details.awb);
    } catch (e) {
      cue('error');
      toast.error('Could not link the AWB', { description: (e as Error).message });
    } finally {
      setBusy(false);
      refocus();
    }
  };

  const move = async (order: Order, status: 'DISPATCHED' | 'NEW', message: string) => {
    setBusy(true);
    try {
      await setStatus.mutateAsync({ id: order.id, status });
      addLog({
        code: order.awb_number ?? order.order_number,
        kind: status === 'NEW' ? 'undone' : 'info',
        message,
        orderId: order.id,
        orderNumber: order.order_number,
        channel: order.sales_channel,
      });
      cue(status === 'NEW' ? 'warn' : 'ok');
      setPending(null);
    } catch (e) {
      cue('error');
      toast.error('Could not update the order', { description: (e as Error).message });
    } finally {
      setBusy(false);
      refocus();
    }
  };

  const dispatchSelected = async () => {
    const targets = ready.filter((o) => selected.has(o.id));
    if (targets.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const order of targets) {
      try {
        await setStatus.mutateAsync({ id: order.id, status: 'DISPATCHED' });
        done += 1;
      } catch (e) {
        toast.error(`Could not dispatch ${order.order_number}`, {
          description: (e as Error).message,
        });
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (done > 0) {
      cue('ok');
      toast.success(`${done} order${done === 1 ? '' : 's'} handed to the courier`);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = ready.length > 0 && ready.every((o) => selected.has(o.id));

  return (
    <div className="space-y-6">
      <ChannelFilter value={channel} onChange={setChannel} counts={channelCounts} />

      <RoleGate
        min="STAFF"
        fallback={
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Scanning and dispatching needs Staff access. You can still see what&apos;s in the queue
            below.
          </p>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Scan to dispatch</h3>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={sound ? 'Mute scan sounds' : 'Unmute scan sounds'}
                    onClick={() => setSound((v) => !v)}
                  >
                    {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant={cameraOn ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setCameraOn((v) => !v)}
                  >
                    {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    {cameraOn ? 'Stop camera' : 'Use camera'}
                  </Button>
                </div>
              </div>

              <form onSubmit={onSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    autoFocus
                    autoComplete="off"
                    className="pl-8 font-mono"
                    placeholder="Scan the AWB / QR code"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={!manualCode.trim() || busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
                </Button>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">
                Matches the AWB, our order number or the channel&apos;s order ID. A USB/Bluetooth
                scanner types the code and presses Enter for you.
              </p>

              {cameraOn ? (
                <div className="mt-3 overflow-hidden rounded-md border bg-black">
                  <video
                    ref={videoRef}
                    className="aspect-square w-full object-cover sm:aspect-video"
                    muted
                    playsInline
                    autoPlay
                  />
                </div>
              ) : null}
              {cameraError ? <p className="mt-2 text-xs text-destructive">{cameraError}</p> : null}
            </div>

            {pending ? (
              <ScanResultCard
                orders={pending.orders}
                matchedBy={pending.matchedBy}
                code={pending.code}
                busy={busy}
                onChoose={(order) => void handleOrder(order, pending.code, pending.matchedBy)}
                onReady={(order, details) => void linkAndReady(order, details)}
                onDispatch={(order) => void move(order, 'DISPATCHED', 'Handed to the courier')}
                onUndo={(order) => void move(order, 'NEW', 'Undone — stock restored')}
              />
            ) : null}
          </div>

          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b p-3">
              <h3 className="text-sm font-medium">Scan log</h3>
              {log.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setLog([])}>
                  Clear
                </Button>
              ) : null}
            </div>
            {log.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Scans appear here. Each successful scan takes that order&apos;s stock out of its
                location.
              </p>
            ) : (
              <ul className="max-h-[26rem] divide-y overflow-y-auto">
                {log.map((entry) => {
                  const { icon: Icon, className } = LOG_STYLE[entry.kind];
                  return (
                    <li key={entry.id} className="flex items-start gap-3 p-3 text-sm">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', className)} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {entry.channel ? <ChannelBadge channel={entry.channel} /> : null}
                          {entry.orderNumber ? (
                            <Link
                              to={`/orders/${entry.orderId}`}
                              className="font-medium hover:underline"
                            >
                              {entry.orderNumber}
                            </Link>
                          ) : null}
                          <span className="text-muted-foreground">{entry.message}</span>
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {entry.code} · {formatDateTime(entry.at.toISOString())}
                        </p>
                      </div>
                      {entry.kind === 'ready' && entry.orderId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const order = orders.find((o) => o.id === entry.orderId);
                            if (order) void move(order, 'NEW', 'Undone — stock restored');
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                          Undo
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </RoleGate>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <PackageCheck className="h-4 w-4" />
          Awaiting dispatch ({awaiting.length})
        </h3>
        {isLoading ? null : awaiting.length === 0 ? (
          <EmptyState title="Nothing waiting to be packed" />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="hidden md:table-cell">Customer</TableHead>
                  <TableHead>AWB</TableHead>
                  <RoleGate min="STAFF">
                    <TableHead className="w-32" />
                  </RoleGate>
                </TableRow>
              </TableHeader>
              <TableBody>
                {awaiting.map((order) => {
                  const canReady = !!order.awb_number && !!order.location_id;
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link to={`/orders/${order.id}`} className="font-medium hover:underline">
                          {order.order_number}
                        </Link>
                        <p className="text-xs text-muted-foreground">{order.external_order_id}</p>
                      </TableCell>
                      <TableCell>
                        <ChannelBadge channel={order.sales_channel} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{order.customer_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {order.awb_number || (
                          <Link
                            to={`/orders/${order.id}`}
                            className="font-sans text-amber-700 hover:underline dark:text-amber-400"
                          >
                            Link AWB
                          </Link>
                        )}
                      </TableCell>
                      <RoleGate min="STAFF">
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canReady || busy}
                            title={canReady ? undefined : 'Needs an AWB and a ship-from location'}
                            onClick={() =>
                              void markReady(order, order.awb_number ?? order.order_number)
                            }
                          >
                            Mark ready
                          </Button>
                        </TableCell>
                      </RoleGate>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Truck className="h-4 w-4" />
            Ready for courier ({ready.length})
            {readyByCourier.length > 0 ? (
              <span className="font-normal text-muted-foreground">
                — {readyByCourier.map(([name, n]) => `${name} ${n}`).join(' · ')}
              </span>
            ) : null}
          </h3>
          <RoleGate min="STAFF">
            <Button
              size="sm"
              disabled={selected.size === 0 || busy}
              onClick={() => void dispatchSelected()}
            >
              <Truck className="h-4 w-4" />
              Mark {selected.size || ''} handed to courier
            </Button>
          </RoleGate>
        </div>
        {isLoading ? null : ready.length === 0 ? (
          <EmptyState title="No parcels are waiting for pickup" />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <RoleGate min="STAFF">
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all"
                        checked={allSelected}
                        onCheckedChange={(checked) =>
                          setSelected(checked ? new Set(ready.map((o) => o.id)) : new Set())
                        }
                      />
                    </TableHead>
                  </RoleGate>
                  <TableHead>Order</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>AWB</TableHead>
                  <TableHead className="hidden sm:table-cell">Courier</TableHead>
                  <TableHead className="hidden md:table-cell">Ready at</TableHead>
                  <RoleGate min="STAFF">
                    <TableHead className="w-24" />
                  </RoleGate>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ready.map((order) => (
                  <TableRow key={order.id}>
                    <RoleGate min="STAFF">
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${order.order_number}`}
                          checked={selected.has(order.id)}
                          onCheckedChange={() => toggle(order.id)}
                        />
                      </TableCell>
                    </RoleGate>
                    <TableCell>
                      <Link to={`/orders/${order.id}`} className="font-medium hover:underline">
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ChannelBadge channel={order.sales_channel} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{order.awb_number}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {order.courier_name || '—'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDateTime(order.ready_at)}
                    </TableCell>
                    <RoleGate min="STAFF">
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void move(order, 'NEW', 'Undone — stock restored')}
                        >
                          <Undo2 className="h-4 w-4" />
                          Undo
                        </Button>
                      </TableCell>
                    </RoleGate>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
