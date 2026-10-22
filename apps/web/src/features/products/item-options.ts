import type { Product, ProductVariant } from './queries';

/** "productId|variantId" (variantId blank for the base product) — one key per stockable item. */
export function itemKey(productId: string, variantId: string | null | undefined): string {
  return `${productId}|${variantId ?? ''}`;
}

export function parseItemKey(key: string): { productId: string; variantId: string | null } {
  const [productId = '', variantId = ''] = key.split('|');
  return { productId, variantId: variantId || null };
}

export interface ItemOption {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  sku: string;
  label: string;
  /** Cost of one unit: the variant's own cost if set, else the product's. */
  costPrice: number;
}

function variantSuffix(variant: ProductVariant): string {
  const parts = [variant.size, variant.color, variant.design].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : variant.name || variant.sku;
}

export function buildItemOptions(products: Product[], variants: ProductVariant[]): ItemOption[] {
  const byProduct = new Map<string, ProductVariant[]>();
  for (const v of variants) {
    const list = byProduct.get(v.product_id);
    if (list) list.push(v);
    else byProduct.set(v.product_id, [v]);
  }
  return products.flatMap((product) => {
    const own: ItemOption = {
      key: itemKey(product.id, null),
      product,
      variant: null,
      sku: product.sku,
      label: `${product.sku} — ${product.name}`,
      costPrice: product.cost_price,
    };
    const children = (byProduct.get(product.id) ?? [])
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((variant): ItemOption => ({
        key: itemKey(product.id, variant.id),
        product,
        variant,
        sku: variant.sku,
        label: `${variant.sku} — ${product.name} (${variantSuffix(variant)})`,
        costPrice: variant.cost_price ?? product.cost_price,
      }));
    return [own, ...children];
  });
}
