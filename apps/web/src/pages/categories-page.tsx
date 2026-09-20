import { useMemo, useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
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
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/categories/mutations';
import { useCategories, type Category } from '@/features/categories/queries';

const NONE = '__none__';

const schema = z.object({
  name: z.string().min(1, 'Required').max(120),
  parent_id: z.string(),
  slug: z.string().max(120).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function CategoryFormDialog({
  category,
  categories,
  trigger,
}: {
  category?: Category;
  categories: Category[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? '',
      parent_id: category?.parent_id ?? NONE,
      slug: category?.slug ?? '',
      description: category?.description ?? '',
      is_active: category?.is_active ?? true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      parent_id: values.parent_id === NONE ? null : values.parent_id,
      slug: values.slug || null,
      description: values.description || null,
      is_active: values.is_active,
    };
    try {
      if (category) {
        await updateCategory.mutateAsync({ id: category.id, ...payload });
        toast.success('Category updated');
      } else {
        await createCategory.mutateAsync(payload);
        toast.success('Category created');
        form.reset({ name: '', parent_id: NONE, slug: '', description: '', is_active: true });
      }
      setOpen(false);
    } catch (error) {
      toast.error('Could not save category', { description: (error as Error).message });
    }
  });

  const isSubmitting = createCategory.isPending || updateCategory.isPending;
  const parentOptions = categories.filter((c) => c.id !== category?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
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
              name="parent_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>None (top level)</SelectItem>
                      {parentOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="drinkware" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
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
                {category ? 'Save changes' : 'Create category'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const deleteCategory = useDeleteCategory();
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const parentName = useMemo(() => {
    const map = new Map((categories ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? '—') : '—');
  }, [categories]);

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organize products into a category hierarchy."
        actions={
          <RoleGate min="STAFF">
            <CategoryFormDialog
              categories={categories ?? []}
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  New category
                </Button>
              }
            />
          </RoleGate>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !categories || categories.length === 0 ? (
        <EmptyState icon={Tags} title="No categories yet" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Status</TableHead>
                <RoleGate min="STAFF">
                  <TableHead className="w-24" />
                </RoleGate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {parentName(category.parent_id)}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={category.is_active} />
                  </TableCell>
                  <RoleGate min="STAFF">
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <CategoryFormDialog
                          category={category}
                          categories={categories}
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
                            onClick={() => setPendingDelete(category)}
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
        title="Delete category?"
        description={`"${pendingDelete?.name}" will be removed. Products in it keep their other data and become uncategorized.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteCategory.mutateAsync(pendingDelete.id);
            toast.success('Category deleted');
          } catch (error) {
            toast.error('Could not delete category', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
