import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Loader2,
  PackageCheck,
  PackageMinus,
  ScanLine,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_SIGN, type MovementType } from '@inventory/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchOnHand, lookupBarcode } from '@/features/inventory/barcode-lookup';
import { useCreateMovement } from '@/features/inventory/mutations';
import { useLocations } from '@/features/locations/queries';
import { useVendors } from '@/features/vendors/queries';
import { useCameraScanner } from '@/hooks/use-camera-scanner';
import { formatQuantity } from '@/lib/format';
import { isVendorRelevant, isVendorRequired } from '@/lib/movement-vendor';

const NONE = '__none__';

type ScanMode = 'DISPATCH' | 'RESTOCK';

const MODE_MOVEMENT_TYPES: Record<ScanMode, MovementType[]> = {
  DISPATCH: ['SALE', 'TRANSFER_OUT', 'PRODUCTION_OUT'],
  RESTOCK: ['PURCHASE', 'RETURN', 'TRANSFER_IN', 'INITIAL_STOCK'],
};

interface ScanLine {
  key: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantLabel: string | null;
  sku: string;
  barcode: string;
  quantity: number;
  onHand: number;
}

export function ScanPage() {
  const { data: locations } = useLocations();
  const { data: vendors } = useVendors();
  const createMovement = useCreateMovement();

  const [mode, setMode] = useState<ScanMode>('DISPATCH');
  const [movementType, setMovementType] = useState<MovementType>('SALE');
  const [locationId, setLocationId] = useState('');
  const [vendorId, setVendorId] = useState(NONE);
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [lines, setLines] = useState<ScanLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const defaultLocation = locations?.find((l) => l.is_default)?.id;
    if (defaultLocation && !locationId) setLocationId(defaultLocation);
  }, [locations, locationId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [lines.length]);

  const changeMode = (next: ScanMode) => {
    setMode(next);
    const nextDefault = MODE_MOVEMENT_TYPES[next][0];
    if (nextDefault) setMovementType(nextDefault);
    setVendorId(NONE);
  };

  const showVendor = isVendorRelevant(movementType);
  const vendorRequired = isVendorRequired(movementType);
  const sign = MOVEMENT_TYPE_SIGN[movementType] ?? 1;

  async function handleScan(rawCode: string) {
    const code = rawCode.trim();
    if (!code || !locationId) {
      if (!locationId) toast.error('Select a location first');
      return;
    }

    setIsLookingUp(true);
    try {
      const resolved = await lookupBarcode(code);
      if (!resolved) {
        toast.error('No item matches this barcode', { description: code });
        return;
      }

      const key = resolved.variant?.id ?? resolved.product.id;
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        setLines((prev) =>
          prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)),
        );
        toast.success(`+1 ${resolved.product.name}`);
        return;
      }

      const onHand = await fetchOnHand(
        resolved.product.id,
        resolved.variant?.id ?? null,
        locationId,
      );
      const variantLabel = resolved.variant
        ? [resolved.variant.size, resolved.variant.color, resolved.variant.design]
            .filter(Boolean)
            .join(' / ') || resolved.variant.sku
        : null;

      setLines((prev) => [
        ...prev,
        {
          key,
          productId: resolved.product.id,
          variantId: resolved.variant?.id ?? null,
          productName: resolved.product.name,
          variantLabel,
          sku: resolved.variant?.sku ?? resolved.product.sku,
          barcode: resolved.barcode.barcode,
          quantity: 1,
          onHand,
        },
      ]);
      toast.success(`Added ${resolved.product.name}`);
    } catch (error) {
      toast.error('Scan lookup failed', { description: (error as Error).message });
    } finally {
      setIsLookingUp(false);
    }
  }

  const { videoRef, error: cameraError } = useCameraScanner(cameraOn, (text) => {
    void handleScan(text);
  });

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    void handleScan(manualCode);
    setManualCode('');
  };

  const updateQuantity = (key: string, quantity: number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(0, quantity) } : l)),
    );
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const canPost =
    lines.length > 0 &&
    !!locationId &&
    lines.every((l) => l.quantity > 0) &&
    (!vendorRequired || vendorId !== NONE);

  const handlePost = async () => {
    if (!canPost) return;
    setIsPosting(true);
    const failedKeys = new Set<string>();
    const failureMessages: string[] = [];
    let posted = 0;

    for (const line of lines) {
      try {
        await createMovement.mutateAsync({
          movement_type: movementType,
          product_id: line.productId,
          variant_id: line.variantId,
          location_id: locationId,
          vendor_id: showVendor && vendorId !== NONE ? vendorId : null,
          quantity: line.quantity * sign,
        });
        posted += 1;
      } catch (error) {
        failedKeys.add(line.key);
        failureMessages.push(`${line.productName}: ${(error as Error).message}`);
      }
    }

    setIsPosting(false);

    if (failedKeys.size === 0) {
      toast.success(`Posted ${posted} movement${posted === 1 ? '' : 's'}`);
      setLines([]);
    } else {
      setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
      toast.error(`Posted ${posted}, ${failedKeys.size} failed`, {
        description: failureMessages.join('\n'),
      });
    }
  };

  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div>
      <PageHeader
        title="Scan"
        description="Scan barcodes to dispatch or restock inventory — with a camera or a USB/Bluetooth scanner."
      />

      <Tabs value={mode} onValueChange={(v) => changeMode(v as ScanMode)} className="mb-6">
        <TabsList>
          <TabsTrigger value="DISPATCH" className="gap-1.5">
            <PackageMinus className="h-4 w-4" />
            Dispatch
          </TabsTrigger>
          <TabsTrigger value="RESTOCK" className="gap-1.5">
            <PackageCheck className="h-4 w-4" />
            Restock
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-medium">Details</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Movement type</label>
                <Select
                  value={movementType}
                  onValueChange={(v) => setMovementType(v as MovementType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODE_MOVEMENT_TYPES[mode].map((type) => (
                      <SelectItem key={type} value={type}>
                        {MOVEMENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Location</label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showVendor ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Vendor{vendorRequired ? '' : ' (optional)'}
                  </label>
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Which vendor did this come from?" />
                    </SelectTrigger>
                    <SelectContent>
                      {!vendorRequired ? (
                        <SelectItem value={NONE}>Not from a vendor</SelectItem>
                      ) : null}
                      {vendors?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">Scanner</h3>
              <Button
                type="button"
                variant={cameraOn ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setCameraOn((v) => !v)}
              >
                {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {cameraOn ? 'Stop camera' : 'Use camera'}
              </Button>
            </div>

            <form onSubmit={onManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  autoFocus
                  className="pl-8"
                  placeholder="Scan or type a barcode, then press Enter"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  disabled={!locationId}
                />
              </div>
              <Button type="submit" disabled={!manualCode.trim() || isLookingUp}>
                {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              Works with a USB/Bluetooth barcode scanner (it types the code + Enter) or manual
              entry.
            </p>

            {cameraOn ? (
              <div className="mt-3 overflow-hidden rounded-md border bg-black">
                <video
                  ref={videoRef}
                  className="aspect-square w-full object-cover sm:aspect-video"
                  muted
                  playsInline
                  autoPlay
                />
              </div>
            ) : null}
            {cameraError ? <p className="mt-2 text-xs text-destructive">{cameraError}</p> : null}
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="text-sm font-medium">
              Scanned items{' '}
              {lines.length > 0 ? `(${lines.length}, qty ${formatQuantity(totalQty)})` : ''}
            </h3>
            <Button onClick={handlePost} disabled={!canPost || isPosting}>
              {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Post{' '}
              {lines.length > 0 ? `${lines.length} movement${lines.length === 1 ? '' : 's'}` : ''}
            </Button>
          </div>

          {lines.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              title="Nothing scanned yet"
              description="Scan a barcode or type one above to add it to this session."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="w-28">Qty</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const willGoNegative = mode === 'DISPATCH' && line.quantity > line.onHand;
                  return (
                    <TableRow key={line.key}>
                      <TableCell>
                        <p className="font-medium">{line.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.sku}
                          {line.variantLabel ? ` — ${line.variantLabel}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          On hand: {formatQuantity(line.onHand)}
                          {willGoNegative ? (
                            <Badge variant="warning" className="ml-1.5 gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Exceeds stock
                            </Badge>
                          ) : null}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {line.barcode}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className="h-8 w-20"
                          value={line.quantity}
                          onChange={(e) => updateQuantity(line.key, Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeLine(line.key)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
