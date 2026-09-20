import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from '@inventory/shared';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCategories } from '@/features/categories/queries';
import { useCreateProduct, useUpdateProduct } from '@/features/products/mutations';
import { useProduct } from '@/features/products/queries';

import { BarcodeManager } from './barcode-manager';
import { ImageManager } from './image-manager';
import { VariantManager } from './variant-manager';

const NONE = '__none__';

const schema = z.object({
  sku: z.string().min(1, 'Required').max(64),
  name: z.string().min(1, 'Required').max(200),
  description: z.string().max(4000).optional().or(z.literal('')),
  category_id: z.string(),
  product_type: z.enum(PRODUCT_TYPES),
  unit_of_measure: z.string().min(1).max(16),
  hsn_sac_code: z.string().max(8).optional().or(z.literal('')),
  cost_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100),
  minimum_stock_level: z.coerce.number().min(0),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEditing = !!productId;
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole('STAFF');

  const { data: product, isLoading } = useProduct(productId);
  const { data: categories } = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: product
      ? {
          sku: product.sku,
          name: product.name,
          description: product.description ?? '',
          category_id: product.category_id ?? NONE,
          product_type: product.product_type,
          unit_of_measure: product.unit_of_measure,
          hsn_sac_code: product.hsn_sac_code ?? '',
          cost_price: product.cost_price,
          selling_price: product.selling_price,
          tax_rate: product.tax_rate,
          minimum_stock_level: product.minimum_stock_level,
          is_active: product.is_active,
        }
      : undefined,
    defaultValues: {
      sku: '',
      name: '',
      description: '',
      category_id: NONE,
      product_type: 'PRODUCT',
      unit_of_measure: 'PCS',
      hsn_sac_code: '',
      cost_price: 0,
      selling_price: 0,
      tax_rate: 0,
      minimum_stock_level: 0,
      is_active: true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      sku: values.sku,
      name: values.name,
      description: values.description || null,
      category_id: values.category_id === NONE ? null : values.category_id,
      product_type: values.product_type,
      unit_of_measure: values.unit_of_measure,
      hsn_sac_code: values.hsn_sac_code || null,
      cost_price: values.cost_price,
      selling_price: values.selling_price,
      tax_rate: values.tax_rate,
      minimum_stock_level: values.minimum_stock_level,
      is_active: values.is_active,
    };
    try {
      if (isEditing && product) {
        await updateProduct.mutateAsync({ id: product.id, ...payload });
        toast.success('Product updated');
      } else {
        const created = await createProduct.mutateAsync(payload);
        toast.success('Product created — now add variants, barcodes, and images below');
        navigate(`/products/${created.id}`, { replace: true });
      }
    } catch (error) {
      toast.error('Could not save product', { description: (error as Error).message });
    }
  });

  if (isEditing && isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const isSubmitting = createProduct.isPending || updateProduct.isPending;

  return (
    <div>
      <PageHeader
        title={isEditing ? (product?.name ?? 'Product') : 'New product'}
        description={
          isEditing
            ? `SKU ${product?.sku}`
            : 'Create the base product, then add variants and barcodes.'
        }
      />

      <div className="max-w-2xl rounded-lg border p-4 sm:p-6">
        <Form {...form}>
          <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-70">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
              </div>

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

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Uncategorized</SelectItem>
                          {categories?.map((c) => (
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
                  name="product_type"
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
                          {PRODUCT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {PRODUCT_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Raw materials feed a future production module.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="unit_of_measure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of measure</FormLabel>
                      <FormControl>
                        <Input placeholder="PCS" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hsn_sac_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HSN/SAC code</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="cost_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="selling_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selling price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tax_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST rate (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" max="100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="minimum_stock_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum stock level</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" className="max-w-40" {...field} />
                    </FormControl>
                    <FormDescription>Used to flag low stock on the Inventory page.</FormDescription>
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

              {canEdit ? (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isEditing ? 'Save changes' : 'Create product'}
                </Button>
              ) : null}
            </form>
          </fieldset>
        </Form>
      </div>

      {isEditing && product ? (
        <div className="mt-8">
          <Tabs defaultValue="variants">
            <TabsList>
              <TabsTrigger value="variants">Variants</TabsTrigger>
              <TabsTrigger value="barcodes">Barcodes</TabsTrigger>
              <TabsTrigger value="images">Images</TabsTrigger>
            </TabsList>
            <TabsContent value="variants">
              <VariantManager productId={product.id} />
            </TabsContent>
            <TabsContent value="barcodes">
              <BarcodeManager owner={{ productId: product.id }} />
            </TabsContent>
            <TabsContent value="images">
              <ImageManager owner={{ productId: product.id }} />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}
