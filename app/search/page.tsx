/**
 * `/search` — the public search results page (Task 11.7).
 *
 * **Rendering model (Req 25.11).** This page is server-side rendered *per
 * request*: it reads `searchParams` (async in Next 16) and runs a live catalog
 * search, so its data is intentionally never cached. Under Cache Components the
 * dynamic work is wrapped in a `<Suspense>` boundary so an instant static shell
 * streams first while the request-specific results stream in.
 *
 * Responsibilities split:
 *  - This Server Component performs the initial {@link search} (and loads
 *    popular products for the empty state) so the first results are present in
 *    the server-rendered HTML for users and crawlers.
 *  - {@link SearchExperience} (a Client Component) owns all interactivity:
 *    the pre-filled, debounced input (Req 11.1/11.2), the Products/Coupons tabs
 *    (Req 11.7), "Load More" paging (Req 11.8/11.9), the error state that
 *    retains the query (Req 11.11), and the zero-results state (Req 11.12).
 *
 * The Header/Footer are provided by the root layout and are deliberately not
 * mounted here.
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';

import { search, getPopularProducts } from '@/lib/search-service';
import { SearchExperience } from '@/components/SearchExperience';

/** The query value is pre-filled with at most the first 200 characters (Req 11.1). */
const QUERY_DISPLAY_MAX = 200;
/** The Search_Service matches on queries of at least 2 characters (Req 11.2/11.3). */
const MIN_QUERY_LENGTH = 2;
/** Popular products shown in the zero-results state (Req 11.12 — 4–8). */
const POPULAR_PRODUCT_COUNT = 8;

/**
 * Static, curated search suggestions for the zero-results state (Req 11.12 —
 * between 3 and 5 suggestions). These reflect the most common Indian shopping
 * intents and are deliberately query-independent.
 */
const SEARCH_SUGGESTIONS = [
  'Electronics',
  'Mobiles',
  'Fashion',
  'Footwear',
  'Home & Kitchen',
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

/** Read a single string value from a (possibly repeated) search param. */
function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = readParam(params.q).slice(0, QUERY_DISPLAY_MAX).trim();
  return {
    // Search-result pages are intentionally not indexed; canonical discovery
    // happens through category/product/deal pages and the sitemap.
    title: query ? `Search results for “${query}”` : 'Search',
    description: query
      ? `Products and coupons matching “${query}” on DealSpark.`
      : 'Search products, deals, and coupons across DealSpark.',
    robots: { index: false, follow: true },
  };
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="mx-auto w-full max-w-content flex-1 px-4 py-6 sm:py-8">
      <Suspense fallback={<SearchFallback />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * The dynamic, per-request portion: awaiting `searchParams` and running the
 * live search both make this component dynamic, so it lives inside the page's
 * Suspense boundary (Req 25.11).
 */
async function SearchResults({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = readParam(params.q).slice(0, QUERY_DISPLAY_MAX);
  const type = readParam(params.type);
  const initialTab = type === 'deal' ? 'coupons' : 'products';

  const trimmed = query.trim();
  const [results, popularProducts] = await Promise.all([
    trimmed.length >= MIN_QUERY_LENGTH
      ? search({ q: trimmed, type: 'all' })
      : Promise.resolve({
          products: [],
          productCount: 0,
          deals: [],
          dealCount: 0,
        }),
    getPopularProducts(POPULAR_PRODUCT_COUNT),
  ]);

  return (
    <SearchExperience
      initialQuery={query}
      initialTab={initialTab}
      initialProducts={results.products}
      initialProductCount={results.productCount}
      initialDeals={results.deals}
      initialDealCount={results.dealCount}
      popularProducts={popularProducts}
      suggestions={[...SEARCH_SUGGESTIONS]}
    />
  );
}

/** Lightweight skeleton streamed in the static shell while results load. */
function SearchFallback() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="h-9 w-64 animate-pulse rounded-control bg-border" />
      <div className="h-12 w-full max-w-2xl animate-pulse rounded-control bg-border" />
      <div className="flex gap-4 border-b border-border pb-3">
        <div className="h-5 w-28 animate-pulse rounded-control bg-border" />
        <div className="h-5 w-28 animate-pulse rounded-control bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[3/4] animate-pulse rounded-card bg-border"
          />
        ))}
      </div>
    </div>
  );
}
