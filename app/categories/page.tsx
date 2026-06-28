import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";

import { getActiveCategoriesWithCounts, type CategoryCardDTO } from "@/lib/catalog";
import { buildMetadata } from "@/lib/seo";

/*
 * `/categories` — Category Listing Page (Req 4).
 *
 * Renders an H1 "All Categories" (Req 4.1) and a responsive grid of cards for
 * every active category (Req 4.2), ordered by descending active-product count
 * then ascending name (Req 4.3) via the cached `getActiveCategoriesWithCounts`
 * loader. Each card shows the category icon (or an SVG placeholder, Req 4.5/4.6),
 * the category name, its active-product count (Req 4.4), and links to
 * `/category/[slug]`. When no active categories exist an empty state is shown in
 * place of the grid (Req 4.7).
 *
 * The Header/Footer come from the root layout (task 11.1); this route renders
 * only the page's main content.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "All Categories",
    description:
      "Browse every category of deals, coupons, and offers on DealSpark and jump straight to the products you care about.",
    path: "/categories",
    siteName: "DealSpark",
    ogType: "website",
  });
}

/** Inline SVG placeholder shown when a category has no configured icon (Req 4.6). */
function CategoryIconPlaceholder() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-7 w-7 text-muted"
    >
      <path d="M3.75 5.25A1.5 1.5 0 0 1 5.25 3.75h5.379a1.5 1.5 0 0 1 1.06.44l8.122 8.12a1.5 1.5 0 0 1 0 2.122l-5.379 5.379a1.5 1.5 0 0 1-2.121 0l-8.122-8.122a1.5 1.5 0 0 1-.439-1.06V5.25Z" />
      <circle cx="8.25" cy="8.25" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A single category card linking to its detail page (Req 4.4/4.5/4.6). */
function CategoryCard({ category }: { category: CategoryCardDTO }) {
  const productLabel =
    category.activeProductCount === 1 ? "product" : "products";

  return (
    <li>
      <Link
        href={`/category/${category.slug}`}
        className="group flex h-full cursor-pointer items-center gap-4 rounded-card border border-border bg-card p-4 shadow-sm transition-colors duration-200 hover:border-accent focus-visible:border-accent"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-background">
          {category.iconUrl ? (
            <Image
              // The catalog stores icons on external object storage. Until task
              // 11.1 registers `images.remotePatterns`, optimization would
              // reject an unconfigured host, so we serve the source directly to
              // degrade gracefully; 11.1 can drop `unoptimized` once configured.
              unoptimized
              src={category.iconUrl}
              alt={category.name}
              width={56}
              height={56}
              className="h-full w-full object-cover"
            />
          ) : (
            <CategoryIconPlaceholder />
          )}
        </span>

        <span className="min-w-0">
          <span className="block truncate font-semibold text-foreground transition-colors duration-200 group-hover:text-accent">
            {category.name}
          </span>
          <span className="mt-0.5 block text-sm text-secondary">
            {category.activeProductCount} {productLabel}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Empty state shown when there are zero active categories (Req 4.7). */
function EmptyState() {
  return (
    <div className="rounded-card border border-border bg-card px-6 py-16 text-center">
      <p className="text-lg font-semibold text-foreground">
        No categories available
      </p>
      <p className="mx-auto mt-2 max-w-prose text-secondary">
        There are no categories to show right now. Please check back soon.
      </p>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        All Categories
      </h1>
      <p className="mt-2 text-secondary">
        Explore deals and coupons across every category.
      </p>

      {/* The category grid is database-backed; defer it to request time behind
          `<Suspense>` so the static shell (heading) prerenders WITHOUT a
          database, while the cached loader retains `use cache` for runtime ISR
          (Req 4, 25.8; `connection.md`, `use-cache.md`). */}
      <Suspense fallback={<CategoriesGridSkeleton />}>
        <CategoriesGrid />
      </Suspense>
    </main>
  );
}

async function CategoriesGrid() {
  await connection();
  const categories = await getActiveCategoriesWithCounts();

  if (categories.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState />
      </div>
    );
  }

  return (
    <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </ul>
  );
}

/** Skeleton streamed in the static shell while the category grid loads. */
function CategoriesGridSkeleton() {
  return (
    <ul
      aria-hidden="true"
      className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <li
          key={index}
          className="flex h-[88px] items-center gap-4 rounded-card border border-border bg-card p-4"
        >
          <span className="h-14 w-14 shrink-0 animate-pulse rounded-control bg-border" />
          <span className="min-w-0 flex-1">
            <span className="block h-4 w-3/4 animate-pulse rounded bg-border" />
            <span className="mt-2 block h-3 w-1/2 animate-pulse rounded bg-border" />
          </span>
        </li>
      ))}
    </ul>
  );
}
