import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';

import { CategoryPill } from '@/components/CategoryPill';
import { Newsletter } from '@/components/Newsletter';
import { getActiveCategoriesWithCounts } from '@/lib/catalog';
import { buildMetadata } from '@/lib/seo';

/*
 * `/categories` — dedicated categories directory (matching Couponology style):
 * shows only active categories in a clean, elegant pill grid.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: 'All Categories',
    description:
      'Browse every category of deals, coupons, and offers and jump straight to the products you care about.',
    path: '/categories',
    siteName: 'Coupon Saga',
    ogType: 'website',
  });
}

export default function CategoriesPage() {
  return (
    <main className="flex-1">
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesContent />
      </Suspense>

      <div className="mt-16">
        <Newsletter />
      </div>
    </main>
  );
}

async function CategoriesContent() {
  await connection();
  const categories = await getActiveCategoriesWithCounts();

  return (
    <section className="mx-auto w-full max-w-content px-4 py-12 sm:py-16">
      {/* Hero Header */}
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-xs font-extrabold uppercase tracking-wider text-accent">
          Browse by Department
        </span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          All <span className="italic text-accent">Categories</span>
        </h1>
        <p className="mt-3 text-sm text-secondary sm:text-base">
          Find verified coupons, promo codes, and limited-time savings across all
          your favorite categories.
        </p>
      </div>

      {/* Categories Grid — Only categories */}
      {categories.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <CategoryPill
              key={category.id}
              name={category.name}
              slug={category.slug}
              iconUrl={category.iconUrl}
              count={category.activeProductCount}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-card border border-border bg-card px-6 py-16 text-center">
      <p className="text-lg font-semibold text-foreground">
        No categories available
      </p>
      <p className="mx-auto mt-2 max-w-prose text-secondary">
        There are no categories to show right now. Please check back soon.
      </p>
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 py-12 sm:py-16">
      <div className="mx-auto h-10 w-64 skeleton rounded-control" />
      <div className="mx-auto mt-3 h-5 w-96 max-w-full skeleton rounded-control" />

      <div className="mt-10 grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 16 }).map((_, index) => (
          <div
            key={index}
            className="h-14 skeleton rounded-full border border-border"
          />
        ))}
      </div>
    </div>
  );
}
