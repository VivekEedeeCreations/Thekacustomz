import { Fragment, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useDeleteFbaTargets } from '@/features/fba-targets/mutations';
import { useFbaCategoryDefaults, type FbaTarget } from '@/features/fba-targets/queries';
import { itemKey } from '@/features/products/item-options';
import { formatCurrency, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SortDirection } from '@/lib/variant-sort';

import { FbaBulkAddDialog } from './fba-bulk-add-dialog';
import { FbaBulkEditDialog, FbaCategoryDefaultDialog } from './fba-cost-dialogs';
import { useFbaData } from './fba-data';
import { FbaTargetDialog } from './fba-target-dialog';

interface MaterialNeed {
  key: string;
  label: string;
  perUnit: number;
  needed: number;
  inStock: number;
  short: number;
  /** Catalog cost price × quantity needed. */
  cost: number;
}

/** Where a SKU's cost or price came from, in priority order. */
type Source = 'own' | 'calculation' | 'category';
const SOURCE_LABEL: Record<Source, string> = {
  own: 'set on SKU',
  calculation: 'calculation',
  category: 'category default',
};

type SortKey = 'sku' | 'category' | 'qty' | 'cost' | 'price' | 'total' | 'materials';

function ShortBadge({ short }: { short: number }) {
  return short > 0 ? (
    <Badge variant="destructive">Short {formatQuantity(short)}</Badge>
  ) : (
    <Badge variant="success">Enough</Badge>
  );
}

function SortHead({
  label,
  column,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: SortDirection } | null;
  onSort: (column: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === column ? sort.direction : null;
  const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      className={align === 'right' ? 'text-right' : undefined}
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted',
          align === 'right' ? '-mr-2' : '-ml-2',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} />
      </button>
    </TableHead>
  );
}

function SourcedMoney({ value, source }: { value: number | null; source: Source | null }) {
  if (value == null || !source) {
    return <span className="text-xs text-muted-foreground">Not set</span>;
  }
  return (
    <>
      {formatCurrency(value)}
      <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[source]}</span>
    </>
  );
}

export function FbaTargetsPage() {
  const data = useFbaData();
  const deleteTargets = useDeleteFbaTargets();
  const { data: categories } = useCategories();
  const { data: categoryDefaults } = useFbaCategoryDefaults();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<FbaTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<{
    id: string;
    name: string;
    unitCost: number | null;
    unitPrice: number | null;
    targetIds: string[];
  } | null>(null);
  /** Targets waiting for "remove?" confirmation — one from a row's bin, or the ticked ones. */
  const [pendingDelete, setPendingDelete] = useState<FbaTarget[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

  const categoryName = useMemo(() => {
    const names = new Map((categories ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id && names.get(id)) || 'Uncategorized';
  }, [categories]);
  const defaultByCategory = useMemo(
    () => new Map((categoryDefaults ?? []).map((d) => [d.category_id, d])),
    [categoryDefaults],
  );

  const rows = useMemo(
    () =>
      data.targets.map((target) => {
        const option = data.optionByKey.get(itemKey(target.product_id, target.variant_id));
        const needs: MaterialNeed[] = (data.materialsByTarget.get(target.id) ?? []).map((m) => {
          const key = itemKey(m.material_product_id, m.material_variant_id);
          const material = data.optionByKey.get(key);
          const needed = m.quantity_per_unit * target.target_quantity;
          const inStock = data.stockByKey.get(key) ?? 0;
          return {
            key,
            label: material?.label ?? 'Unknown material',
            perUnit: m.quantity_per_unit,
            needed,
            inStock,
            short: Math.max(0, needed - inStock),
            cost: (material?.costPrice ?? 0) * needed,
          };
        });
        const linked = target.pricing_calculation_id
          ? data.calculationById.get(target.pricing_calculation_id)
          : undefined;
        const categoryId = option?.product.category_id ?? null;
        const fallback = categoryId ? defaultByCategory.get(categoryId) : undefined;

        // Own value → linked calculation → category default.
        const cost: { value: number | null; source: Source | null } =
          target.unit_cost != null
            ? { value: target.unit_cost, source: 'own' }
            : linked
              ? { value: linked.unitCost, source: 'calculation' }
              : fallback?.unit_cost != null
                ? { value: fallback.unit_cost, source: 'category' }
                : { value: null, source: null };
        const price: { value: number | null; source: Source | null } =
          target.unit_price != null
            ? { value: target.unit_price, source: 'own' }
            : linked?.breakdown
              ? { value: linked.breakdown.sellingPrice, source: 'calculation' }
              : fallback?.unit_price != null
                ? { value: fallback.unit_price, source: 'category' }
                : { value: null, source: null };

        return {
          target,
          option,
          needs,
          categoryId,
          category: categoryName(categoryId),
          cost,
          price,
          totalCost: cost.value != null ? cost.value * target.target_quantity : null,
          totalValue: price.value != null ? price.value * target.target_quantity : null,
          shortCount: needs.filter((n) => n.short > 0).length,
        };
      }),
    [
      data.targets,
      data.optionByKey,
      data.materialsByTarget,
      data.stockByKey,
      data.calculationById,
      defaultByCategory,
      categoryName,
    ],
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const value = (r: (typeof rows)[number]): string | number | null => {
      switch (sort.key) {
        case 'sku':
          return r.option?.label ?? '';
        case 'category':
          return r.category;
        case 'qty':
          return r.target.target_quantity;
        case 'cost':
          return r.cost.value;
        case 'price':
          return r.price.value;
        case 'total':
          return r.totalCost;
        case 'materials':
          return r.needs.length === 0 ? null : r.shortCount;
      }
    };
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      // Missing values last, whichever direction.
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const result =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? result : -result;
    });
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key !== key
        ? { key, direction: 'asc' }
        : prev.direction === 'asc'
          ? { key, direction: 'desc' }
          : null,
    );

  // Raw materials across every target, so shortfalls are counted against shared stock once.
  const summary = useMemo(() => {
    const map = new Map<string, MaterialNeed>();
    for (const { needs } of rows) {
      for (const n of needs) {
        const current = map.get(n.key);
        if (current) {
          current.needed += n.needed;
          current.cost += n.cost;
        } else {
          map.set(n.key, { ...n, perUnit: 0 });
        }
      }
    }
    return [...map.values()]
      .map((n) => ({ ...n, short: Math.max(0, n.needed - n.inStock) }))
      .sort((a, b) => b.short - a.short || a.label.localeCompare(b.label));
  }, [rows]);

  const totals = rows.reduce(
    (acc, r) => ({
      units: acc.units + r.target.target_quantity,
      cost: acc.cost + (r.totalCost ?? 0),
      value: acc.value + (r.totalValue ?? 0),
      noCost: acc.noCost + (r.totalCost == null ? 1 : 0),
      noPrice: acc.noPrice + (r.totalValue == null ? 1 : 0),
    }),
    { units: 0, cost: 0, value: 0, noCost: 0, noPrice: 0 },
  );

  // Per category of the finished product, biggest first.
  const byCategory = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string | null;
        name: string;
        targetIds: string[];
        units: number;
        cost: number;
        value: number;
        noCost: number;
      }
    >();
    for (const r of rows) {
      const key = r.categoryId ?? '';
      const row = map.get(key) ?? {
        id: r.categoryId,
        name: r.category,
        targetIds: [],
        units: 0,
        cost: 0,
        value: 0,
        noCost: 0,
      };
      row.targetIds.push(r.target.id);
      row.units += r.target.target_quantity;
      row.cost += r.totalCost ?? 0;
      row.value += r.totalValue ?? 0;
      if (r.totalCost == null) row.noCost += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  }, [rows]);

  const openDialog = (target: FbaTarget | null) => {
    setEditing(target);
    setDialogOpen(true);
  };

  const targetIds = rows.map((r) => r.target.id);
  const selectedTargets = rows.filter((r) => selected.has(r.target.id)).map((r) => r.target);
  const allState =
    selectedTargets.length === 0
      ? false
      : selectedTargets.length === targetIds.length
        ? true
        : ('indeterminate' as const);
  const setSelection = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const labelOf = (t: FbaTarget) =>
    data.optionByKey.get(itemKey(t.product_id, t.variant_id))?.label ?? 'this SKU';

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const margin = totals.value > 0 ? ((totals.value - totals.cost) / totals.value) * 100 : null;

  return (
    <div>
      <PageHeader
        title="FBA targets"
        description="Finished SKUs to send to Amazon FBA, the raw materials they need, and what it all costs."
        actions={
          <RoleGate min="STAFF">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <ListPlus className="h-4 w-4" />
              Add multiple SKUs
            </Button>
            <Button size="sm" onClick={() => openDialog(null)}>
              <Plus className="h-4 w-4" />
              Add SKU
            </Button>
          </RoleGate>
        }
      />

      {data.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No FBA targets yet"
          description="Add a finished SKU you want to ship to an Amazon FBA warehouse."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">SKUs · units to ship</p>
              <p className="text-2xl font-semibold">
                {rows.length} · {formatQuantity(totals.units)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Total cost</p>
              <p className="text-2xl font-semibold">{formatCurrency(totals.cost)}</p>
              {totals.noCost > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {totals.noCost} SKU{totals.noCost === 1 ? '' : 's'} without a cost not included
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Total value at selling price</p>
              <p className="text-2xl font-semibold">{formatCurrency(totals.value)}</p>
              {totals.noPrice > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {totals.noPrice} SKU{totals.noPrice === 1 ? '' : 's'} without a price not included
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Gross margin</p>
              <p
                className={cn(
                  'text-2xl font-semibold',
                  margin != null && margin < 0 && 'text-destructive',
                )}
              >
                {margin != null ? `${margin.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(totals.value - totals.cost)} before GST and fees
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">By category</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Set a default cost and price per category; it applies to every SKU in that category
              that has no cost/price of its own and no linked calculation.
            </p>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">SKUs</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Default cost</TableHead>
                    <TableHead className="text-right">Default price</TableHead>
                    <TableHead className="text-right">Total cost</TableHead>
                    <TableHead className="text-right">Total value</TableHead>
                    <RoleGate min="STAFF">
                      <TableHead className="w-12" />
                    </RoleGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCategory.map((c) => {
                    const defaults = c.id ? defaultByCategory.get(c.id) : undefined;
                    return (
                      <TableRow key={c.id ?? '__none__'}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.targetIds.length}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatQuantity(c.units)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totals.units > 0
                            ? `${Math.round((c.units / totals.units) * 100)}%`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {defaults?.unit_cost != null ? formatCurrency(defaults.unit_cost) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {defaults?.unit_price != null ? formatCurrency(defaults.unit_price) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(c.cost)}
                          {c.noCost > 0 ? (
                            <span className="block text-xs text-muted-foreground">
                              {c.noCost} without cost
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(c.value)}</TableCell>
                        <RoleGate min="STAFF">
                          <TableCell>
                            {c.id ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Set cost and price for ${c.name}`}
                                onClick={() =>
                                  setCategoryEditing({
                                    id: c.id!,
                                    name: c.name,
                                    unitCost: defaults?.unit_cost ?? null,
                                    unitPrice: defaults?.unit_price ?? null,
                                    targetIds: c.targetIds,
                                  })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </RoleGate>
                      </TableRow>
                    );
                  })}
                  {byCategory.length > 1 ? (
                    <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{rows.length}</TableCell>
                      <TableCell className="text-right">{formatQuantity(totals.units)}</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right">{formatCurrency(totals.cost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totals.value)}</TableCell>
                      <RoleGate min="STAFF">
                        <TableCell />
                      </RoleGate>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            {selectedTargets.length > 0 ? (
              <RoleGate min="STAFF">
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
                  <span className="text-sm font-medium">
                    {selectedTargets.length} SKU{selectedTargets.length === 1 ? '' : 's'} selected
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
                      <Pencil className="h-4 w-4" />
                      Set cost / price / qty
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setPendingDelete(selectedTargets)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove from FBA targets
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      <X className="h-4 w-4" />
                      Clear
                    </Button>
                  </div>
                </div>
              </RoleGate>
            ) : null}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">
                      <RoleGate min="STAFF">
                        <Checkbox
                          aria-label="Select all FBA targets"
                          checked={allState}
                          onCheckedChange={(checked) => setSelection(targetIds, checked === true)}
                        />
                      </RoleGate>
                    </TableHead>
                    <SortHead label="Finished SKU" column="sku" sort={sort} onSort={toggleSort} />
                    <SortHead label="Category" column="category" sort={sort} onSort={toggleSort} />
                    <SortHead
                      label="Target qty"
                      column="qty"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHead
                      label="Cost / unit"
                      column="cost"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHead
                      label="Price / unit"
                      column="price"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHead
                      label="Total cost"
                      column="total"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHead
                      label="Raw materials"
                      column="materials"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <RoleGate min="STAFF">
                      <TableHead className="w-20" />
                    </RoleGate>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map(
                    ({ target, option, needs, category, cost, price, totalCost, shortCount }) => {
                      const isOpen = expanded.has(target.id);
                      return (
                        <Fragment key={target.id}>
                          <TableRow
                            className={cn(
                              'cursor-pointer',
                              selected.has(target.id) && 'bg-primary/5',
                            )}
                            onClick={() => toggle(target.id)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <RoleGate min="STAFF">
                                  <span onClick={(e) => e.stopPropagation()} className="flex">
                                    <Checkbox
                                      aria-label={`Select ${option?.label ?? 'target'}`}
                                      checked={selected.has(target.id)}
                                      onCheckedChange={(checked) =>
                                        setSelection([target.id], checked === true)
                                      }
                                    />
                                  </span>
                                </RoleGate>
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {option?.label ?? 'Unknown product'}
                              {target.amazon_sku || target.fnsku ? (
                                <span className="block font-mono text-xs font-normal text-muted-foreground">
                                  {[target.amazon_sku, target.fnsku].filter(Boolean).join(' · ')}
                                </span>
                              ) : null}
                              {target.notes ? (
                                <p className="text-xs font-normal text-muted-foreground">
                                  {target.notes}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{category}</TableCell>
                            <TableCell className="text-right">
                              {formatQuantity(target.target_quantity)}
                            </TableCell>
                            <TableCell className="text-right">
                              <SourcedMoney value={cost.value} source={cost.source} />
                            </TableCell>
                            <TableCell className="text-right">
                              <SourcedMoney value={price.value} source={price.source} />
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {totalCost != null ? formatCurrency(totalCost) : '—'}
                            </TableCell>
                            <TableCell>
                              {needs.length === 0 ? (
                                <span className="text-xs text-muted-foreground">None added</span>
                              ) : shortCount > 0 ? (
                                <Badge variant="destructive">
                                  {shortCount} of {needs.length} short
                                </Badge>
                              ) : (
                                <Badge variant="success">All {needs.length} in stock</Badge>
                              )}
                            </TableCell>
                            <RoleGate min="STAFF">
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Edit"
                                    onClick={() => openDialog(target)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Remove ${option?.label ?? 'SKU'} from FBA targets`}
                                    onClick={() => setPendingDelete([target])}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </RoleGate>
                          </TableRow>

                          {isOpen ? (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={9} className="p-0">
                                {needs.length === 0 ? (
                                  <p className="px-12 py-3 text-xs text-muted-foreground">
                                    No raw materials yet — edit this target to add them.
                                  </p>
                                ) : (
                                  <Table className="text-xs">
                                    <TableHeader>
                                      <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-12">Raw material</TableHead>
                                        <TableHead className="text-right">Per unit</TableHead>
                                        <TableHead className="text-right">
                                          Needed (× {formatQuantity(target.target_quantity)})
                                        </TableHead>
                                        <TableHead className="text-right">In stock</TableHead>
                                        <TableHead className="text-right">Material cost</TableHead>
                                        <TableHead>Status</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {needs.map((n) => (
                                        <TableRow key={n.key} className="hover:bg-transparent">
                                          <TableCell className="pl-12">{n.label}</TableCell>
                                          <TableCell className="text-right">
                                            {formatQuantity(n.perUnit)}
                                          </TableCell>
                                          <TableCell className="text-right font-medium">
                                            {formatQuantity(n.needed)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {formatQuantity(n.inStock)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {formatCurrency(n.cost)}
                                          </TableCell>
                                          <TableCell>
                                            <ShortBadge short={n.short} />
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    },
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {summary.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-medium">Raw materials for all targets</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Totals across every SKU above, against current available stock in all locations.
                Material cost uses each raw material&apos;s catalog cost price.
              </p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Raw material</TableHead>
                      <TableHead className="text-right">Needed</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="text-right">To buy</TableHead>
                      <TableHead className="text-right">Material cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((n) => (
                      <TableRow key={n.key}>
                        <TableCell>{n.label}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatQuantity(n.needed)}
                        </TableCell>
                        <TableCell className="text-right">{formatQuantity(n.inStock)}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            n.short > 0 && 'font-medium text-destructive',
                          )}
                        >
                          {n.short > 0 ? formatQuantity(n.short) : '—'}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(n.cost)}</TableCell>
                        <TableCell>
                          <ShortBadge short={n.short} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <FbaBulkAddDialog open={bulkOpen} onOpenChange={setBulkOpen} data={data} />

      <FbaBulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        targetIds={selectedTargets.map((t) => t.id)}
        calculations={data.calculations}
        onDone={() => setSelected(new Set())}
      />

      <FbaCategoryDefaultDialog
        category={categoryEditing}
        onOpenChange={(open) => !open && setCategoryEditing(null)}
      />

      <FbaTargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        target={editing}
        targetMaterials={editing ? (data.materialsByTarget.get(editing.id) ?? []) : []}
        data={data}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete && pendingDelete.length > 1
            ? `Remove ${pendingDelete.length} SKUs from FBA targets?`
            : 'Remove this SKU from FBA targets?'
        }
        description={
          pendingDelete && pendingDelete.length === 1
            ? `"${labelOf(pendingDelete[0]!)}" and its raw-material list will be taken off the FBA list. The product itself, its stock and orders are not affected.`
            : 'Their raw-material lists go too. The products themselves, their stock and orders are not affected.'
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!pendingDelete) return;
          const ids = pendingDelete.map((t) => t.id);
          try {
            const count = await deleteTargets.mutateAsync(ids);
            setSelection(ids, false);
            toast.success(`Removed ${count} SKU${count === 1 ? '' : 's'} from FBA targets`);
          } catch (error) {
            toast.error('Could not remove', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
