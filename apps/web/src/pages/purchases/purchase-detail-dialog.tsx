import { useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { itemKey, type ItemOption } from '@/features/products/item-options';
import {
  BILL_ACCEPT,
  useAddPurchaseBills,
  useDeletePurchaseBill,
} from '@/features/purchases/mutations';
import {
  useBillUrls,
  usePurchaseItems,
  type Purchase,
  type PurchaseDocument,
} from '@/features/purchases/queries';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/format';

export function PurchaseDetailDialog({
  purchase,
  vendorName,
  locationName,
  documents,
  optionByKey,
  onOpenChange,
}: {
  purchase: Purchase | null;
  vendorName: string;
  locationName: string;
  documents: PurchaseDocument[];
  optionByKey: Map<string, ItemOption>;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: items, isLoading } = usePurchaseItems(purchase?.id);
  const paths = useMemo(() => documents.map((d) => d.storage_path), [documents]);
  const { data: urls } = useBillUrls(paths);
  const addBills = useAddPurchaseBills();
  const deleteBill = useDeletePurchaseBill();
  const [pendingDelete, setPendingDelete] = useState<PurchaseDocument | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!purchase || !list || list.length === 0) return;
    try {
      const failed = await addBills.mutateAsync({
        purchaseId: purchase.id,
        files: Array.from(list),
      });
      if (failed.length > 0)
        toast.error('Some files did not upload', { description: failed.join('; ') });
      else toast.success('Bill added');
    } catch (error) {
      toast.error('Could not upload', { description: (error as Error).message });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Dialog open={!!purchase} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {purchase ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {vendorName}
                {purchase.vendor_bill_number ? ` — bill ${purchase.vendor_bill_number}` : ''}
              </DialogTitle>
              <DialogDescription>
                {purchase.po_number} · {formatDate(purchase.order_date)}
                {locationName ? ` · ${locationName}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-medium">Items</h3>
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit cost</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(items ?? []).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {optionByKey.get(itemKey(item.product_id, item.variant_id))?.label ??
                                'Unknown product'}
                              {item.quantity_received > 0 &&
                              item.quantity_received < item.quantity_ordered ? (
                                <span className="block text-xs text-muted-foreground">
                                  {formatQuantity(item.quantity_received)} received
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatQuantity(item.quantity_ordered)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.unit_cost)}
                            </TableCell>
                            <TableCell className="text-right">{Number(item.tax_rate)}%</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.line_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="space-y-0.5 border-t p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Items + GST</span>
                        <span>{formatCurrency(purchase.subtotal + purchase.tax_amount)}</span>
                      </div>
                      {purchase.shipping_amount > 0 ? (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Shipping</span>
                          <span>{formatCurrency(purchase.shipping_amount)}</span>
                        </div>
                      ) : null}
                      {purchase.discount_amount > 0 ? (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Discount</span>
                          <span>− {formatCurrency(purchase.discount_amount)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>{formatCurrency(purchase.total_amount)}</span>
                      </div>
                    </div>
                  </div>
                )}
                {purchase.notes ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                    {purchase.notes}
                  </p>
                ) : null}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    Bill images <Badge variant="secondary">{documents.length}</Badge>
                  </h3>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={BILL_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={(e) => void upload(e.target.files)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={addBills.isPending}
                    onClick={() => inputRef.current?.click()}
                  >
                    {addBills.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    Add bill image
                  </Button>
                </div>
                {documents.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No bill attached yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {documents.map((doc) => {
                      const url = urls?.[doc.storage_path];
                      const isImage = doc.content_type?.startsWith('image/') ?? false;
                      return (
                        <div
                          key={doc.id}
                          className="group relative overflow-hidden rounded-lg border"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block aspect-[3/4] bg-muted"
                          >
                            {url && isImage ? (
                              <img
                                src={url}
                                alt={doc.file_name ?? 'Bill'}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
                                {url ? (
                                  <FileText className="h-8 w-8 text-muted-foreground" />
                                ) : (
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                )}
                                <span className="line-clamp-2 text-xs">{doc.file_name}</span>
                              </div>
                            )}
                          </a>
                          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={url} target="_blank" rel="noreferrer" aria-label="Open">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Delete bill image"
                              onClick={() => setPendingDelete(doc)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}

        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Delete bill image?"
          description={`"${pendingDelete?.file_name ?? 'This file'}" will be removed from the purchase.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            if (!pendingDelete) return;
            try {
              await deleteBill.mutateAsync(pendingDelete);
              toast.success('Bill image deleted');
            } catch (error) {
              toast.error('Could not delete', { description: (error as Error).message });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
