/**
 * Mirrors the Postgres enums used by the catalog/inventory UI. Keep in sync with
 * the `create type` statements in supabase/migrations/.
 */

export const PRODUCT_TYPES = ['PRODUCT', 'RAW_MATERIAL'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  PRODUCT: 'Product',
  RAW_MATERIAL: 'Raw material',
};

export const LOCATION_TYPES = ['WAREHOUSE', 'STORE', 'PRODUCTION', 'TRANSIT', 'OTHER'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  WAREHOUSE: 'Warehouse',
  STORE: 'Store',
  PRODUCTION: 'Production',
  TRANSIT: 'Transit',
  OTHER: 'Other',
};

export const BARCODE_SYMBOLOGIES = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'CODE128',
  'CODE39',
  'ITF14',
  'GS1_128',
  'QR',
  'DATAMATRIX',
  'OTHER',
] as const;
export type BarcodeSymbology = (typeof BARCODE_SYMBOLOGIES)[number];

/** Symbologies public.generate_ean13() and JsBarcode on the client both agree on. */
export const SCANNABLE_1D_SYMBOLOGIES: BarcodeSymbology[] = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'CODE128',
  'CODE39',
  'ITF14',
];

export const MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN',
  'INITIAL_STOCK',
  'PRODUCTION_IN',
  'PRODUCTION_OUT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  PURCHASE: 'Purchase (received)',
  SALE: 'Sale',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  RETURN: 'Customer return',
  INITIAL_STOCK: 'Initial stock',
  PRODUCTION_IN: 'Production output',
  PRODUCTION_OUT: 'Production consumption',
};

/**
 * Sign the `inventory_movements.quantity` column must carry for the type, per the
 * `inventory_movements_sign_ck` CHECK constraint. `null` means the caller chooses
 * the sign (ADJUSTMENT only).
 */
export const MOVEMENT_TYPE_SIGN: Record<MovementType, 1 | -1 | null> = {
  PURCHASE: 1,
  TRANSFER_IN: 1,
  RETURN: 1,
  INITIAL_STOCK: 1,
  PRODUCTION_IN: 1,
  SALE: -1,
  TRANSFER_OUT: -1,
  PRODUCTION_OUT: -1,
  ADJUSTMENT: null,
};

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
  'CLOSED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const SALES_CHANNELS = [
  'AMAZON',
  'FLIPKART',
  'MEESHO',
  'SHOPIFY',
  'INSTAGRAM',
  'MYNTRA',
  'MANUAL',
  'OTHER',
] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  AMAZON: 'Amazon',
  FLIPKART: 'Flipkart',
  MEESHO: 'Meesho',
  SHOPIFY: 'Shopify',
  INSTAGRAM: 'Instagram',
  MYNTRA: 'Myntra',
  MANUAL: 'Manual',
  OTHER: 'Other',
};

export const ORDER_STATUSES = [
  'NEW',
  'DISPATCH_READY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  DISPATCH_READY: 'Dispatch ready',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const RETURN_STATUSES = [
  'REQUESTED',
  'AUTHORIZED',
  'REJECTED',
  'RECEIVED',
  'REFUNDED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  AUTHORIZED: 'Authorized',
  REJECTED: 'Rejected',
  RECEIVED: 'Received',
  REFUNDED: 'Refunded',
};

export const EXCHANGE_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISPATCHED',
  'COMPLETED',
] as const;
export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];
export const EXCHANGE_STATUS_LABELS: Record<ExchangeStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISPATCHED: 'Dispatched',
  COMPLETED: 'Completed',
};
