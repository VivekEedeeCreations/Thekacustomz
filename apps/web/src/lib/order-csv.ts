/**
 * Order CSV import: parsing and grouping, kept free of React/Supabase so it can be reasoned about
 * on its own. One CSV row is one order line; rows sharing a channel + order id become one order.
 *
 * Expected headers (matched case-insensitively, extra columns ignored) follow the team's sales
 * sheet: Order ID, Sales Channel, Order Date, Picked up On, Order Item, Product SKU, Product Size,
 * Product Color, Product Design, Customer Billed, Product Price, Status, Is Exchange, Is Returned,
 * Is Returned Received, Is damaged, Is Return Window Opened, Customer Name, Delivery State,
 * Delivery Pincode, Delivery Date, Exchanged Size, Exchange id, Days After Delivery, Final Sale.
 */
import type { SalesChannel } from '@inventory/shared';

/** RFC 4180-ish: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines (e.g. a trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const COLUMNS = {
  orderId: 'order id',
  channel: 'sales channel',
  orderDate: 'order date',
  pickedUpOn: 'picked up on',
  item: 'order item',
  sku: 'product sku',
  size: 'product size',
  color: 'product color',
  design: 'product design',
  billed: 'customer billed',
  price: 'product price',
  status: 'status',
  isExchange: 'is exchange',
  isReturned: 'is returned',
  isReturnReceived: 'is returned received',
  isDamaged: 'is damaged',
  customer: 'customer name',
  state: 'delivery state',
  pincode: 'delivery pincode',
  deliveryDate: 'delivery date',
  exchangedSize: 'exchanged size',
  exchangeId: 'exchange id',
} as const;
type ColumnKey = keyof typeof COLUMNS;

const REQUIRED: ColumnKey[] = ['orderId', 'channel', 'orderDate'];

export interface CsvRow {
  /** 1-based line number in the file, for error messages. */
  line: number;
  orderId: string;
  channel: SalesChannel;
  channelRaw: string;
  /** ISO yyyy-mm-dd, or null if missing/unparseable. */
  orderDate: string | null;
  pickedUpOn: string;
  item: string;
  sku: string;
  size: string;
  color: string;
  design: string;
  billed: number | null;
  price: number | null;
  status: string;
  isExchange: boolean;
  isReturned: boolean;
  isReturnReceived: boolean;
  isDamaged: boolean;
  customer: string;
  state: string;
  pincode: string;
  deliveryDate: string;
  exchangedSize: string;
  exchangeId: string;
  /** How this line is matched to the catalog: its SKU, or a description key when it has none. */
  matchKey: string;
}

const CHANNEL_WORDS: [string, SalesChannel][] = [
  ['amazon', 'AMAZON'],
  ['flipkart', 'FLIPKART'],
  ['meesho', 'MEESHO'],
  ['shopify', 'SHOPIFY'],
  ['instagram', 'INSTAGRAM'],
  ['myntra', 'MYNTRA'],
  ['manual', 'MANUAL'],
  ['website', 'SHOPIFY'],
];

function toChannel(raw: string): SalesChannel {
  const value = raw.trim().toLowerCase();
  return CHANNEL_WORDS.find(([word]) => value.includes(word))?.[1] ?? 'OTHER';
}

/** Accepts dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy or yyyy-mm-dd. */
export function toIsoDate(raw: string): string | null {
  const value = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toNumber(raw: string): number | null {
  const value = raw.replace(/[₹,\s]/g, '');
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(raw: string): boolean {
  return ['true', 'yes', 'y', '1'].includes(raw.trim().toLowerCase());
}

/** Sizes like "N/a" or "no size" mean "none". */
function cleanSize(raw: string): string {
  const value = raw.trim();
  return /^(n\/?a|na|no size|none|-)$/i.test(value) ? '' : value;
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

export function lineMatchKey(row: Pick<CsvRow, 'sku' | 'item' | 'design' | 'size' | 'color'>) {
  if (row.sku) return row.sku;
  return `item:${[row.item, row.design, row.size, row.color].map((s) => tidy(s).toLowerCase()).join('|')}`;
}

export interface ParsedCsv {
  rows: CsvRow[];
  /** Problems that stop specific rows from importing. */
  rowErrors: { line: number; message: string }[];
  /** A problem with the file as a whole (missing columns); no rows are returned. */
  fileError: string | null;
}

export function readOrderCsv(text: string): ParsedCsv {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], rowErrors: [], fileError: 'The file has no data rows.' };
  }
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const index = {} as Record<ColumnKey, number>;
  for (const [key, name] of Object.entries(COLUMNS) as [ColumnKey, string][]) {
    index[key] = header.indexOf(name);
  }
  const missing = REQUIRED.filter((key) => index[key] < 0).map((key) => `"${COLUMNS[key]}"`);
  if (missing.length > 0) {
    return {
      rows: [],
      rowErrors: [],
      fileError: `Missing column${missing.length > 1 ? 's' : ''} ${missing.join(', ')} (headers are matched by name).`,
    };
  }

  const rows: CsvRow[] = [];
  const rowErrors: ParsedCsv['rowErrors'] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (key: ColumnKey) => (index[key] >= 0 ? tidy(cells[index[key]] ?? '') : '');

    const orderId = get('orderId');
    if (!orderId) {
      rowErrors.push({ line, message: 'No order id' });
      return;
    }
    const orderDate = toIsoDate(get('orderDate'));
    if (!orderDate) {
      rowErrors.push({
        line,
        message: `Order ${orderId}: unreadable order date "${get('orderDate')}"`,
      });
      return;
    }

    const partial = {
      sku: get('sku'),
      item: get('item'),
      design: get('design'),
      size: cleanSize(get('size')),
      color: get('color'),
    };
    rows.push({
      line,
      orderId,
      channelRaw: get('channel'),
      channel: toChannel(get('channel')),
      orderDate,
      pickedUpOn: get('pickedUpOn'),
      ...partial,
      billed: toNumber(get('billed')),
      price: toNumber(get('price')),
      status: get('status'),
      isExchange: toBool(get('isExchange')),
      isReturned: toBool(get('isReturned')),
      isReturnReceived: toBool(get('isReturnReceived')),
      isDamaged: toBool(get('isDamaged')),
      customer: get('customer'),
      state: get('state'),
      pincode: get('pincode'),
      deliveryDate: get('deliveryDate'),
      exchangedSize: get('exchangedSize'),
      exchangeId: get('exchangeId'),
      matchKey: lineMatchKey(partial),
    });
  });
  return { rows, rowErrors, fileError: null };
}

export interface ImportLine {
  matchKey: string;
  /** Repeated identical lines in one order are merged into a quantity. */
  quantity: number;
  unitPrice: number;
  label: string;
}

export interface ImportOrder {
  channel: SalesChannel;
  externalOrderId: string;
  orderDate: string;
  customerName: string;
  shippingAddress: string;
  notes: string;
  lines: ImportLine[];
  firstLine: number;
}

function lineLabel(row: CsvRow): string {
  const desc = [row.item, row.design, row.size, row.color].filter(Boolean).join(' · ');
  return row.sku ? `${row.sku}${desc ? ` (${desc})` : ''}` : desc || 'Unnamed item';
}

function rowFlags(row: CsvRow): string[] {
  const flags: string[] = [];
  if (row.isReturned) flags.push(row.isReturnReceived ? 'Returned (received)' : 'Returned');
  else if (row.isReturnReceived) flags.push('Return received');
  if (row.isExchange || row.exchangedSize || row.exchangeId) {
    const to = row.exchangedSize ? ` to ${row.exchangedSize}` : '';
    const id = row.exchangeId ? ` (exchange id ${row.exchangeId})` : '';
    flags.push(`Exchanged${to}${id}`);
  }
  if (row.isDamaged) flags.push('Damaged');
  return flags;
}

/** Groups rows into orders keyed by channel + order id, merging identical lines into quantities. */
export function groupOrders(rows: CsvRow[]): ImportOrder[] {
  const byOrder = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = `${row.channel}|${row.orderId.toLowerCase()}`;
    const list = byOrder.get(key);
    if (list) list.push(row);
    else byOrder.set(key, [row]);
  }

  return [...byOrder.values()].map((group) => {
    const first = group[0]!;
    const lines = new Map<string, ImportLine>();
    for (const row of group) {
      const existing = lines.get(row.matchKey.toLowerCase());
      if (existing) {
        existing.quantity += 1;
        continue;
      }
      const price = row.price != null && row.price > 0 ? row.price : row.billed;
      lines.set(row.matchKey.toLowerCase(), {
        matchKey: row.matchKey,
        quantity: 1,
        unitPrice: price != null && price > 0 ? price : 0,
        label: lineLabel(row),
      });
    }

    const pick = (get: (r: CsvRow) => string) => group.map(get).find(Boolean) ?? '';
    const billed = group.reduce(
      (sum, r) => sum + (r.billed != null && r.billed > 0 ? r.billed : 0),
      0,
    );
    const notes: string[] = [
      `Imported from CSV${first.status ? ` — sheet status: ${first.status}` : ''}.`,
    ];
    const pickedUp = pick((r) => r.pickedUpOn);
    const delivered = pick((r) => r.deliveryDate);
    if (pickedUp || delivered) {
      notes.push(
        [pickedUp && `Picked up ${pickedUp}`, delivered && `delivered ${delivered}`]
          .filter(Boolean)
          .join(', ') + '.',
      );
    }
    if (billed > 0) notes.push(`Customer billed ₹${billed.toFixed(2)}.`);
    for (const row of group) {
      const flags = rowFlags(row);
      if (flags.length > 0) {
        notes.push(`${group.length > 1 ? `${lineLabel(row)}: ` : ''}${flags.join('; ')}.`);
      }
    }

    return {
      channel: first.channel,
      externalOrderId: first.orderId,
      orderDate: first.orderDate!,
      customerName: pick((r) => r.customer),
      shippingAddress:
        [pick((r) => r.state), pick((r) => r.pincode)].filter(Boolean).join(' ') || '',
      notes: notes.join(' '),
      lines: [...lines.values()],
      firstLine: first.line,
    };
  });
}
