/**
 * ProductCard — the reusable product summary tile used across the Public_Site
 * (Req 2). It is a server component: the static shell (store name, title,
 * prices, discount badge) renders to HTML for SEO, and only the image fallback
 * is delegated to a tiny client child (`ProductCardImage`).
 *
 * **Affiliate-URL confidentiality (Req 7.9 / Property 11).** This component is
 * driven by `ProductCardDTO`, which deliberately omits the affiliate URL. The
 * card therefore cannot leak it into markup. The card navigates to the product
 * detail page (`/product/[slug]`); the actual affiliate redirect is performed
 * later by the separate `ClickCTA` (Task 10.4) via `POST /api/public/click`.
 * When `hasAffiliateUrl` is false the "VIEW DEAL →" CTA renders disabled and
 * performs no navigation (Req 2.9).
 *
 * Visual spec (Req 2.1–2.5): white background, 12px radius, drop shadow, a 1:1
 * lazy image, store name, a 2-line truncated title, a bold current price, an
 * optional strikethrough original price, and an optional integer `%` discount
 * badge. Hover feedback is shadow/border only — no layout shift.
 */
import Link from 'next/link';

import type { ProductCardDTO } from '@/lib/catalog';
import { ProductCardImage } from './ProductCardImage';

interface ProductCardProps {
  product: ProductCardDTO;
}

/** Indian-locale rupee formatter; drops the trailing `.00` for whole rupees. */
const RUPEE_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format an integer-paise amount into a display rupee string (Req 2.2). */
function formatPaise(paise: number): string {
  return RUPEE_FORMAT.format(paise / 100);
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
  const hasOriginalPrice =
    originalPrice !== null && originalPrice > currentPrice;

  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
      <Link
        href={`/product/${slug}`}
        className="group flex flex-1 flex-col focus-visible:outline-none"
      >
        {/* 1:1 image container with lazy load + placeholder fallback (Req 2.1, 2.6, 2.7). */}
        <div className="relative aspect-square w-full overflow-hidden bg-background">
          <ProductCardImage src={primaryImageUrl} alt={title} />
          {hasDiscountBadge && (
            <span className="absolute left-2 top-2 rounded-badge bg-accent px-2 py-0.5 text-xs font-semibold text-card">
              {discountPercent}%
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          {storeName && (
            <p className="truncate text-xs font-medium uppercase tracking-wide text-secondary">
              {storeName}
            </p>
          )}

          {/* Title truncated to 2 lines with trailing ellipsis (Req 2.1). */}
          <h3 className="line-clamp-2 text-sm font-medium text-foreground transition-colors duration-200 group-hover:text-accent">
            {title}
          </h3>

          {/* Price block: bold current price + optional strikethrough original (Req 2.2, 2.3, 2.5). */}
          <div className="mt-auto flex items-baseline gap-2 pt-1">
            <span className="text-base font-bold text-foreground">
              {formatPaise(currentPrice)}
            </span>
            {hasOriginalPrice && (
              <span className="text-sm text-muted line-through">
                {formatPaise(originalPrice)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* CTA region. Disabled (non-navigating) when no affiliate URL (Req 2.9).
          The enabled affiliate redirect is wired by ClickCTA (Task 10.4); until
          then the enabled CTA routes to the product detail page. */}
      <div className="px-3 pb-3">
        {hasAffiliateUrl ? (
          <Link
            href={`/product/${slug}`}
            className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-card transition-colors duration-200 hover:bg-accent-hover"
          >
            VIEW DEAL
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-control bg-border px-3 py-2 text-sm font-semibold text-muted"
          >
            VIEW DEAL
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        )}
      </div>
    </article>
  );
}
