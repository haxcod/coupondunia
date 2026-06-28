/**
 * `/product/[slug]` — Product Detail Page (Task 11.4, Requirement 6, ISR 600s).
 *
 * Renders a single active Product: a three-item breadcrumb (Home → Category →
 * Product, Req 6.1) with BreadcrumbList JSON-LD, a 1:1 primary image, the store
 * name/logo and an H1 title (Req 6.3), the current price with an optional
 * strikethrough original price and integer discount badge (Req 6.4), an optional
 * countdown when an offer expiry is in the future (Req 6.5/6.6), the affiliate
 * call-to-action (`ClickCTA`) plus an affiliate disclosure (Req 6.7), a
 * show-more description when it exceeds 300 characters (Req 6.8), the store's
 * other deals (Req 6.9), similar products (Req 6.10), and a price-may-differ
 * disclaimer with a "last verified on" date (Req 6.11). Product JSON-LD is
 * emitted via `buildProductJsonLd` and carries the public page URL only — never
 * the affiliate URL (Req 7.9/24.1).
 *
 * Build model (`cacheComponents: true`, no database during `next build`):
 *   - `generateStaticParams` is resilient — it returns `[]` when the database is
 *     unavailable so the build never reads it; pages are generated on demand.
 *   - `generateMetadata` calls `connection()` before any database read.
 *   - The page body is a static shell whose database-backed content lives inside
 *     a `<Suspense>` child that calls `connection()` before loading, so the shell
 *     prerenders without a database while the cached loader provides 600s ISR.
 */
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import {
  getActiveProductSlugs,
  getProductDetailView,
  type CategoryRef,
  type ProductDetailDTO,
} from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import {
  buildBreadcrumbListJsonLd,
  buildMetadata,
  buildProductJsonLd,
  contentAlt,
  stringifyJsonLd,
  type BreadcrumbItem,
} from '@/lib/seo';
import { CouponCard } from '@/components/CouponCard';
import { ProductCard } from '@/components/ProductCard';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { StoreLogo } from '@/components/StoreLogo';
import { CountdownTimer } from '@/components/CountdownTimer';
import { ShowMoreDescription } from '@/components/ShowMoreDescription';
import ClickCTA from '@/components/ClickCTA';

/** Default affiliate disclosure shown when none is configured (Req 6.7). */
const DEFAULT_AFFILIATE_DISCLOSURE =
  'DealSpark may earn a commission when you buy through links on this page, at no extra cost to you.';

/** Fixed month abbreviations for deterministic `DD Mon YYYY` formatting (Req 6.11). */
const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Indian-locale rupee formatter (drops a trailing `.00` for whole rupees). */
const RUPEE_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format an integer-paise amount as a display rupee string (Req 6.4). */
function formatPaise(paise: number): string {
  return RUPEE_FORMAT.format(paise / 100);
}

/** Format a date as `DD Mon YYYY` using UTC fields for deterministic output. */
function formatVerifiedDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/**
 * Build the static-param set for the product detail pages (Req 25.8).
 *
 * During `next build` there is no database, so the slug read throws; under
 * Cache Components a `generateStaticParams` must return at least one result
 * (an empty array raises `EmptyGenerateStaticParamsError`), so we fall back to
 * a single sentinel slug (mirroring `app/deal/[slug]` and `app/sitemap.ts`).
 * The sentinel prerenders only the static shell — the database read is deferred
 * via `connection()` inside the Suspense boundary — and resolves to a 404 at
 * request time (Req 6.2). Real product slugs are generated on demand
 * (`dynamicParams` defaults to true) and revalidated on the 600s ISR window.
 */
const PLACEHOLDER_SLUG = '__product__';

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const slugs = await getActiveProductSlugs();
    if (slugs.length > 0) {
      return slugs.map((slug) => ({ slug }));
    }
  } catch {
    // No database at build time — fall through to the sentinel below.
  }
  return [{ slug: PLACEHOLDER_SLUG }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // Defer the database-backed read to request time so the build never reads it
  // (`connection.md`, `generate-metadata.md`).
  await connection();
  const { slug } = await params;
  const view = await getProductDetailView(slug);

  if (!view) {
    return {
      title: 'Product not found',
      robots: { index: false, follow: false },
    };
  }

  const { product } = view;
  const title = product.metaTitle?.trim() || product.title;
  const description =
    product.metaDescription?.trim() ||
    `Shop ${product.title} from ${product.storeName} on DealSpark and find the latest price and offer.`;

  return buildMetadata({
    title,
    description,
    path: `/product/${product.slug}`,
    imageUrl: product.primaryImageUrl,
    ogType: 'article',
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-4 py-6">
      {/* The page body is database-backed; defer it behind `<Suspense>` so the
          static shell prerenders WITHOUT a database while the cached loader
          provides 600s ISR (Req 6, 25.8; `connection.md`, `use-cache.md`). */}
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent slug={slug} />
      </Suspense>
    </main>
  );
}

async function ProductContent({ slug }: { slug: string }) {
  await connection();
  const [view, settings] = await Promise.all([
    getProductDetailView(slug),
    getSettings(),
  ]);

  // Unknown / inactive slug → 404 error page (Req 6.2).
  if (!view) {
    notFound();
  }

  const { product, category, storeDeals, similarProducts } = view;
  const disclosure =
    settings.defaultAffiliateDisclosure.trim() || DEFAULT_AFFILIATE_DISCLOSURE;

  // Build the three-item breadcrumb (Home → Category → Product, Req 6.1).
  const categoryCrumb: BreadcrumbItem = category
    ? { name: category.name, path: `/category/${category.slug}` }
    : { name: 'Categories', path: '/categories' };
  const breadcrumbs: BreadcrumbItem[] = [
    { name: 'Home', path: '/' },
    categoryCrumb,
    { name: product.title, path: `/product/${product.slug}` },
  ];

  // Product JSON-LD — public page URL only, never the affiliate URL (Req 7.9).
  const productJsonLd = buildProductJsonLd({
    path: `/product/${product.slug}`,
    title: product.title,
    description: product.description,
    storeName: product.storeName,
    currentPrice: product.currentPrice,
    primaryImageUrl: product.primaryImageUrl,
    additionalImages: product.additionalImages,
    inStock: product.hasAffiliateUrl,
  });
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd(breadcrumbs);

  const now = Date.now();
  const hasCountdown =
    product.offerExpiresAt !== null &&
    product.offerExpiresAt.getTime() > now;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbJsonLd) }}
      />

      <Breadcrumb category={category} product={product} />

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* 1:1 primary product image (Req 6.3). */}
        <div className="relative aspect-square w-full overflow-hidden rounded-card border border-border bg-card">
          <Image
            // Admin images live on arbitrary object-storage hosts; serve them
            // directly to avoid optimizer host-allowlist rejections, matching
            // the other public pages.
            unoptimized
            src={product.primaryImageUrl}
            alt={contentAlt(product.title)}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
          />
        </div>

        {/* Product summary column. */}
        <div className="flex flex-col gap-4">
          {/* Store name + logo (Req 6.3). */}
          <div className="flex items-center gap-3">
            <StoreLogo
              name={product.storeName}
              logoUrl={product.storeLogoUrl}
              size={40}
            />
            <span className="text-sm font-medium text-secondary">
              {product.storeName}
            </span>
          </div>

          {/* H1 title (Req 6.3). */}
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
            {product.title}
          </h1>

          {/* Price block + optional strikethrough + discount badge (Req 6.4). */}
          <PriceBlock product={product} />

          {/* Countdown to the offer expiry while it is in the future (Req 6.5/6.6). */}
          {hasCountdown ? (
            <CountdownTimer
              expiry={product.offerExpiresAt as Date}
              nowMs={now}
              label="Offer ends in"
              expiredLabel="This offer has expired"
              className="rounded-control border border-border bg-card p-3"
            />
          ) : null}

          {/* Affiliate CTA + disclosure (Req 6.7). */}
          <div className="mt-2">
            <ClickCTA
              kind="product"
              id={product.id}
              label={product.buttonLabel}
              disabled={!product.hasAffiliateUrl}
            />
            <p className="mt-2 text-xs text-muted">{disclosure}</p>
          </div>

          {/* Key features, when present. */}
          {product.keyFeatures.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-secondary">
              {product.keyFeatures.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Description with a show-more toggle past 300 characters (Req 6.8). */}
      {product.description.trim().length > 0 ? (
        <section className="mt-10" aria-label="Product description">
          <h2 className="mb-3 text-lg font-bold tracking-tight text-foreground">
            Description
          </h2>
          <ShowMoreDescription description={product.description} />
        </section>
      ) : null}

      {/* Store's other active deals (Req 6.9). */}
      {storeDeals.length > 0 ? (
        <section className="mt-12" aria-label={`More from ${product.storeName}`}>
          <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
            More from {product.storeName}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {storeDeals.map((deal) => (
              <CouponCard key={deal.id} deal={deal} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Similar products in the same category (Req 6.10). */}
      {similarProducts.length > 0 ? (
        <section className="mt-12" aria-label="Similar products">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
            Similar Products
          </h2>
          <ResponsiveGrid aria-label="Similar products">
            {similarProducts.map((item) => (
              <div role="listitem" key={item.id}>
                <ProductCard product={item} />
              </div>
            ))}
          </ResponsiveGrid>
        </section>
      ) : null}

      {/* Price-may-differ disclaimer + last-verified date (Req 6.11). */}
      <section className="mt-12 rounded-card border border-border bg-card p-4 text-xs text-muted">
        <p>
          Prices and availability are accurate as of the date/time indicated and
          may change. The final price shown on the merchant&apos;s site at
          checkout applies to your purchase.
        </p>
        <p className="mt-2">
          Last verified on {formatVerifiedDate(product.lastVerifiedAt)}.
        </p>
      </section>
    </>
  );
}

/** Price block: bold current price, optional strikethrough + discount badge (Req 6.4). */
function PriceBlock({ product }: { product: ProductDetailDTO }) {
  const hasOriginalPrice =
    product.originalPrice !== null && product.originalPrice > product.currentPrice;
  const hasDiscountBadge =
    product.discountPercent !== null &&
    product.discountPercent >= 1 &&
    product.discountPercent <= 100;

  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <span className="text-3xl font-bold text-foreground">
        {formatPaise(product.currentPrice)}
      </span>
      {hasOriginalPrice ? (
        <span className="text-lg text-muted line-through">
          {formatPaise(product.originalPrice as number)}
        </span>
      ) : null}
      {hasDiscountBadge ? (
        <span className="rounded-badge bg-accent px-2 py-0.5 text-sm font-semibold text-card">
          {product.discountPercent}% OFF
        </span>
      ) : null}
    </div>
  );
}

/** The three-item breadcrumb trail (Req 6.1). */
function Breadcrumb({
  category,
  product,
}: {
  category: CategoryRef | null;
  product: ProductDetailDTO;
}) {
  const categoryHref = category ? `/category/${category.slug}` : '/categories';
  const categoryLabel = category ? category.name : 'Categories';

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-secondary">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link
            href="/"
            className="cursor-pointer transition-colors duration-200 hover:text-accent"
          >
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="text-muted">
          /
        </li>
        <li>
          <Link
            href={categoryHref}
            className="cursor-pointer transition-colors duration-200 hover:text-accent"
          >
            {categoryLabel}
          </Link>
        </li>
        <li aria-hidden="true" className="text-muted">
          /
        </li>
        <li>
          <Link
            href={`/product/${product.slug}`}
            aria-current="page"
            className="cursor-pointer font-medium text-foreground transition-colors duration-200 hover:text-accent"
          >
            <span className="line-clamp-1">{product.title}</span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

/** Skeleton streamed in the static shell while the product data loads. */
function ProductSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-4 w-64 animate-pulse rounded bg-border" />
      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-card bg-border" />
        <div className="flex flex-col gap-4">
          <div className="h-5 w-32 animate-pulse rounded bg-border" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-border" />
          <div className="h-9 w-40 animate-pulse rounded bg-border" />
          <div className="h-11 w-full animate-pulse rounded-control bg-border" />
        </div>
      </div>
    </div>
  );
}
