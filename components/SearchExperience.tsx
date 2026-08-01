'use client';

/**
 * SearchExperience — the interactive client island for the `/search` page
 * (Task 11.7). The page itself is a Server Component that performs the initial
 * search per request (Req 25.11) and hands the results to this component as
 * props; from there all interactivity (debounced typing, tab switching, "Load
 * More", error + zero-result states) happens on the client.
 *
 * Acceptance criteria covered:
 *  - 11.1  search input pre-filled with the (already-truncated) query
 *  - 11.2  query submitted 500 ms after the most recent keystroke (≥ 2 chars)
 *  - 11.7  "Products ([count])" / "Coupons ([count])" tabs, Products default
 *  - 11.8  20 results per page with a "Load More" control while more remain
 *  - 11.9  "Load More" appends the next 20 results
 *  - 11.11 on error/timeout, an error message is shown and the query retained
 *  - 11.12 zero results → no-results message + 3–5 suggestions + 4–8 popular
 *
 * ProductCard / CouponCard are URL-free server components that are safe to
 * render here (they use only `Link` + tiny client image islands), so the
 * affiliate-URL confidentiality guarantee (Req 7.9) is preserved.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { ProductCard } from '@/components/ProductCard';
import { CouponCard } from '@/components/CouponCard';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { getPage, DEFAULT_PAGE_SIZE } from '@/lib/paging';
import type { ProductSummary, DealSummary } from '@/lib/search-service';
import type { ProductCardDTO, DealCardDTO } from '@/lib/catalog';

/** Minimum query length that triggers a search (Req 11.2). */
const MIN_QUERY_LENGTH = 2;
/** Debounce window after the most recent keystroke (Req 11.2). */
const DEBOUNCE_MS = 500;
/** Client-side search timeout; on exceeding it we surface an error (Req 11.11). */
const SEARCH_TIMEOUT_MS = 2000;
/** The API caps the query at 100 chars; stay within the contract (Req 21.1). */
const API_QUERY_MAX = 100;

type Tab = 'products' | 'coupons';

interface RawSearchResponse {
  products: ProductSummary[];
  productCount: number;
  deals: DealSummary[];
  dealCount: number;
}

export interface SearchExperienceProps {
  /** Query value (already truncated to 200 chars by the server, Req 11.1). */
  initialQuery: string;
  /** Which tab is active on first paint (derived from the `type` param). */
  initialTab: Tab;
  initialProducts: ProductSummary[];
  initialProductCount: number;
  initialDeals: DealSummary[];
  initialDealCount: number;
  /** 4–8 popular products for the zero-results state (Req 11.12). */
  popularProducts: ProductSummary[];
  /** 3–5 search suggestions for the zero-results state (Req 11.12). */
  suggestions: string[];
}

/** Map a URL-free product summary to the card DTO (CTA links to the detail page). */
function toProductCardDTO(p: ProductSummary): ProductCardDTO {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    storeName: p.storeName,
    storeLogoUrl: p.storeLogoUrl,
    currentPrice: p.currentPrice,
    originalPrice: p.originalPrice,
    discountPercent: p.discountPercent,
    primaryImageUrl: p.primaryImageUrl,
    hasAffiliateUrl: true,
  };
}

/** Map a deal summary to the card DTO, reviving `validUntil` (string ⇒ Date over JSON). */
function toDealCardDTO(d: DealSummary): DealCardDTO {
  return {
    id: d.id,
    headline: d.headline,
    slug: d.slug,
    storeName: d.storeName,
    storeLogoUrl: d.storeLogoUrl,
    dealType: d.dealType,
    couponCode: d.couponCode,
    discountValue: d.discountValue,
    validUntil: d.validUntil ? new Date(d.validUntil) : null,
  };
}

type Status = 'idle' | 'loading' | 'error';

export function SearchExperience({
  initialQuery,
  initialTab,
  initialProducts,
  initialProductCount,
  initialDeals,
  initialDealCount,
  popularProducts,
  suggestions,
}: SearchExperienceProps) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const [products, setProducts] = useState<ProductSummary[]>(initialProducts);
  const [productCount, setProductCount] = useState(initialProductCount);
  const [deals, setDeals] = useState<DealSummary[]>(initialDeals);
  const [dealCount, setDealCount] = useState(initialDealCount);

  const [productsShown, setProductsShown] = useState(DEFAULT_PAGE_SIZE);
  const [dealsShown, setDealsShown] = useState(DEFAULT_PAGE_SIZE);

  const [status, setStatus] = useState<Status>('idle');
  const [hasSearched, setHasSearched] = useState(
    initialQuery.trim().length >= MIN_QUERY_LENGTH,
  );

  /** Sync the address bar so the result state is shareable (Req 11.1). */
  const syncUrl = useCallback(
    (nextQuery: string, tab: Tab) => {
      const params = new URLSearchParams();
      const trimmed = nextQuery.trim();
      if (trimmed.length > 0) {
        params.set('q', trimmed.slice(0, 200));
      }
      params.set('type', tab === 'coupons' ? 'deal' : 'product');
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  /** Execute a search against the public API with a hard timeout (Req 11.11). */
  const runSearch = useCallback(
    async (rawQuery: string, tab: Tab) => {
      const trimmed = rawQuery.trim();
      syncUrl(trimmed, tab);

      if (trimmed.length < MIN_QUERY_LENGTH) {
        setProducts([]);
        setProductCount(0);
        setDeals([]);
        setDealCount(0);
        setProductsShown(DEFAULT_PAGE_SIZE);
        setDealsShown(DEFAULT_PAGE_SIZE);
        setHasSearched(false);
        setStatus('idle');
        return;
      }

      setStatus('loading');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      try {
        const url = `/api/public/search?q=${encodeURIComponent(
          trimmed.slice(0, API_QUERY_MAX),
        )}&type=all`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
          throw new Error(`Search failed with status ${res.status}`);
        }
        const data = (await res.json()) as RawSearchResponse;
        setProducts(data.products ?? []);
        setProductCount(data.productCount ?? 0);
        setDeals(data.deals ?? []);
        setDealCount(data.dealCount ?? 0);
        setProductsShown(DEFAULT_PAGE_SIZE);
        setDealsShown(DEFAULT_PAGE_SIZE);
        setHasSearched(true);
        setStatus('idle');
      } catch {
        // Error or timeout: keep the entered query, surface the error (Req 11.11).
        clearTimeout(timeout);
        setStatus('error');
      }
    },
    [syncUrl],
  );

  // Debounce typing: search 500 ms after the most recent keystroke (Req 11.2).
  // The first render is skipped because the server already supplied results.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void runSearch(query, activeTab);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // activeTab is intentionally excluded: switching tabs must not re-search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, runSearch]);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    syncUrl(query, tab);
  }

  const productCards = products.map(toProductCardDTO);
  const dealCards = deals.map(toDealCardDTO);
  const productPage = getPage(productCards, 0, productsShown);
  const dealPage = getPage(dealCards, 0, dealsShown);

  const trimmedQuery = query.trim();
  const isZeroResults =
    hasSearched &&
    status === 'idle' &&
    productCount === 0 &&
    dealCount === 0;
  const isPrompt =
    status === 'idle' && !hasSearched && trimmedQuery.length < MIN_QUERY_LENGTH;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {trimmedQuery.length > 0 ? (
            <>
              Search results for{' '}
              <span className="text-accent">&ldquo;{trimmedQuery}&rdquo;</span>
            </>
          ) : (
            'Search'
          )}
        </h1>

        {/* Pre-filled, debounced search input (Req 11.1, 11.2). */}
        <div className="relative w-full max-w-2xl">
          <label htmlFor="search-page-input" className="sr-only">
            Search products, deals, and stores
          </label>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="search-page-input"
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, deals, stores..."
            autoComplete="off"
            maxLength={200}
            aria-describedby={status === 'loading' ? 'search-status' : undefined}
            className="h-12 w-full rounded-control border border-border bg-card pl-11 pr-4 text-base text-foreground placeholder:text-muted transition-colors duration-200 focus:border-accent focus:outline-none"
          />
        </div>
      </header>

      {/* Tabs: Products selected by default (Req 11.7). */}
      <div role="tablist" aria-label="Search result categories" className="flex gap-1 border-b border-border">
        <TabButton
          tab="products"
          activeTab={activeTab}
          onSelect={handleTabChange}
          label={`Products (${productCount})`}
        />
        <TabButton
          tab="coupons"
          activeTab={activeTab}
          onSelect={handleTabChange}
          label={`Coupons (${dealCount})`}
        />
      </div>

      {/* Loading announcement for assistive tech. */}
      {status === 'loading' && (
        <p id="search-status" role="status" className="text-sm text-secondary">
          Searching…
        </p>
      )}

      {/* Error state — retains the entered query (Req 11.11). */}
      {status === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-6"
        >
          <p className="text-base font-semibold text-error">
            We couldn&rsquo;t complete your search.
          </p>
          <p className="text-sm text-secondary">
            Something went wrong while searching. Your query has been kept—try again.
          </p>
          <button
            type="button"
            onClick={() => void runSearch(query, activeTab)}
            className="cursor-pointer rounded-control bg-accent px-4 py-2 text-sm font-semibold text-card transition-colors duration-200 hover:bg-accent-hover"
          >
            Try again
          </button>
        </div>
      )}

      {/* Idle prompt before a query is entered. */}
      {isPrompt && (
        <p className="text-sm text-secondary">
          Type at least {MIN_QUERY_LENGTH} characters to search products and coupons.
        </p>
      )}

      {/* Zero-results state (Req 11.12). */}
      {status !== 'error' && isZeroResults && (
        <ZeroResults
          query={trimmedQuery}
          suggestions={suggestions}
          popularProducts={popularProducts}
          onSuggestion={(term) => setQuery(term)}
        />
      )}

      {/* Results panels. */}
      {status !== 'error' && hasSearched && !isZeroResults && (
        <>
          <section
            role="tabpanel"
            id="panel-products"
            aria-label={`Products (${productCount})`}
            hidden={activeTab !== 'products'}
          >
            {productCount === 0 ? (
              <p className="py-8 text-sm text-secondary">
                No products matched your search. Check the Coupons tab.
              </p>
            ) : (
              <>
                <ResponsiveGrid aria-label="Product results">
                  {productPage.items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </ResponsiveGrid>
                {productPage.hasMore && (
                  <LoadMore
                    onClick={() =>
                      setProductsShown((shown) => shown + DEFAULT_PAGE_SIZE)
                    }
                  />
                )}
              </>
            )}
          </section>

          <section
            role="tabpanel"
            id="panel-coupons"
            aria-label={`Coupons (${dealCount})`}
            hidden={activeTab !== 'coupons'}
          >
            {dealCount === 0 ? (
              <p className="py-8 text-sm text-secondary">
                No coupons matched your search. Check the Products tab.
              </p>
            ) : (
              <>
                <ResponsiveGrid aria-label="Coupon results">
                  {dealPage.items.map((deal) => (
                    <CouponCard key={deal.id} deal={deal} />
                  ))}
                </ResponsiveGrid>
                {dealPage.hasMore && (
                  <LoadMore
                    onClick={() =>
                      setDealsShown((shown) => shown + DEFAULT_PAGE_SIZE)
                    }
                  />
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

interface TabButtonProps {
  tab: Tab;
  activeTab: Tab;
  label: string;
  onSelect: (tab: Tab) => void;
}

function TabButton({ tab, activeTab, label, onSelect }: TabButtonProps) {
  const isActive = tab === activeTab;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={tab === 'products' ? 'panel-products' : 'panel-coupons'}
      onClick={() => onSelect(tab)}
      className={`cursor-pointer border-b-2 px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
        isActive
          ? 'border-accent text-accent'
          : 'border-transparent text-secondary hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function LoadMore({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-control border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
      >
        Load More
      </button>
    </div>
  );
}

interface ZeroResultsProps {
  query: string;
  suggestions: string[];
  popularProducts: ProductSummary[];
  onSuggestion: (term: string) => void;
}

function ZeroResults({
  query,
  suggestions,
  popularProducts,
  onSuggestion,
}: ZeroResultsProps) {
  const popularCards = popularProducts.map(toProductCardDTO);
  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-card border border-border bg-card p-6">
        <p className="text-base font-semibold text-foreground">
          No results found for &ldquo;{query}&rdquo;.
        </p>
        <p className="mt-1 text-sm text-secondary">
          Try a different spelling or one of these popular searches:
        </p>
        {suggestions.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Search suggestions">
            {suggestions.map((term) => (
              <li key={term}>
                <button
                  type="button"
                  onClick={() => onSuggestion(term)}
                  className="cursor-pointer rounded-badge border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
                >
                  {term}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {popularCards.length > 0 && (
        <section aria-label="Popular products">
          <h2 className="mb-4 text-lg font-bold text-foreground">
            Popular Products
          </h2>
          <ResponsiveGrid aria-label="Popular products">
            {popularCards.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ResponsiveGrid>
        </section>
      )}
    </div>
  );
}
