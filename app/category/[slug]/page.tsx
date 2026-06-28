/**
 * `/category/[slug]` — Category Detail Page (Task 11.3, Requirement 5, ISR 300s).
 *
 * Renders a single active Category: a header block with the Category icon, the
 * name as a single H1, the count of active Products, and the admin-editable
 * description (Req 5.1); the interactive product browser — subcategory pills,
 * sort control, filters, the responsive 2/3/4-column grid, and 20-per-page
 * "Load More" — delegated to the `CategoryProductBrowser` client component
 * (Req 5.3–5.12); a "Coupons for [Category]" section of `CouponCard`s below the
 * grid (Req 5.13); and an admin-editable SEO content block below the coupons
 * (Req 5.14). A BreadcrumbList JSON-LD (Home → Categories → Category) is
 * emitted via `stringifyJsonLd`. An unknown / inactive slug yields a 404 via
 * `notFound()` using the case-sensitive `resolveActiveCategory` (Req 5.2).
 *
 * Build model (`cacheComponents: true`, no database during `next build`):
 *   - `generateStaticParams` is resilient — it returns a single sentinel slug
 *     when the database is unavailable so the build never reads it; real slugs
 *     are generated on demand (Req 25.8).
 *   - `generateMetadata` calls `connection()` before any database read.
 *   - The page body is a static shell whose database-backed content lives inside
 *     a `<Suspense>` child that calls `connection()` before loading, so the
 *     shell prerenders without a database while the cached loaders provide the
 *     300s ISR window.
 */
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import {
  getActiveCategorySlugs,
  getCategoryListing,
  resolveActiveCategory,
  type CategoryDetailDTO,
} from '@/lib/catalog';
import {
  buildBreadcrumbListJsonLd,
  buildMetadata,
  contentAlt,
  stringifyJsonLd,
  type BreadcrumbItem,
} from '@/lib/seo';
import { CouponCard } from '@/components/CouponCard';
import { CategoryProductBrowser } from './CategoryProductBrowser';

/**
 * Build the static-param set for the category detail pages (Req 25.8).
 *
 * During `next build` there is no database, so the slug read throws; under
 * Cache Components a `generateStaticParams` must return at least one result
 * (an empty array raises `EmptyGenerateStaticParamsError`), so we fall back to
 * a single sentinel slug (mirroring `app/product/[slug]` and `app/deal/[slug]`).
 * The sentinel prerenders only the static shell — the database read is deferred
 * via `connection()` inside the Suspense boundary — and resolves to a 404 at
 * request time (Req 5.2). Real category slugs are generated on demand
 * (`dynamicParams` defaults to true) and revalidated on the 300s ISR window.
 */
const PLACEHOLDER_SLUG = '__category__';

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const slugs = await getActiveCategorySlugs();
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
  const category = await resolveActiveCategory(slug);

  if (!category) {
    return {
      title: 'Category not found',
      robots: { index: false, follow: true },
    };
  }

  const title =
    category.metaTitle?.trim() || `${category.name} Deals & Coupons`;
  const description =
    category.metaDescription?.trim() ||
    category.description?.trim() ||
    `Browse the latest ${category.name} products, deals, and coupons on DealSpark.`;

  return buildMetadata({
    title,
    description,
    path: `/category/${category.slug}`,
    imageUrl: category.iconUrl,
    siteName: 'DealSpark',
    ogType: 'website',
  });
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-4 py-6">
      {/* The page body is database-backed; defer it behind `<Suspense>` so the
          static shell prerenders WITHOUT a database while the cached loaders
          provide 300s ISR (Req 5, 25.8; `connection.md`, `use-cache.md`). */}
      <Suspense fallback={<CategorySkeleton />}>
        <CategoryContent slug={slug} />
      </Suspense>
    </main>
  );
}

async function CategoryContent({ slug }: { slug: string }) {
  await connection();
  const category = await resolveActiveCategory(slug);

  // Unknown / inactive slug → 404 error page (Req 5.2).
  if (!category) {
    notFound();
  }

  const listing = await getCategoryListing(category.id);

  // BreadcrumbList JSON-LD: Home → Categories → Category.
  const breadcrumbs: BreadcrumbItem[] = [
    { name: 'Home', path: '/' },
    { name: 'Categories', path: '/categories' },
    { name: category.name, path: `/category/${category.slug}` },
  ];
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd(breadcrumbs);

  const seoContent = category.metaDescription?.trim() ?? '';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbJsonLd) }}
      />

      <Breadcrumb category={category} />

      {/* Header block: icon, H1 name, active-product count, description (Req 5.1). */}
      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <CategoryIcon category={category} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {category.name}
          </h1>
          <p className="mt-1 text-sm text-secondary">
            {category.activeProductCount}{' '}
            {category.activeProductCount === 1 ? 'product' : 'products'}
          </p>
          {category.description?.trim() ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-secondary">
              {category.description}
            </p>
          ) : null}
        </div>
      </header>

      {/* Subcategory pills, sort control, filters, the responsive product grid,
          and 20-per-page "Load More" all live in the client browser
          (Req 5.3–5.12). */}
      <section className="mt-8" aria-label="Products">
        <CategoryProductBrowser
          products={listing.products}
          subcategories={listing.subcategories}
          stores={listing.stores}
        />
      </section>

      {/* "Coupons for [Category]" section below the grid (Req 5.13). */}
      {listing.coupons.length > 0 ? (
        <section
          className="mt-14"
          aria-label={`Coupons for ${category.name}`}
        >
          <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
            Coupons for {category.name}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listing.coupons.map((deal) => (
              <CouponCard key={deal.id} deal={deal} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Admin-editable SEO content block below the coupons section (Req 5.14). */}
      {seoContent.length > 0 ? (
        <section
          className="mt-14 border-t border-border pt-8"
          aria-label={`About ${category.name}`}
        >
          <h2 className="mb-3 text-lg font-bold tracking-tight text-foreground">
            About {category.name}
          </h2>
          <div className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-secondary">
            {seoContent}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** The category header icon, or an inline SVG placeholder (Req 5.1, 4.6). */
function CategoryIcon({ category }: { category: CategoryDetailDTO }) {
  if (category.iconUrl) {
    return (
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-card border border-border bg-card">
        <Image
          // Admin icons live on arbitrary object-storage hosts; serve them
          // directly to avoid optimizer host-allowlist rejections, matching the
          // other public pages.
          unoptimized
          src={category.iconUrl}
          alt={contentAlt(category.name)}
          fill
          sizes="64px"
          className="object-contain p-2"
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card border border-border bg-card"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-muted"
      >
        <path d="M3.75 5.25A1.5 1.5 0 0 1 5.25 3.75h5.379a1.5 1.5 0 0 1 1.06.44l8.122 8.12a1.5 1.5 0 0 1 0 2.122l-5.379 5.379a1.5 1.5 0 0 1-2.121 0l-8.122-8.122a1.5 1.5 0 0 1-.439-1.06V5.25Z" />
        <circle cx="8.25" cy="8.25" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

/** The three-item breadcrumb trail (Home → Categories → Category). */
function Breadcrumb({ category }: { category: CategoryDetailDTO }) {
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
            href="/categories"
            className="cursor-pointer transition-colors duration-200 hover:text-accent"
          >
            Categories
          </Link>
        </li>
        <li aria-hidden="true" className="text-muted">
          /
        </li>
        <li>
          <Link
            href={`/category/${category.slug}`}
            aria-current="page"
            className="cursor-pointer font-medium text-foreground transition-colors duration-200 hover:text-accent"
          >
            <span className="line-clamp-1">{category.name}</span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

/** Skeleton streamed in the static shell while the category data loads. */
function CategorySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-4 w-64 animate-pulse rounded bg-border" />
      <div className="mt-6 flex gap-5">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-card bg-border" />
        <div className="flex-1">
          <div className="h-8 w-1/2 animate-pulse rounded bg-border" />
          <div className="mt-2 h-4 w-24 animate-pulse rounded bg-border" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-border" />
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="h-64 w-full animate-pulse rounded-card bg-border" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[3/4] w-full animate-pulse rounded-card bg-border"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
