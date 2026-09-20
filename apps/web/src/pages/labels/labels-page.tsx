import { Fragment, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Printer, Search, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BarcodeSymbology } from '@inventory/shared';

import { EmptyState } from '@/components/empty-state';
import { LabelCard } from '@/components/label-card';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAllBarcodes,
  useAllVariants,
  useProducts,
  type Barcode,
  type ProductVariant,
} from '@/features/products/queries';
import {
  clampMm,
  loadLabelSettings,
  saveLabelSettings,
  type LabelSettings,
} from '@/lib/label-settings';

import { LabelSettingsPanel } from './label-settings-panel';

interface BatchItem {
  key: string;
  name: string;
  sku: string;
  price: number;
  barcode: string;
  symbology: BarcodeSymbology;
  qty: number;
}

export function LabelsPage() {
  const { data: products, isLoading } = useProducts();
  const { data: variants } = useAllVariants();
  const { data: barcodes } = useAllBarcodes();
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [settings, setSettings] = useState<LabelSettings>(loadLabelSettings);

  useEffect(() => {
    saveLabelSettings(settings);
  }, [settings]);

  const barcodeFor = useMemo(() => {
    const byProduct = new Map<string, Barcode>();
    const byVariant = new Map<string, Barcode>();
    for (const b of barcodes ?? []) {
      if (b.variant_id) {
        if (!byVariant.has(b.variant_id) || b.is_primary) byVariant.set(b.variant_id, b);
      } else if (b.product_id) {
        if (!byProduct.has(b.product_id) || b.is_primary) byProduct.set(b.product_id, b);
      }
    }
    return { byProduct, byVariant };
  }, [barcodes]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products ?? [];
    return (products ?? []).filter(
      (p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const v of variants ?? []) {
      const list = map.get(v.product_id) ?? [];
      list.push(v);
      map.set(v.product_id, list);
    }
    return map;
  }, [variants]);

  const addToBatch = (item: { key: string; name: string; sku: string; price: number }) => {
    const existing = batch.find((b) => b.key === item.key);
    if (existing) {
      setBatch((prev) => prev.map((b) => (b.key === item.key ? { ...b, qty: b.qty + 1 } : b)));
      return;
    }

    const found =
      barcodeFor.byVariant.get(item.key) ?? barcodeFor.byProduct.get(item.key) ?? undefined;
    if (!found) {
      toast.error('No barcode yet', {
        description: "Open this item's product page and generate or add a barcode first.",
      });
      return;
    }

    setBatch((prev) => [
      ...prev,
      {
        key: item.key,
        name: item.name,
        sku: item.sku,
        price: item.price,
        barcode: found.barcode,
        symbology: found.symbology,
        qty: 1,
      },
    ]);
  };

  const updateQty = (key: string, delta: number) => {
    setBatch((prev) =>
      prev
        .map((b) => (b.key === key ? { ...b, qty: Math.max(1, b.qty + delta) } : b))
        .filter((b) => b.qty > 0),
    );
  };

  const removeItem = (key: string) => setBatch((prev) => prev.filter((b) => b.key !== key));

  const totalLabels = batch.reduce((sum, b) => sum + b.qty, 0);
  const labelWidth = clampMm(settings.widthMm);
  const labelHeight = clampMm(settings.heightMm);
  const isRoll = settings.printMode === 'roll';
  const printLabels = batch.flatMap((item) =>
    Array.from({ length: item.qty }, (_, i) => ({ id: `${item.key}-${i}`, item })),
  );

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Labels"
          description="Build a batch of barcode labels and print them."
          actions={
            <Button size="sm" disabled={batch.length === 0} onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print {totalLabels > 0 ? `(${totalLabels})` : ''}
            </Button>
          }
        />

        <LabelSettingsPanel
          settings={settings}
          onChange={setSettings}
          sample={
            batch[0]
              ? {
                  name: batch[0].name,
                  price: batch[0].price,
                  barcode: batch[0].barcode,
                  symbology: batch[0].symbology,
                }
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
              <Table>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const productVariants = variantsByProduct.get(product.id) ?? [];
                    return (
                      <Fragment key={product.id}>
                        <TableRow>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                          <TableCell className="text-right">
                            {productVariants.length === 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  addToBatch({
                                    key: product.id,
                                    name: product.name,
                                    sku: product.sku,
                                    price: product.selling_price,
                                  })
                                }
                              >
                                Add
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        {productVariants.map((variant) => (
                          <TableRow key={variant.id} className="bg-muted/30">
                            <TableCell className="pl-6 text-sm text-muted-foreground">
                              {[variant.size, variant.color, variant.design]
                                .filter(Boolean)
                                .join(' / ') || 'Variant'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{variant.sku}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  addToBatch({
                                    key: variant.id,
                                    name: `${product.name} — ${variant.sku}`,
                                    sku: variant.sku,
                                    price: variant.selling_price ?? product.selling_price,
                                  })
                                }
                              >
                                Add
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Batch</h3>
          {batch.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No labels added yet"
              description="Add products from the left."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="w-32">Qty</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.barcode}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQty(item.key, -1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-8 text-center text-sm">{item.qty}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQty(item.key, 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.key)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Match the printed page to the chosen layout: label-sized pages for a roll printer, A4 otherwise. */}
      <style>
        {isRoll
          ? `@page { size: ${labelWidth}mm ${labelHeight}mm; margin: 0; }`
          : '@page { size: A4; margin: 8mm; }'}
      </style>

      {/* Print output: hidden on screen, shown only when printing. */}
      <div id="print-area" className="hidden print:block">
        <div style={isRoll ? undefined : { display: 'flex', flexWrap: 'wrap', gap: '2mm' }}>
          {printLabels.map(({ id, item }, index) => (
            <div
              key={id}
              style={
                isRoll
                  ? {
                      width: `${labelWidth}mm`,
                      height: `${labelHeight}mm`,
                      breakAfter: index === printLabels.length - 1 ? 'auto' : 'page',
                    }
                  : undefined
              }
            >
              <LabelCard
                content={{
                  name: item.name,
                  price: item.price,
                  barcode: item.barcode,
                  symbology: item.symbology,
                }}
                settings={settings}
                bordered={!isRoll}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
