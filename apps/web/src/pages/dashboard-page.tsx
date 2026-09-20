import { useMemo } from 'react';
import { AlertTriangle, MapPin, Package, Tags, Truck } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useCategories } from '@/features/categories/queries';
import { useInventory } from '@/features/inventory/queries';
import { useLocations } from '@/features/locations/queries';
import { useProducts } from '@/features/products/queries';
import { useVendors } from '@/features/vendors/queries';
import { formatQuantity } from '@/lib/format';

function StatCard({
  label,
  value,
  icon: Icon,
  isLoading,
}: {
  label: string;
  value: number;
  icon: typeof Package;
  isLoading: boolean;
}) {
  return (
    <Card>
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
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: vendors, isLoading: vendorsLoading } = useVendors();
  const { data: locations, isLoading: locationsLoading } = useLocations();
  const { data: inventory, isLoading: inventoryLoading } = useInventory();

  const productById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const locationById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations]);

  const lowStock = useMemo(() => {
    return (inventory ?? [])
      .map((row) => ({ row, product: productById.get(row.product_id) }))
      .filter(
        ({ row, product }) =>
          product && product.minimum_stock_level > 0 && row.quantity <= product.minimum_stock_level,
      );
  }, [inventory, productById]);

  return (
    <div>
      <PageHeader
        title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        description="An overview of your catalog and stock."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Products"
          value={products?.length ?? 0}
          icon={Package}
          isLoading={productsLoading}
        />
        <StatCard
          label="Categories"
          value={categories?.length ?? 0}
          icon={Tags}
          isLoading={categoriesLoading}
        />
        <StatCard
          label="Vendors"
          value={vendors?.length ?? 0}
          icon={Truck}
          isLoading={vendorsLoading}
        />
        <StatCard
          label="Locations"
          value={locations?.length ?? 0}
          icon={MapPin}
          isLoading={locationsLoading}
        />
      </div>

      <div className="mt-8">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Low stock
        </h3>
        {inventoryLoading || productsLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : lowStock.length === 0 ? (
          <EmptyState title="Nothing is low on stock right now" />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Minimum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map(({ row, product }) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{product?.name}</TableCell>
                    <TableCell>{locationById.get(row.location_id)?.name ?? '—'}</TableCell>
                    <TableCell className="text-destructive">
                      {formatQuantity(row.quantity)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatQuantity(product?.minimum_stock_level)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
