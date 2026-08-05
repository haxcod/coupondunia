/**
 * ProductCard — the product tile used in "Featured Deals" and product listings,
 * styled to the Coupon Saga design: a 1:1 image with a purple discount badge,
 * store name, title, price with a savings line, and a "Shop Now" button.
 *
 * Server component; only the image fallback (ProductCardImage) is a client
 * child. Driven by ProductCardDTO, which omits the affiliate URL — the card
 * links to /product/[slug] and the real redirect happens via the click API.
 * When there is no affiliate URL the CTA renders disabled (Req 2.9).
 */
import Link from 'next/link';

import type { ProductCardDTO } from '@/lib/catalog';
import { ProductCardImage } from './ProductCardImage';

interface ProductCardProps {
  product: ProductCardDTO;
}

const RUPEE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function rupees(paise: number): string {
  return RUPEE.format(paise / 100);
}

export function ProductCard({ product }: ProductCardProps) {
  const {
    title,
    slug,
    storeName,
    currentPrice,
    originalPrice,
    discountPercent,
    primaryImageUrl,
    hasAffiliateUrl,
  } = product;

  const hasDiscountBadge =
    discountPercent !== null && discountPercent >= 1 && discountPercent <= 100;
  const hasOriginalPrice = originalPrice !== null && originalPrice > currentPrice;
  const savings = hasOriginalPrice ? originalPrice - currentPrice : 0;

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-border bg-card transition-all duration-300 ease-out hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
      <Link
        href={`/product/${slug}`}
        className="flex flex-1 flex-col focus-visible:outline-none"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-surface">
          {/* Scaling the frame contents keeps the card box static. */}
          <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-105">
            <ProductCardImage src={primaryImageUrl} alt={title} />
          </div>
          {hasDiscountBadge && (
            <span className="absolute left-3 top-3 rounded-badge bg-accent px-2.5 py-1 text-xs font-bold text-white">
              {discountPercent}% OFF
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          {storeName && (
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
              {storeName}
            </p>
          )}

          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-accent">
            {title}
          </h3>

          <div className="mt-auto pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold tracking-tight text-foreground">
                {rupees(currentPrice)}
              </span>
              {hasOriginalPrice && (
                <span className="text-sm text-muted line-through">
                  {rupees(originalPrice)}
                </span>
              )}
            </div>
            {savings > 0 && (
              <p className="mt-0.5 text-xs font-semibold text-success">
                Save {rupees(savings)}
              </p>
            )}
          </div>
        </div>
      </Link>

      <div className="px-4 pb-4">
        {hasAffiliateUrl ? (
          <Link
            href={`/product/${slug}`}
            className="press flex w-full items-center justify-center rounded-control bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Shop Now
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex w-full cursor-not-allowed items-center justify-center rounded-control bg-surface px-3 py-2.5 text-sm font-semibold text-muted"
          >
            Shop Now
          </button>
        )}
      </div>
    </article>
  );
}
