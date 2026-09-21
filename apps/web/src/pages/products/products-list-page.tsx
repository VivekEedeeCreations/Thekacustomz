import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Package, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PRODUCT_TYPE_LABELS } from '@inventory/shared';

import { ActiveBadge } from '@/components/active-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  useAllVariants,
  useProducts,
  type Product,
  type ProductVariant,
} from '@/features/products/queries';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { InheritedValue } from './inherited-value';
import { VariantBulkBar } from './variant-bulk-bar';

const ALL = '__all__';

function variantMatches(variant: ProductVariant, term: string) {
  return [variant.sku, variant.name, variant.size, variant.color, variant.design].some((value) =>
    value?.toLowerCase().includes(term),
  );
}

export function ProductsListPage() {
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();
  const { data: allVariants } = useAllVariants();
  const { data: categories } = useCategories();
  const deleteProduct = useDeleteProduct();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const categoryName = useMemo(() => {
    const map = new Map((categories ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? '—') : '—');
  }, [categories]);

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const variant of allVariants ?? []) {
      const list = map.get(variant.product_id);
      if (list) list.push(variant);
      else map.set(variant.product_id, [variant]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sku.localeCompare(b.sku));
    return map;
  }, [allVariants]);

  /**
   * Products to show, each with the variants to list under it. A search that only hits a
   * variant (say, its size or SKU) keeps the parent visible with just the matching variants
   * and opens it, so the match isn't hidden inside a collapsed row.
   */
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).flatMap((product) => {
      if (categoryFilter !== ALL && product.category_id !== categoryFilter) return [];
      const variants = variantsByProduct.get(product.id) ?? [];
      if (!term) return [{ product, variants, autoOpen: false }];

      const productMatches =
        product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term);
      if (productMatches) return [{ product, variants, autoOpen: false }];

      const matching = variants.filter((v) => variantMatches(v, term));
      return matching.length > 0 ? [{ product, variants: matching, autoOpen: true }] : [];
    });
  }, [products, variantsByProduct, search, categoryFilter]);

  const expandableIds = rows.filter((r) => r.variants.length > 0).map((r) => r.product.id);
  const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => expanded.has(id));

  const toggleExpanded = (productId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(productId)) next.add(productId);
      return next;
    });

  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(expandableIds));

  const setSelection = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  // Drop ids of variants that no longer exist (deleted elsewhere) before acting on them.
  const knownVariantIds = useMemo(
    () => new Set((allVariants ?? []).map((v) => v.id)),
    [allVariants],
  );
  const selectedIds = [...selected].filter((id) => knownVariantIds.has(id));

  return (
    <div>
      <PageHeader
        title="Products"
        description="Parent products with their variants — expand a product to see its variants."
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
            placeholder="Search product or variant: name, SKU, size, color"
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
        {expandableIds.length > 0 ? (
          <Button variant="outline" onClick={toggleAll} className="sm:ml-auto">
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        ) : null}
      </div>

      <VariantBulkBar selectedIds={selectedIds} onClear={() => setSelected(new Set())} />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Package} title="No products found" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24" />
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
              {rows.map(({ product, variants, autoOpen }) => {
                const isOpen = variants.length > 0 && (autoOpen || expanded.has(product.id));
                const variantIds = variants.map((v) => v.id);
                const selectedCount = variantIds.filter((id) => selected.has(id)).length;
                const groupState =
                  selectedCount === 0
                    ? false
                    : selectedCount === variantIds.length
                      ? true
                      : ('indeterminate' as const);

                return (
                  <Fragment key={product.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => navigate(`/products/${product.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {variants.length > 0 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? 'Collapse' : 'Expand'} variants of ${product.name}`}
                              onClick={() => toggleExpanded(product.id)}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <span className="inline-block h-7 w-7" />
                          )}
                          {variants.length > 0 ? (
                            <RoleGate min="STAFF">
                              <Checkbox
                                aria-label={`Select all variants of ${product.name}`}
                                checked={groupState}
                                onCheckedChange={(checked) =>
                                  setSelection(variantIds, checked === true)
                                }
                              />
                            </RoleGate>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                      <TableCell className="font-medium">
                        {product.name}
                        {variants.length > 0 ? (
                          <Badge variant="secondary" className="ml-2">
                            {variants.length} variant{variants.length === 1 ? '' : 's'}
                          </Badge>
                        ) : null}
                      </TableCell>
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

                    {isOpen ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={9} className="p-0">
                          <Table className="text-xs">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-24" />
                                <TableHead>Variant SKU</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Color</TableHead>
                                <TableHead>Design</TableHead>
                                <TableHead>HSN/SAC</TableHead>
                                <TableHead>Cost</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {variants.map((variant) => (
                                <TableRow
                                  key={variant.id}
                                  className={cn(
                                    'cursor-pointer',
                                    selected.has(variant.id) && 'bg-primary/5',
                                  )}
                                  onClick={() => navigate(`/products/${product.id}`)}
                                >
                                  <TableCell className="pl-10" onClick={(e) => e.stopPropagation()}>
                                    <RoleGate min="STAFF">
                                      <Checkbox
                                        aria-label={`Select variant ${variant.sku}`}
                                        checked={selected.has(variant.id)}
                                        onCheckedChange={(checked) =>
                                          setSelection([variant.id], checked === true)
                                        }
                                      />
                                    </RoleGate>
                                  </TableCell>
                                  <TableCell className="font-mono">{variant.sku}</TableCell>
                                  <TableCell>{variant.size || '—'}</TableCell>
                                  <TableCell>{variant.color || '—'}</TableCell>
                                  <TableCell>{variant.design || '—'}</TableCell>
                                  <TableCell>
                                    <InheritedValue
                                      own={variant.hsn_sac_code}
                                      inherited={product.hsn_sac_code}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <InheritedValue
                                      own={
                                        variant.cost_price != null
                                          ? formatCurrency(variant.cost_price)
                                          : null
                                      }
                                      inherited={formatCurrency(product.cost_price)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <InheritedValue
                                      own={
                                        variant.selling_price != null
                                          ? formatCurrency(variant.selling_price)
                                          : null
                                      }
                                      inherited={formatCurrency(product.selling_price)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <ActiveBadge active={variant.is_active} />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
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
