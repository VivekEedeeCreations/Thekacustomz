import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteProductImage,
  useReorderProductImages,
  useSetPrimaryImage,
  useUploadProductImage,
} from '@/features/products/mutations';
import {
  useProductImages,
  type BarcodeOwner,
  type ProductImage,
} from '@/features/products/queries';
import { productImagePublicUrl } from '@/lib/storage';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function ImageManager({ owner }: { owner: BarcodeOwner }) {
  const { data: images, isLoading } = useProductImages(owner);
  const uploadImage = useUploadProductImage(owner);
  const setPrimary = useSetPrimaryImage(owner);
  const deleteImage = useDeleteProductImage(owner);
  const reorder = useReorderProductImages(owner);
  const [pendingDelete, setPendingDelete] = useState<ProductImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextPosition = images?.length ?? 0;

    for (const [index, file] of Array.from(files).entries()) {
      if (file.size > MAX_SIZE_BYTES) {
        toast.error(`${file.name} is larger than 5 MB`);
        continue;
      }
      try {
        await uploadImage.mutateAsync({ file, position: nextPosition + index });
      } catch (error) {
        toast.error(`Could not upload ${file.name}`, { description: (error as Error).message });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const move = (image: ProductImage, direction: -1 | 1) => {
    if (!images) return;
    const sorted = [...images].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((i) => i.id === image.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    if (!a || !b) return;
    reorder.mutate([
      { id: a.id, position: b.position },
      { id: b.id, position: a.position },
    ]);
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      <RoleGate min="STAFF">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImage.isPending}
          >
            {uploadImage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Upload images
          </Button>
        </div>
      </RoleGate>

      {!images || images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {[...images]
            .sort((a, b) => a.position - b.position)
            .map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-lg border">
                <img
                  src={productImagePublicUrl(image.storage_path)}
                  alt={image.alt_text ?? ''}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                {image.is_primary ? (
                  <Badge className="absolute left-1.5 top-1.5">Primary</Badge>
                ) : null}
                <RoleGate min="STAFF">
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(image, -1)}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(image, 1)}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex">
                      {!image.is_primary ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Set as primary"
                          onClick={() => setPrimary.mutate(image.id)}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Delete image"
                        onClick={() => setPendingDelete(image)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </RoleGate>
              </div>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete image?"
        description="This removes the image from the product and from storage."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteImage.mutateAsync(pendingDelete);
          toast.success('Image deleted');
        }}
      />
    </div>
  );
}
