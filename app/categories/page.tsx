import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";

import HeroCarousel from "@/components/HeroCarousel";
import { BrandStrip } from "@/components/BrandStrip";
import { CategoryTile } from "@/components/CategoryTile";
import { CouponCard } from "@/components/CouponCard";
import { StoreDealCard } from "@/components/StoreDealCard";
import { FeaturedBrands } from "@/components/FeaturedBrands";
import { Newsletter } from "@/components/Newsletter";
import {
  getActiveBanners,
  getActiveCategoriesWithCounts,
  getActiveDealCards,
  getHomepageData,
} from "@/lib/catalog";
import { buildMetadata } from "@/lib/seo";

/*
 * `/categories` — the category browse page from the Coupon Saga design:
 * banner carousel, partner strip, "Popular categories" tiles, an "All
 * categories" tab row over a coupon grid, "Top Deals Across Categories",
 * "Featured Brands", and the newsletter block.
 *
 * The category tab row is presentational: coupon-card DTOs do not carry a
 * category, so the grid shows the newest active deals rather than filtering.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "All Categories",
    description:
      "Browse every category of deals, coupons, and offers and jump straight to the products you care about.",
    path: "/categories",
    siteName: "Coupon Saga",
    ogType: "website",
  });
}

export default function CategoriesPage() {
  return (
    <main className="flex-1">
      <Suspense fallback={<BannerSkeleton />}>
        <CategoryBanners />
      </Suspense>

      <BrandStrip />

      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesContent />
      </Suspense>

      <Newsletter />
    </main>
  );
}

async function CategoryBanners() {
  await connection();
  const banners = await getActiveBanners();

  if (banners.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-content px-4 pt-6">
      <HeroCarousel banners={banners} perView={2} />
    </section>
  );
}

async function CategoriesContent() {
  await connection();
  const [categories, deals, homepage] = await Promise.all([
    getActiveCategoriesWithCounts(),
    getActiveDealCards(),
    getHomepageData(),
  ]);

  const popularCategories = categories.slice(0, 6);
  const couponGrid = deals.slice(0, 6);
  const topStores = homepage.popularStores.slice(0, 3);
  const featuredBrands = homepage.popularStores.slice(0, 6);

  return (
    <>
      {/* Popular categories */}
      {popularCategories.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Popular categories
          </h2>
          <ul className="reveal-stagger mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {popularCategories.map((category) => (
              <li key={category.id}>
                <CategoryTile
                  name={category.name}
                  slug={category.slug}
                  iconUrl={category.iconUrl}
                />
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <Link
              href="/deals"
              className="press rounded-control bg-accent px-8 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/25"
            >
              View All
            </Link>
          </div>
        </section>
      ) : null}

      {/* All categories — tabs + coupon grid */}
      <section className="reveal mx-auto w-full max-w-content px-4 py-8">
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          All categories
        </h2>

        {/* Real categories; each opens that category's filtered coupon listing. */}
        <div className="mt-6 flex gap-7 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/deals"
            className="whitespace-nowrap border-b-2 border-foreground pb-3 text-sm font-semibold text-foreground"
          >
            All
          </Link>
          {categories.slice(0, 7).map((category) => (
            <Link
              key={category.id}
              href={`/deals?category=${encodeURIComponent(category.slug)}`}
              className="whitespace-nowrap border-b-2 border-transparent pb-3 text-sm font-medium text-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
            >
              {category.name}
            </Link>
          ))}
        </div>

        {couponGrid.length > 0 ? (
          <ul className="reveal-stagger mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {couponGrid.map((deal) => (
              <li key={deal.id}>
                <CouponCard deal={deal} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </section>

      {/* Top Deals Across Categories */}
      {topStores.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Top Deals Across Categories
          </h2>
          <ul className="reveal-stagger mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
            {topStores.map((store) => (
              <li key={store.id}>
                <StoreDealCard name={store.name} logoUrl={store.logoUrl} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Featured Brands */}
      {featuredBrands.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Featured Brands
          </h2>
          <FeaturedBrands stores={featuredBrands} />
        </section>
      ) : null}
    </>
  );
}

/** Empty state shown when there are no active deals to list. */
function EmptyState() {
  return (
    <div className="mt-8 rounded-card border border-border bg-card px-6 py-16 text-center">
      <p className="text-lg font-semibold text-foreground">
        No coupons available
      </p>
      <p className="mx-auto mt-2 max-w-prose text-secondary">
        There are no coupons to show right now. Please check back soon.
      </p>
    </div>
  );
}

function BannerSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 pt-6">
      <div className="aspect-[16/9] w-full skeleton rounded-card sm:aspect-[3/1]" />
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 py-12">
      <div className="h-8 w-64 skeleton rounded-control" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-28 skeleton rounded-card border border-border"
          />
        ))}
      </div>
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-48 skeleton rounded-card border border-border"
          />
        ))}
      </div>
    </div>
  );
}
