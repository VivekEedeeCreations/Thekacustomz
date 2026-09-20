import { useMemo, useState } from 'react';
import { AlertTriangle, Warehouse } from 'lucide-react';
import { MOVEMENT_TYPE_LABELS } from '@inventory/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInventory, useInventoryMovements } from '@/features/inventory/queries';
import { useLocations } from '@/features/locations/queries';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { useVendors } from '@/features/vendors/queries';
import { formatDateTime, formatQuantity } from '@/lib/format';

import { AddMovementDialog } from './add-movement-dialog';

const ALL = '__all__';

export function InventoryPage() {
  const { data: inventory, isLoading } = useInventory();
  const { data: movements, isLoading: movementsLoading } = useInventoryMovements();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: locations } = useLocations();
  const { data: vendors } = useVendors();
  const [locationFilter, setLocationFilter] = useState(ALL);

  const productName = useMemo(() => {
    const map = new Map((products ?? []).map((p) => [p.id, p]));
    return (id: string) => map.get(id);
  }, [products]);
  const variantLabel = useMemo(() => {
    const map = new Map((variants ?? []).map((v) => [v.id, v]));
    return (id: string | null) => (id ? (map.get(id)?.sku ?? null) : null);
  }, [variants]);
  const locationName = useMemo(() => {
    const map = new Map((locations ?? []).map((l) => [l.id, l.name]));
    return (id: string) => map.get(id) ?? '—';
  }, [locations]);
  const vendorName = useMemo(() => {
    const map = new Map((vendors ?? []).map((v) => [v.id, v.company_name]));
    return (id: string | null) => (id ? (map.get(id) ?? '—') : null);
  }, [vendors]);

  const rows = useMemo(() => {
    return (inventory ?? []).filter(
      (row) => locationFilter === ALL || row.location_id === locationFilter,
    );
  }, [inventory, locationFilter]);

  const isLowStock = (productId: string, quantity: number) => {
    const min = productName(productId)?.minimum_stock_level ?? 0;
    return min > 0 && quantity <= min;
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="On-hand stock is derived from the movement ledger — it's never edited directly."
        actions={
          <RoleGate min="STAFF">
            <AddMovementDialog />
          </RoleGate>
        }
      />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movement history</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="mb-4">
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All locations</SelectItem>
                {locations?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="No stock recorded yet"
              description='Use "Add inventory" to record an opening balance.'
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Reserved</TableHead>
                    <TableHead>Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const product = productName(row.product_id);
                    const low = isLowStock(row.product_id, row.quantity);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {product?.name ?? row.product_id}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {variantLabel(row.variant_id) ?? '—'}
                        </TableCell>
                        <TableCell>{locationName(row.location_id)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {formatQuantity(row.quantity)}
                            {low ? (
                              <Badge variant="warning" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Low
                              </Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatQuantity(row.reserved_quantity)}
                        </TableCell>
                        <TableCell>{formatQuantity(row.available_quantity)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="movements">
          {movementsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !movements || movements.length === 0 ? (
            <EmptyState title="No movements yet" />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(m.occurred_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {productName(m.product_id)?.name ?? m.product_id}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {variantLabel(m.variant_id) ?? '—'}
                      </TableCell>
                      <TableCell>{locationName(m.location_id)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{MOVEMENT_TYPE_LABELS[m.movement_type]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vendorName(m.vendor_id) ?? '—'}
                      </TableCell>
                      <TableCell
                        className={m.quantity < 0 ? 'text-destructive' : 'text-emerald-600'}
                      >
                        {m.quantity > 0 ? '+' : ''}
                        {formatQuantity(m.quantity)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">
                        {m.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
