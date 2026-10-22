import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocations } from '@/features/locations/queries';
import { buildItemOptions, parseItemKey } from '@/features/products/item-options';
import { useAllVariants, useProducts } from '@/features/products/queries';
import { BILL_ACCEPT, MAX_BILL_BYTES, useRecordPurchase } from '@/features/purchases/mutations';
import { useVendors } from '@/features/vendors/queries';
import { formatCurrency, todayIso } from '@/lib/format';

interface Line {
  rowId: number;
  key: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

let nextRowId = 0;
const emptyLine = (): Line => ({
  rowId: ++nextRowId,
  key: '',
  quantity: '1',
  unitCost: '',
  taxRate: '0',
});

const num = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
};

/** Selected bill files with local previews (object URLs, revoked when removed). */
function BillPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.filter((f) => f.size > MAX_BILL_BYTES);
    if (tooBig.length > 0) toast.error(`${tooBig.map((f) => f.name).join(', ')}: over 10 MB`);
    onChange([...files, ...picked.filter((f) => f.size <= MAX_BILL_BYTES)]);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={BILL_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      <div className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${i}`}
            className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted"
          >
            {previews[i] ? (
              <img src={previews[i]!} alt={file.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 p-1 text-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="line-clamp-2 text-[10px] leading-tight">{file.name}</span>
              </div>
            )}
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted"
        >
          <ImagePlus className="h-5 w-5" />
          Add bill
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Photos (JPG, PNG, HEIC) or PDF, up to 10 MB each. On a phone you can take a photo directly.
      </p>
    </div>
  );
}

export function RecordPurchaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ids = {
    vendor: useId(),
    bill: useId(),
    date: useId(),
    location: useId(),
    receive: useId(),
    shipping: useId(),
    discount: useId(),
    notes: useId(),
  };
  const { data: vendors } = useVendors();
  const { data: locations } = useLocations();
  const { data: products } = useProducts();
  const { data: variants } = useAllVariants();
  const record = useRecordPurchase();

  const [vendorId, setVendorId] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [date, setDate] = useState(todayIso());
  const [locationId, setLocationId] = useState('');
  const [receive, setReceive] = useState(true);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [shipping, setShipping] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [bills, setBills] = useState<File[]>([]);

  const options = useMemo(
    () => buildItemOptions(products ?? [], variants ?? []),
    [products, variants],
  );
  const optionByKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);
  const activeVendors = (vendors ?? []).filter((v) => v.is_active);
  const activeLocations = (locations ?? []).filter((l) => l.is_active);

  useEffect(() => {
    if (!open) return;
    setVendorId('');
    setBillNumber('');
    setDate(todayIso());
    setLocationId(activeLocations.find((l) => l.is_default)?.id ?? activeLocations[0]?.id ?? '');
    setReceive(true);
    setLines([emptyLine()]);
    setShipping('');
    setDiscount('');
    setNotes('');
    setBills([]);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (rowId: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)));

  const pickItem = (rowId: number, key: string) => {
    const option = optionByKey.get(key);
    updateLine(rowId, {
      key,
      // Start from the catalog cost and GST; the bill's numbers can overwrite them.
      unitCost: option ? String(option.costPrice || '') : '',
      taxRate: option ? String(Number(option.product.tax_rate)) : '0',
    });
  };

  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const l of lines) {
      if (!l.key) continue;
      const lineNet = num(l.quantity) * num(l.unitCost);
      net += lineNet;
      tax += (lineNet * num(l.taxRate)) / 100;
    }
    const total = Math.max(0, net - num(discount) + tax + num(shipping));
    return { net, tax, total };
  }, [lines, discount, shipping]);

  const save = async () => {
    if (!vendorId) {
      toast.error('Choose the vendor');
      return;
    }
    const filled = lines.filter((l) => l.key);
    if (filled.length === 0) {
      toast.error('Add at least one item from the bill');
      return;
    }
    for (const l of filled) {
      if (!(num(l.quantity) > 0)) {
        toast.error('Each item needs a quantity greater than 0');
        return;
      }
      if (num(l.unitCost) < 0 || num(l.taxRate) < 0 || num(l.taxRate) > 100) {
        toast.error('Check the cost and GST % on each item');
        return;
      }
    }
    if (receive && !locationId) {
      toast.error('Choose where the goods were received');
      return;
    }

    try {
      const { failedBills } = await record.mutateAsync({
        header: {
          vendor_id: vendorId,
          location_id: locationId || null,
          order_date: date || todayIso(),
          vendor_bill_number: billNumber,
          discount_amount: num(discount),
          shipping_amount: num(shipping),
          notes,
          receive,
        },
        items: filled.map((l) => {
          const { productId, variantId } = parseItemKey(l.key);
          return {
            product_id: productId,
            variant_id: variantId,
            quantity: num(l.quantity),
            unit_cost: num(l.unitCost),
            tax_rate: num(l.taxRate),
          };
        }),
        bills,
      });
      toast.success(receive ? 'Purchase recorded and stock added' : 'Purchase recorded');
      if (failedBills.length > 0) {
        toast.error('Some bill files did not upload', {
          description: `${failedBills.join('; ')}. Open the purchase to add them again.`,
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not record purchase', { description: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !record.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record purchase</DialogTitle>
          <DialogDescription>
            Enter a vendor bill: what you bought, the amounts, and a photo of the bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor={ids.vendor}>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id={ids.vendor}>
                  <SelectValue placeholder="Choose vendor" />
                </SelectTrigger>
                <SelectContent>
                  {activeVendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeVendors.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No vendors yet —{' '}
                  <Link to="/vendors" className="underline">
                    add one
                  </Link>
                  .
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.bill}>Bill / invoice no.</Label>
              <Input
                id={ids.bill}
                maxLength={80}
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.date}>Bill date</Label>
              <Input
                id={ids.date}
                type="date"
                max={todayIso()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            <div className="hidden gap-2 px-0.5 text-xs text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem_6rem_2.25rem]">
              <span>Product</span>
              <span>Qty</span>
              <span>Unit cost (₹)</span>
              <span>GST %</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {lines.map((line) => {
              const amount =
                num(line.quantity) * num(line.unitCost) * (1 + num(line.taxRate) / 100);
              return (
                <div
                  key={line.rowId}
                  className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem_6rem_2.25rem] sm:items-center sm:border-0 sm:p-0"
                >
                  <Select value={line.key} onValueChange={(key) => pickItem(line.rowId, key)}>
                    <SelectTrigger className="col-span-2 sm:col-span-1" aria-label="Product">
                      <SelectValue placeholder="Choose product or raw material" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="Quantity"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.rowId, { quantity: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="Unit cost"
                    placeholder="0.00"
                    value={line.unitCost}
                    onChange={(e) => updateLine(line.rowId, { unitCost: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    aria-label="GST %"
                    value={line.taxRate}
                    onChange={(e) => updateLine(line.rowId, { taxRate: e.target.value })}
                  />
                  <span className="self-center text-right text-sm font-medium">
                    {line.key ? formatCurrency(amount) : '—'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove item"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((l) => l.rowId !== line.rowId))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={ids.shipping}>Shipping / freight (₹)</Label>
                <Input
                  id={ids.shipping}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.discount}>Discount (₹)</Label>
                <Input
                  id={ids.discount}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{formatCurrency(totals.net)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
              {num(shipping) > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{formatCurrency(num(shipping))}</span>
                </div>
              ) : null}
              {num(discount) > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>− {formatCurrency(num(discount))}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Bill total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={ids.receive}
                checked={receive}
                onCheckedChange={(v) => setReceive(v === true)}
              />
              <Label htmlFor={ids.receive} className="font-normal">
                Goods received — add these quantities to stock now
              </Label>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <Label htmlFor={ids.location} className="text-sm font-normal text-muted-foreground">
                {receive ? 'Into' : 'Deliver to'}
              </Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id={ids.location} className="w-56">
                  <SelectValue placeholder="Choose location" />
                </SelectTrigger>
                <SelectContent>
                  {activeLocations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Bill images</Label>
            <BillPicker files={bills} onChange={setBills} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.notes}>Notes (optional)</Label>
            <Textarea
              id={ids.notes}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void save()} disabled={record.isPending}>
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
