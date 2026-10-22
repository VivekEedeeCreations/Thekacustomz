import { useMemo, useState } from 'react';
import { Paperclip, Plus, Receipt, Search } from 'lucide-react';
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from '@inventory/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
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
import { useLocations } from '@/features/locations/queries';
import { buildItemOptions } from '@/features/products/item-options';
import { useAllVariants, useProducts } from '@/features/products/queries';
import {
  usePurchaseDocuments,
  usePurchases,
  type Purchase,
  type PurchaseDocument,
} from '@/features/purchases/queries';
import { useVendors } from '@/features/vendors/queries';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency, formatDate } from '@/lib/format';

import { PurchaseDetailDialog } from './purchase-detail-dialog';
import { RecordPurchaseDialog } from './record-purchase-dialog';

const ALL = 'ALL';

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Not received',
  PARTIALLY_RECEIVED: 'Partly received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
};

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const variant =
    status === 'RECEIVED' || status === 'CLOSED'
      ? 'success'
      : status === 'CANCELLED'
        ? 'destructive'
        : 'outline';
  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
}

export function PurchasesPage() {
  const { hasRole } = useAuth();
  const isStaff = hasRole('STAFF');
  const { data: purchases, isLoading } = usePurchases();
  const { data: vendors } = useVendors();
  const { data: locations } = useLocations();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  // Bills are STAFF+ only (RLS); viewers simply see no attachment counts.
  const { data: documents } = usePurchaseDocuments();

  const [recordOpen, setRecordOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [vendorFilter, setVendorFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState('');

  const vendorName = useMemo(() => {
    const map = new Map((vendors ?? []).map((v) => [v.id, v.company_name]));
    return (id: string) => map.get(id) ?? 'Unknown vendor';
  }, [vendors]);
  const locationName = useMemo(() => {
    const map = new Map((locations ?? []).map((l) => [l.id, l.name]));
    return (id: string | null) => (id ? (map.get(id) ?? '') : '');
  }, [locations]);
  const optionByKey = useMemo(
    () => new Map(buildItemOptions(products ?? [], variants ?? []).map((o) => [o.key, o])),
    [products, variants],
  );
  const docsByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseDocument[]>();
    for (const d of documents ?? []) {
      const list = map.get(d.purchase_order_id);
      if (list) list.push(d);
      else map.set(d.purchase_order_id, [d]);
    }
    return map;
  }, [documents]);

  const term = search.trim().toLowerCase();
  const visible = (purchases ?? []).filter((p: Purchase) => {
    if (vendorFilter !== ALL && p.vendor_id !== vendorFilter) return false;
    if (statusFilter !== ALL && p.status !== statusFilter) return false;
    if (!term) return true;
    return [p.po_number, p.vendor_bill_number, vendorName(p.vendor_id), p.notes].some((v) =>
      v?.toLowerCase().includes(term),
    );
  });
  const visibleTotal = visible.reduce((sum, p) => sum + p.total_amount, 0);
  const openPurchase = (purchases ?? []).find((p) => p.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Vendor bills: what you bought, what it cost, and a photo of the bill."
        actions={
          <RoleGate min="STAFF">
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" />
              Record purchase
            </Button>
          </RoleGate>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bill no., PO no., vendor, notes"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All vendors</SelectItem>
            {(vendors ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PurchaseOrderStatus | typeof ALL)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PURCHASE_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={purchases?.length ? 'No purchases match these filters' : 'No purchases yet'}
          description={
            purchases?.length ? undefined : 'Record a vendor bill to track costs and add stock.'
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Bill no.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {isStaff ? <TableHead className="w-16 text-center">Bill</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => {
                const docs = docsByPurchase.get(p.id)?.length ?? 0;
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setOpenId(p.id)}>
                    <TableCell className="whitespace-nowrap">{formatDate(p.order_date)}</TableCell>
                    <TableCell className="font-medium">
                      {vendorName(p.vendor_id)}
                      <span className="block font-mono text-xs font-normal text-muted-foreground">
                        {p.po_number}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.vendor_bill_number || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.total_amount)}
                    </TableCell>
                    {isStaff ? (
                      <TableCell className="text-center">
                        {docs > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Paperclip className="h-3.5 w-3.5" />
                            {docs}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-2 text-right text-sm">
            {visible.length} purchase{visible.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold">{formatCurrency(visibleTotal)}</span>
          </p>
        </div>
      )}

      <RecordPurchaseDialog open={recordOpen} onOpenChange={setRecordOpen} />

      <PurchaseDetailDialog
        purchase={openPurchase}
        vendorName={openPurchase ? vendorName(openPurchase.vendor_id) : ''}
        locationName={openPurchase ? locationName(openPurchase.location_id) : ''}
        documents={openPurchase ? (docsByPurchase.get(openPurchase.id) ?? []) : []}
        optionByKey={optionByKey}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </div>
  );
}
