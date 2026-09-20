import type { SalesChannel } from '@inventory/shared';

/** The marketplaces/stores the fulfilment UI is organised around, in display order. */
export const PRIMARY_CHANNELS: SalesChannel[] = [
  'AMAZON',
  'FLIPKART',
  'MEESHO',
  'SHOPIFY',
  'INSTAGRAM',
];

interface ChannelStyle {
  /** Tailwind classes for the pill (full class names so the JIT can see them). */
  badge: string;
  /** Label + placeholder for that channel's own order id field. */
  idLabel: string;
  idHint: string;
}

const NEUTRAL =
  'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-300';

export const CHANNEL_STYLES: Record<SalesChannel, ChannelStyle> = {
  AMAZON: {
    badge:
      'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300',
    idLabel: 'Amazon order ID',
    idHint: '404-1234567-1234567',
  },
  FLIPKART: {
    badge:
      'border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300',
    idLabel: 'Flipkart order ID',
    idHint: 'OD123456789012345000',
  },
  MEESHO: {
    badge:
      'border-fuchsia-200 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
    idLabel: 'Meesho sub-order number',
    idHint: '123456789012345678_1',
  },
  SHOPIFY: {
    badge:
      'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300',
    idLabel: 'Shopify order number',
    idHint: '#1001',
  },
  INSTAGRAM: {
    badge:
      'border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300',
    idLabel: 'Instagram order reference',
    idHint: '@handle or DM reference',
  },
  MYNTRA: {
    badge:
      'border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300',
    idLabel: 'Myntra order ID',
    idHint: 'Myntra order ID',
  },
  MANUAL: { badge: NEUTRAL, idLabel: 'Reference (optional)', idHint: 'Your own reference' },
  OTHER: { badge: NEUTRAL, idLabel: 'Channel order ID', idHint: 'Order ID on that channel' },
};

export type ChannelFilterValue = SalesChannel | 'ALL';

/** Row counts per channel, for the filter pills. */
export function countByChannel<T extends { sales_channel: SalesChannel }>(
  rows: T[],
): Partial<Record<SalesChannel, number>> {
  const counts: Partial<Record<SalesChannel, number>> = {};
  for (const row of rows) counts[row.sales_channel] = (counts[row.sales_channel] ?? 0) + 1;
  return counts;
}
