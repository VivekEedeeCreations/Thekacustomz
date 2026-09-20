import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PRODUCT_TYPE_LABELS } from '@inventory/shared';

import { ActiveBadge } from '@/components/active-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { useCategories } from '@/features/categories/queries';
import { useDeleteProduct } from '@/features/products/mutations';
import { useProducts, type Product } from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';

const ALL = '__all__';

export function ProductsListPage() {
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();
  const { data: categories } = useCategories();
  const deleteProduct = useDeleteProduct();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const categoryName = useMemo(() => {
    const map = new Map((categories ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? '—') : '—');
  }, [categories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (categoryFilter !== ALL && p.category_id !== categoryFilter) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
    });
  }, [products, search, categoryFilter]);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Finished goods and raw materials in your catalog."
        actions={
          <RoleGate min="STAFF">
            <Button size="sm" onClick={() => navigate('/products/new')}>
              <Plus className="h-4 w-4" />
              New product
            </Button>
          </RoleGate>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or SKU"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="No products found" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <RoleGate min="ADMIN">
                  <TableHead className="w-12" />
                </RoleGate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => (
                <TableRow
                  key={product.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/products/${product.id}`)}
                >
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {categoryName(product.category_id)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{PRODUCT_TYPE_LABELS[product.product_type]}</Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(product.cost_price)}</TableCell>
                  <TableCell>{formatCurrency(product.selling_price)}</TableCell>
                  <TableCell>
                    <ActiveBadge active={product.is_active} />
                  </TableCell>
                  <RoleGate min="ADMIN">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => setPendingDelete(product)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </RoleGate>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete product?"
        description={`"${pendingDelete?.name}" and its variants/barcodes/images will be removed. This is blocked if it has inventory history.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteProduct.mutateAsync(pendingDelete.id);
            toast.success('Product deleted');
          } catch (error) {
            toast.error('Could not delete product', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
