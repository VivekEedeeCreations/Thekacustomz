import { useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { LOCATION_TYPE_LABELS, LOCATION_TYPES } from '@inventory/shared';

import { ActiveBadge } from '@/components/active-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
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
import {
  useCreateLocation,
  useDeleteLocation,
  useUpdateLocation,
} from '@/features/locations/mutations';
import { useLocations, type Location } from '@/features/locations/queries';

const schema = z.object({
  code: z.string().min(1, 'Required').max(32),
  name: z.string().min(1, 'Required').max(120),
  location_type: z.enum(LOCATION_TYPES),
  address: z.string().max(2000).optional().or(z.literal('')),
  is_active: z.boolean(),
  is_default: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function LocationFormDialog({ location, trigger }: { location?: Location; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: location?.code ?? '',
      name: location?.name ?? '',
      location_type: location?.location_type ?? 'WAREHOUSE',
      address: location?.address ?? '',
      is_active: location?.is_active ?? true,
      is_default: location?.is_default ?? false,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = { ...values, address: values.address || null };
    try {
      if (location) {
        await updateLocation.mutateAsync({ id: location.id, ...payload });
        toast.success('Location updated');
      } else {
        await createLocation.mutateAsync(payload);
        toast.success('Location created');
        form.reset();
      }
      setOpen(false);
    } catch (error) {
      toast.error('Could not save location', { description: (error as Error).message });
    }
  });

  const isSubmitting = createLocation.isPending || updateLocation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{location ? 'Edit location' : 'New location'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="WH1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LOCATION_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {LOCATION_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="!m-0">Default location</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Pre-selected on new stock movements.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
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
                {location ? 'Save changes' : 'Create location'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function LocationsPage() {
  const { data: locations, isLoading } = useLocations();
  const deleteLocation = useDeleteLocation();
  const [pendingDelete, setPendingDelete] = useState<Location | null>(null);

  return (
    <div>
      <PageHeader
        title="Locations"
        description="Warehouses, stores, and production sites that hold stock."
        actions={
          <RoleGate min="STAFF">
            <LocationFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  New location
                </Button>
              }
            />
          </RoleGate>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !locations || locations.length === 0 ? (
        <EmptyState icon={MapPin} title="No locations yet" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <RoleGate min="STAFF">
                  <TableHead className="w-24" />
                </RoleGate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className="font-medium">
                    {location.code}
                    {location.is_default ? (
                      <Badge variant="outline" className="ml-2">
                        Default
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{location.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {LOCATION_TYPE_LABELS[location.location_type]}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={location.is_active} />
                  </TableCell>
                  <RoleGate min="STAFF">
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <LocationFormDialog
                          location={location}
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
                            onClick={() => setPendingDelete(location)}
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
        title="Delete location?"
        description={`"${pendingDelete?.name}" will be removed. This is blocked if it still has inventory or movement history.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteLocation.mutateAsync(pendingDelete.id);
            toast.success('Location deleted');
          } catch (error) {
            toast.error('Could not delete location', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
