import { supabase } from '@/lib/supabase';

import type { Order } from './queries';

export type ScanMatchKind = 'awb' | 'order_number' | 'channel_order_id';

export interface ScanLookup {
  orders: Order[];
  matchedBy: ScanMatchKind;
  /** The exact string that matched (may be a token pulled out of a longer QR payload). */
  matchedValue: string;
}

/**
 * Shipping-label QR codes often carry more than a bare AWB (e.g. "AWB:1234|ORD:5678"),
 * so besides the raw scan we also try each separator-delimited token.
 */
export function scanCandidates(raw: string): string[] {
  const whole = raw.trim();
  if (!whole) return [];
  const tokens = whole
    .split(/[\s|,;:/?&=]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 5 && t !== whole);
  return [whole, ...new Set(tokens)].slice(0, 6);
}

/**
 * Finds the order a scanned barcode/QR refers to. Tries, in order, the AWB number,
 * our own order number, then the sales channel's order id. Returns null when
 * nothing matches; several orders can come back for a channel order id that is
 * shared between channels, and the caller should let the operator pick.
 */
export async function findOrdersByScan(raw: string): Promise<ScanLookup | null> {
  for (const value of scanCandidates(raw)) {
    const byAwb = await supabase.from('orders').select('*').eq('awb_number', value).limit(5);
    if (byAwb.error) throw byAwb.error;
    if (byAwb.data.length > 0) return { orders: byAwb.data, matchedBy: 'awb', matchedValue: value };

    const byNumber = await supabase.from('orders').select('*').eq('order_number', value).limit(5);
    if (byNumber.error) throw byNumber.error;
    if (byNumber.data.length > 0) {
      return { orders: byNumber.data, matchedBy: 'order_number', matchedValue: value };
    }

    const byChannelId = await supabase
      .from('orders')
      .select('*')
      .eq('external_order_id', value)
      .limit(5);
    if (byChannelId.error) throw byChannelId.error;
    if (byChannelId.data.length > 0) {
      return { orders: byChannelId.data, matchedBy: 'channel_order_id', matchedValue: value };
    }
  }
  return null;
}
