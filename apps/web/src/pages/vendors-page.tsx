import { useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ActiveBadge } from '@/components/active-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCreateVendor, useDeleteVendor, useUpdateVendor } from '@/features/vendors/mutations';
import { useVendors, type Vendor } from '@/features/vendors/queries';

const schema = z.object({
  company_name: z.string().min(1, 'Required').max(200),
  contact_person: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  address: z.string().max(2000).optional().or(z.literal('')),
  payment_terms: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function VendorFormDialog({ vendor, trigger }: { vendor?: Vendor; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: vendor?.company_name ?? '',
      contact_person: vendor?.contact_person ?? '',
      phone: vendor?.phone ?? '',
      email: vendor?.email ?? '',
      gstin: vendor?.gstin ?? '',
      address: vendor?.address ?? '',
      payment_terms: vendor?.payment_terms ?? '',
      notes: vendor?.notes ?? '',
      is_active: vendor?.is_active ?? true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      company_name: values.company_name,
      contact_person: values.contact_person || null,
      phone: values.phone || null,
      email: values.email || null,
      gstin: values.gstin ? values.gstin.toUpperCase() : null,
      address: values.address || null,
      payment_terms: values.payment_terms || null,
      notes: values.notes || null,
      is_active: values.is_active,
    };
    try {
      if (vendor) {
        await updateVendor.mutateAsync({ id: vendor.id, ...payload });
        toast.success('Vendor updated');
      } else {
        await createVendor.mutateAsync(payload);
        toast.success('Vendor created');
        form.reset();
      }
      setOpen(false);
    } catch (error) {
      toast.error('Could not save vendor', { description: (error as Error).message });
    }
  });

  const isSubmitting = createVendor.isPending || updateVendor.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? 'Edit vendor' : 'New vendor'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Company name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_person"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact person</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gstin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GSTIN</FormLabel>
                    <FormControl>
                      <Input placeholder="27ABCDE1234F1Z5" className="uppercase" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payment_terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment terms</FormLabel>
                  <FormControl>
                    <Input placeholder="Net 30" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="!m-0">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {vendor ? 'Save changes' : 'Create vendor'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function VendorsPage() {
  const { data: vendors, isLoading } = useVendors();
  const deleteVendor = useDeleteVendor();
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null);

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Suppliers you purchase from."
        actions={
          <RoleGate min="STAFF">
            <VendorFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  New vendor
                </Button>
              }
            />
          </RoleGate>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !vendors || vendors.length === 0 ? (
        <EmptyState icon={Truck} title="No vendors yet" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Status</TableHead>
                <RoleGate min="STAFF">
                  <TableHead className="w-24" />
                </RoleGate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.contact_person || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{vendor.phone || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{vendor.gstin || '—'}</TableCell>
                  <TableCell>
                    <ActiveBadge active={vendor.is_active} />
                  </TableCell>
                  <RoleGate min="STAFF">
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <VendorFormDialog
                          vendor={vendor}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <RoleGate min="ADMIN">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => setPendingDelete(vendor)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </RoleGate>
                      </div>
                    </TableCell>
                  </RoleGate>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete vendor?"
        description={`"${pendingDelete?.company_name}" will be permanently removed. This is blocked if it has purchase orders.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteVendor.mutateAsync(pendingDelete.id);
            toast.success('Vendor deleted');
          } catch (error) {
            toast.error('Could not delete vendor', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
