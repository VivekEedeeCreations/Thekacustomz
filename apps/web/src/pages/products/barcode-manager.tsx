import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { BARCODE_SYMBOLOGIES } from '@inventory/shared';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateBarcode,
  useDeleteBarcode,
  useGenerateEan13Barcode,
  useSetPrimaryBarcode,
} from '@/features/products/mutations';
import { useBarcodes, type Barcode, type BarcodeOwner } from '@/features/products/queries';

const schema = z.object({
  barcode: z.string().min(4, 'At least 4 characters').max(64),
  symbology: z.enum(BARCODE_SYMBOLOGIES),
});
type FormValues = z.infer<typeof schema>;

function AddBarcodeDialog({ owner }: { owner: BarcodeOwner }) {
  const [open, setOpen] = useState(false);
  const createBarcode = useCreateBarcode(owner);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { barcode: '', symbology: 'CODE128' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createBarcode.mutateAsync(values);
      toast.success('Barcode added');
      form.reset({ barcode: '', symbology: 'CODE128' });
      setOpen(false);
    } catch (error) {
      toast.error('Could not add barcode', { description: (error as Error).message });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Add manually
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add barcode</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barcode value</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="symbology"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbology</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BARCODE_SYMBOLOGIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createBarcode.isPending}>
                {createBarcode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function BarcodeManager({ owner }: { owner: BarcodeOwner }) {
  const { data: barcodes, isLoading } = useBarcodes(owner);
  const generateEan13 = useGenerateEan13Barcode(owner);
  const setPrimary = useSetPrimaryBarcode(owner);
  const deleteBarcode = useDeleteBarcode(owner);
  const [pendingDelete, setPendingDelete] = useState<Barcode | null>(null);

  const handleGenerate = async () => {
    try {
      await generateEan13.mutateAsync({ isPrimary: !barcodes?.length });
      toast.success('EAN-13 barcode generated');
    } catch (error) {
      toast.error('Could not generate barcode', { description: (error as Error).message });
    }
  };

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-3">
      <RoleGate min="STAFF">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={generateEan13.isPending}
          >
            {generateEan13.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate EAN-13
          </Button>
          <AddBarcodeDialog owner={owner} />
        </div>
      </RoleGate>

      {!barcodes || barcodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No barcodes yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {barcodes.map((barcode) => (
            <li key={barcode.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{barcode.barcode}</span>
                <Badge variant="outline">{barcode.symbology}</Badge>
                {barcode.is_primary ? <Badge>Primary</Badge> : null}
              </div>
              <RoleGate min="STAFF">
                <div className="flex items-center gap-1">
                  {!barcode.is_primary ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Set as primary"
                      onClick={() => setPrimary.mutate(barcode.id)}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <RoleGate min="ADMIN">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete barcode"
                      onClick={() => setPendingDelete(barcode)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </RoleGate>
                </div>
              </RoleGate>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete barcode?"
        description={`"${pendingDelete?.barcode}" will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteBarcode.mutateAsync(pendingDelete.id);
          toast.success('Barcode deleted');
        }}
      />
    </div>
  );
}
