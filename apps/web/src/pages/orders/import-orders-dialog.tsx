import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { SALES_CHANNEL_LABELS, type TablesInsert } from '@inventory/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchExistingOrderKeys, useImportOrders, useSkuAliases } from '@/features/orders/import';
import { buildItemOptions, itemKey, parseItemKey } from '@/features/products/item-options';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';
import { groupOrders, readOrderCsv, type ImportOrder, type ParsedCsv } from '@/lib/order-csv';

/** Mapping choice meaning "don't import lines with this SKU". */
const SKIP = '__skip__';

interface Loaded {
  fileName: string;
  parsed: ParsedCsv;
  orders: ImportOrder[];
  existing: Set<string>;
}

const orderKey = (o: ImportOrder) => `${o.channel}|${o.externalOrderId.toLowerCase()}`;

export function ImportOrdersDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    created: number;
    failures: { label: string; message: string }[];
    aliasError: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: aliases } = useSkuAliases();
  const importOrders = useImportOrders();

  const options = useMemo(
    () => buildItemOptions(products ?? [], variants ?? []),
    [products, variants],
  );

  // Catalog SKUs first, then remembered aliases (an alias wins when both exist).
  const knownKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of options) map.set(o.sku.toLowerCase(), o.key);
    for (const a of aliases ?? []) {
      map.set(a.external_key.toLowerCase(), itemKey(a.product_id, a.variant_id));
    }
    return map;
  }, [options, aliases]);

  const resolve = (matchKey: string): string | undefined => {
    const lower = matchKey.toLowerCase();
    return mapping[lower] || knownKeys.get(lower);
  };

  const newOrders = useMemo(
    () => (loaded ? loaded.orders.filter((o) => !loaded.existing.has(orderKey(o))) : []),
    [loaded],
  );

  // Unknown SKUs across the orders that would be imported, with an example and a count.
  const unknown = useMemo(() => {
    const map = new Map<string, { matchKey: string; label: string; lines: number }>();
    for (const order of newOrders) {
      for (const line of order.lines) {
        const lower = line.matchKey.toLowerCase();
        if (knownKeys.has(lower)) continue;
        const entry = map.get(lower);
        if (entry) entry.lines += line.quantity;
        else map.set(lower, { matchKey: line.matchKey, label: line.label, lines: line.quantity });
      }
    }
    return [...map.values()].sort((a, b) => b.lines - a.lines);
  }, [newOrders, knownKeys]);

  const plan = useMemo(() => {
    const ready: ImportOrder[] = [];
    let waiting = 0;
    let allSkipped = 0;
    for (const order of newOrders) {
      const targets = order.lines.map((l) => resolve(l.matchKey));
      if (targets.some((t) => !t)) waiting += 1;
      else if (targets.every((t) => t === SKIP)) allSkipped += 1;
      else ready.push(order);
    }
    return { ready, waiting, allSkipped };
    // resolve depends on mapping + knownKeys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOrders, mapping, knownKeys]);

  const reset = () => {
    setLoaded(null);
    setMapping({});
    setProgress(0);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setLoading(true);
    try {
      const parsed = readOrderCsv(await file.text());
      const orders = groupOrders(parsed.rows);
      const existing = orders.length > 0 ? await fetchExistingOrderKeys(orders) : new Set<string>();
      setLoaded({ fileName: file.name, parsed, orders, existing });
    } catch (error) {
      toast.error('Could not read the file', { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!loaded) return;
    const aliasRows: TablesInsert<'sku_aliases'>[] = remember
      ? unknown.flatMap((u) => {
          const choice = mapping[u.matchKey.toLowerCase()];
          if (!choice || choice === SKIP) return [];
          const { productId, variantId } = parseItemKey(choice);
          return [{ external_key: u.matchKey, product_id: productId, variant_id: variantId }];
        })
      : [];

    const payload = plan.ready.map((order) => ({
      label: `${SALES_CHANNEL_LABELS[order.channel]} ${order.externalOrderId}`,
      header: {
        sales_channel: order.channel,
        external_order_id: order.externalOrderId,
        order_date: order.orderDate,
        customer_name: order.customerName || undefined,
        shipping_address: order.shippingAddress || undefined,
        notes: order.notes,
      },
      items: order.lines.flatMap((line) => {
        const target = resolve(line.matchKey);
        if (!target || target === SKIP) return [];
        const { productId, variantId } = parseItemKey(target);
        return [
          {
            product_id: productId,
            variant_id: variantId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            tax_rate: 0,
          },
        ];
      }),
    }));

    setProgress(0);
    try {
      const outcome = await importOrders.mutateAsync({
        aliases: aliasRows,
        orders: payload,
        onProgress: setProgress,
      });
      setResult(outcome);
      if (outcome.created > 0) toast.success(`Imported ${outcome.created} orders`);
      if (outcome.failures.length > 0) toast.error(`${outcome.failures.length} orders failed`);
    } catch (error) {
      toast.error('Import failed', { description: (error as Error).message });
    }
  };

  const busy = loading || importOrders.isPending;
  const totalRows = loaded ? loaded.parsed.rows.length + loaded.parsed.rowErrors.length : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import orders from CSV</DialogTitle>
          <DialogDescription>
            One row per order line; rows with the same order id become one order. Orders come in as
            New, and orders already in the app (same channel + order id) are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {loaded ? 'Choose another file' : 'Choose CSV file'}
            </Button>
            {loaded ? (
              <span className="text-sm text-muted-foreground">{loaded.fileName}</span>
            ) : null}
          </div>

          {loaded?.parsed.fileError ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {loaded.parsed.fileError}
            </p>
          ) : null}

          {loaded && !loaded.parsed.fileError ? (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{totalRows} rows</Badge>
                <Badge variant="secondary">{loaded.orders.length} orders in file</Badge>
                {loaded.existing.size > 0 ? (
                  <Badge variant="outline">
                    {loaded.orders.length - newOrders.length} already imported — skipped
                  </Badge>
                ) : null}
                {loaded.parsed.rowErrors.length > 0 ? (
                  <Badge variant="destructive">
                    {loaded.parsed.rowErrors.length} rows unreadable
                  </Badge>
                ) : null}
              </div>

              {loaded.parsed.rowErrors.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Show unreadable rows
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {loaded.parsed.rowErrors.slice(0, 50).map((e) => (
                      <li key={e.line}>
                        Line {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {unknown.length > 0 ? (
                <div className="space-y-2">
                  <div>
                    <h3 className="text-sm font-medium">
                      Match {unknown.length} SKU{unknown.length === 1 ? '' : 's'} to your catalog
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      These aren&apos;t catalog SKUs yet. Pick the product or variant each one is,
                      or skip those lines. Orders wait until all their lines are matched or skipped.
                    </p>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {unknown.map((u) => {
                      const lower = u.matchKey.toLowerCase();
                      return (
                        <div
                          key={lower}
                          className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 flex-1 text-sm">
                            <span className="font-mono text-xs">
                              {u.matchKey.startsWith('item:') ? 'No SKU' : u.matchKey}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {u.label} · {u.lines} unit{u.lines === 1 ? '' : 's'}
                            </span>
                          </div>
                          <Select
                            value={mapping[lower] ?? ''}
                            onValueChange={(value) =>
                              setMapping((prev) => ({ ...prev, [lower]: value }))
                            }
                          >
                            <SelectTrigger className="sm:w-80" aria-label={`Match ${u.matchKey}`}>
                              <SelectValue placeholder="Choose catalog item…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SKIP}>Skip these lines</SelectItem>
                              {options.map((o) => (
                                <SelectItem key={o.key} value={o.key}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember-sku-mappings"
                      checked={remember}
                      onCheckedChange={(v) => setRemember(v === true)}
                    />
                    <Label htmlFor="remember-sku-mappings" className="text-sm font-normal">
                      Remember these matches for future imports
                    </Label>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border p-3 text-sm">
                <p>
                  <span className="font-medium">{plan.ready.length}</span> orders ready to import (
                  {plan.ready.reduce((n, o) => n + o.lines.length, 0)} lines,{' '}
                  {formatCurrency(
                    plan.ready.reduce(
                      (sum, o) => sum + o.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
                      0,
                    ),
                  )}
                  ).
                </p>
                {plan.waiting > 0 ? (
                  <p className="text-muted-foreground">
                    {plan.waiting} waiting on SKU matches above.
                  </p>
                ) : null}
                {plan.allSkipped > 0 ? (
                  <p className="text-muted-foreground">
                    {plan.allSkipped} have every line skipped and won&apos;t be created.
                  </p>
                ) : null}
              </div>

              {importOrders.isPending ? (
                <p className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing {progress} / {plan.ready.length}…
                </p>
              ) : null}

              {result ? (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Created {result.created} order{result.created === 1 ? '' : 's'}
                  </p>
                  {result.aliasError ? (
                    <p className="text-destructive">
                      SKU matches weren&apos;t saved: {result.aliasError}
                    </p>
                  ) : null}
                  {result.failures.length > 0 ? (
                    <ul className="space-y-1 text-xs text-destructive">
                      {result.failures.map((f) => (
                        <li key={f.label}>
                          {f.label}: {f.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter>
          {result ? (
            <Button
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Done
            </Button>
          ) : (
            <Button
              onClick={() => void runImport()}
              disabled={!loaded || plan.ready.length === 0 || busy}
            >
              {importOrders.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Import {plan.ready.length} order{plan.ready.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
