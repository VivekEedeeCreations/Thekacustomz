import { Package } from 'lucide-react';

import type { ProductImage } from '@/features/products/queries';
import { productImagePublicUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';

/**
 * Square thumbnail for a product or variant. `image` is the item's own picture; `fallback`
 * (e.g. the parent product's) is shown faded when it has none, and a package icon after that.
 */
export function ItemThumbnail({
  image,
  fallback,
  alt,
  className,
}: {
  image?: ProductImage;
  fallback?: ProductImage;
  alt: string;
  className?: string;
}) {
  const shown = image ?? fallback;
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted',
        className,
      )}
    >
      {shown ? (
        <img
          src={productImagePublicUrl(shown.storage_path)}
          alt={shown.alt_text ?? alt}
          className={cn('h-full w-full object-cover', !image && 'opacity-50')}
          loading="lazy"
        />
      ) : (
        <Package className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
