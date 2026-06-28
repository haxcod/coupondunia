import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";

import HeroCarousel from "@/components/HeroCarousel";
import { ProductCard } from "@/components/ProductCard";
import { CouponCard } from "@/components/CouponCard";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";
import { StoreLogo } from "@/components/StoreLogo";
import { getActiveBanners, getHomepageData } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import {
  buildMetadata,
  buildWebSiteJsonLd,
  stringifyJsonLd,
} from "@/lib/seo";

/** Default featured-products heading when none is admin-configured (Req 1.16). */
const FEATURED_SECTION_TITLE = "Featured Deals";

/**
 * Homepage metadata (Req 24.x): canonical `/`, Open Graph tags, site name from
 * Settings. Falls back to the tagline / a default description when the SEO
 * default description is blank.
 */
export async function generateMetadata(): Promise<Metadata> {
  // Metadata is sourced from the database-backed Settings singleton, which is
  // unavailable during prerender. `connection()` defers metadata resolution to
  // request time (streamed metadata, `generate-metadata.md`) so the build never
  // reads the database, while `getSettings()` keeps its `use cache` for runtime
  // caching (`connection.md`, `use-cache.md`).
  await connection();
  const settings = await getSettings();
  const title = settings.tagline
    ? `${settings.siteName} — ${settings.tagline}`
    : settings.siteName;
  const description =
    settings.defaultMetaDescription ||
    settings.tagline ||
    "Discover the best deals, coupons, and offers from top stores.";

  return buildMetadata({
    title,
    description,
    path: "/",
    imageUrl: settings.logoUrl,
    siteName: settings.siteName,
    ogType: "website",
  });
}

export default function Home() {
  // The homepage body is entirely database-backed (banners, featured products,
  // category sections, coupons, stores). Rendering it behind `<Suspense>` lets
  // the static shell prerender WITHOUT a database; `HomeContent` defers the
  // cached reads to request time via `connection()` (Req 1, 25.8).
  return (
    <main className="flex-1">
      <Suspense fallback={<HomeFallback />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

async function HomeContent() {
  // Defer the cached catalog/settings reads to request time so prerender does
  // not require a database; the loaders retain `use cache` for runtime ISR
  // (`connection.md`, `use-cache.md`).
  await connection();
  const [settings, banners, homepage] = await Promise.all([
    getSettings(),
    getActiveBanners(),
    getHomepageData(),
  ]);

  const {
    pillRowCategories,
    featuredProducts,
    categorySections,
    todaysBestCoupons,
    popularStores,
  } = homepage;

  // WebSite + SearchAction structured data for the homepage (Req 24.9).
  const websiteJsonLd = buildWebSiteJsonLd({ siteName: settings.siteName });

  return (
    <>
      {/* WebSite + SearchAction JSON-LD (Req 24.9). */}
      <script
        type="application/ld+json"
        // stringifyJsonLd escapes `<`/`>`/`&` so the payload can't break out
        // of the script element (Req 24.9).
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(websiteJsonLd) }}
      />

      {/* Hero carousel — hidden when there are no active banners (Req 1.3/1.6).
          HeroCarousel renders null on an empty list; guard the wrapper too so
          no empty spacing remains. */}
      {banners.length > 0 ? (
        <section className="mx-auto w-full max-w-content px-4 pt-4">
          <HeroCarousel banners={banners} />
        </section>
      ) : null}

      {/* Category pill row — up to 10 active categories + a "View All" pill
          (Req 1.8). Horizontally scrollable on small viewports. */}
      {pillRowCategories.length > 0 ? (
        <section
          aria-label="Browse categories"
          className="mx-auto w-full max-w-content px-4 pt-6"
        >
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pillRowCategories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-badge border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
              >
                {category.name}
              </Link>
            ))}
            <Link
              href="/categories"
              className="inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-badge bg-accent px-4 py-2 text-sm font-semibold text-card transition-colors duration-200 hover:bg-accent-hover"
            >
              View All
            </Link>
          </div>
        </section>
      ) : null}

      {/* Featured products — default title "Featured Deals"; hidden when none
          are featured (Req 1.9/1.15/1.16), with a link to the deals listing. */}
      {featuredProducts.length > 0 ? (
        <SectionShell
          title={FEATURED_SECTION_TITLE}
          viewAllHref="/deals"
          viewAllLabel="View all deals"
        >
          <ResponsiveGrid aria-label={FEATURED_SECTION_TITLE}>
            {featuredProducts.map((product) => (
              <div role="listitem" key={product.id}>
                <ProductCard product={product} />
              </div>
            ))}
          </ResponsiveGrid>
        </SectionShell>
      ) : null}

      {/* Category-wise sections — each "show on homepage" category with 4–6
          active products, ordered by ascending display order (Req 1.10). */}
      {categorySections.map((section) => (
        <SectionShell
          key={section.category.id}
          title={section.category.name}
          viewAllHref={`/category/${section.category.slug}`}
          viewAllLabel={`View all in ${section.category.name}`}
        >
          <ResponsiveGrid aria-label={section.category.name}>
            {section.products.map((product) => (
              <div role="listitem" key={product.id}>
                <ProductCard product={product} />
              </div>
            ))}
          </ResponsiveGrid>
        </SectionShell>
      ))}

      {/* Today's Best Coupons — 6–8 active featured deals (Req 1.11). */}
      {todaysBestCoupons.length > 0 ? (
        <SectionShell
          title="Today's Best Coupons"
          viewAllHref="/deals"
          viewAllLabel="View all coupons"
        >
          <ResponsiveGrid aria-label="Today's Best Coupons">
            {todaysBestCoupons.map((deal) => (
              <div role="listitem" key={deal.id}>
                <CouponCard deal={deal} />
              </div>
            ))}
          </ResponsiveGrid>
        </SectionShell>
      ) : null}

      {/* Popular Stores strip — up to 12 active stores (Req 1.12). */}
      {popularStores.length > 0 ? (
        <section
          aria-label="Popular Stores"
          className="mx-auto w-full max-w-content px-4 py-8"
        >
          <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
            Popular Stores
          </h2>
          <ul className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {popularStores.map((store) => (
              <li key={store.id} className="shrink-0">
                <Link
                  href={`/search?q=${encodeURIComponent(store.name)}`}
                  className="flex w-24 cursor-pointer flex-col items-center gap-2 rounded-card border border-border bg-card p-3 transition-colors duration-200 hover:border-accent"
                >
                  <StoreLogo name={store.name} logoUrl={store.logoUrl} size={48} />
                  <span className="w-full truncate text-center text-xs font-medium text-secondary">
                    {store.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Lightweight skeleton streamed in the static shell while homepage data loads. */
function HomeFallback() {
  return (
    <div aria-hidden="true">
      <section className="mx-auto w-full max-w-content px-4 pt-4">
        <div className="aspect-[16/6] w-full animate-pulse rounded-card bg-border" />
      </section>
      <section className="mx-auto w-full max-w-content px-4 pt-6">
        <div className="flex gap-2 overflow-hidden pb-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-9 w-28 shrink-0 animate-pulse rounded-badge bg-border"
            />
          ))}
        </div>
      </section>
      <section className="mx-auto w-full max-w-content px-4 py-8">
        <div className="mb-4 h-6 w-48 animate-pulse rounded-control bg-border" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[3/4] animate-pulse rounded-card bg-border"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface SectionShellProps {
  title: string;
  viewAllHref: string;
  viewAllLabel: string;
  children: React.ReactNode;
}

/** A titled homepage section with a "view all" link aligned to the heading. */
function SectionShell({
  title,
  viewAllHref,
  viewAllLabel,
  children,
}: SectionShellProps) {
  return (
    <section className="mx-auto w-full max-w-content px-4 py-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {title}
        </h2>
        <Link
          href={viewAllHref}
          className="shrink-0 cursor-pointer whitespace-nowrap text-sm font-medium text-accent transition-colors duration-200 hover:text-accent-hover"
        >
          {viewAllLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}
