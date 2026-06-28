/**
 * `/deals` — the deals listing page (Task 11.6, Requirement 10).
 *
 * Renders every active Deal as a {@link CouponCard}, ordered by descending
 * creation date (Req 10.1), in a responsive grid. The list is paged 20 at a
 * time with a "Load More" control (Req 10.2/10.3/10.4) handled by the
 * {@link DealsLoadMore} client component, and an empty-state message is shown
 * when no active deals exist (Req 10.5).
 *
 * Data comes from the cached, affiliate-URL-free `getActiveDealCards` loader
 * (Req 7.9/25.8); destination URLs never reach this markup. The site Header and
 * Footer are provided by the root layout, so this route renders only its own
 * main content.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';

import { getActiveDealCards } from '@/lib/catalog';
import { buildMetadata } from '@/lib/seo';
import { CouponCard } from '@/components/CouponCard';
import { DealsLoadMore } from '@/components/DealsLoadMore';

const PAGE_TITLE = 'All Deals & Coupons';
const PAGE_DESCRIPTION =
  'Browse every active coupon and deal on DealSpark — fresh offers from top stores, newest first.';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    path: '/deals',
    ogType: 'website',
  });
}

export default function DealsPage() {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {PAGE_TITLE}
        </h1>
      </header>

      {/* The deals listing is database-backed; defer it to request time behind
          `<Suspense>` so the static shell (heading) prerenders WITHOUT a
          database, while `getActiveDealCards` keeps `use cache` for runtime ISR
          (Req 10, 25.8; `connection.md`, `use-cache.md`). */}
      <Suspense fallback={<DealsSkeleton />}>
        <DealsList />
      </Suspense>
    </main>
  );
}

async function DealsList() {
  await connection();
  const deals = await getActiveDealCards();

  if (deals.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <p className="-mt-4 mb-8 text-sm text-secondary">
        {deals.length} active {deals.length === 1 ? 'deal' : 'deals'}, newest
        first.
      </p>
      <DealsLoadMore
        label="Deals"
        items={deals.map((deal) => (
          <CouponCard key={deal.id} deal={deal} />
        ))}
      />
    </>
  );
}

/** Skeleton streamed in the static shell while the deals listing loads. */
function DealsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-card border border-border bg-card"
        />
      ))}
    </div>
  );
}

/** Empty-state shown when zero active deals exist (Req 10.5). */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-6 py-16 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-12 w-12 text-muted"
      >
        <path d="M9 11l-2 2 2 2" />
        <path d="M15 11l2 2-2 2" />
        <rect x="3" y="5" width="18" height="14" rx="2" />
      </svg>
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        No deals available right now
      </h2>
      <p className="mt-2 max-w-md text-sm text-secondary">
        There are no active coupons or deals at the moment. Please check back
        soon — new offers are added regularly.
      </p>
    </div>
  );
}
