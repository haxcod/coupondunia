/**
 * `/deals` — "Today's Deals" in the Coupon Saga layout: a two-up banner
 * carousel, a category tab row, a "Filter Deals" sidebar, and the deals as
 * horizontal rows with a "Load More Deals" control.
 *
 * Filtering is real and server-side. The tab row and every sidebar control is a
 * link that writes the filter state into the query string (`?category=&type=
 * &discount=&expiring=`); the page re-reads it, narrows the deals with the pure
 * helpers in `lib/deal-filters`, and renders the facet counts from the actual
 * data. Choosing a category swaps the source loader to that category's coupons.
 *
 * Deals arrive newest-first from the cached, affiliate-URL-free catalog loaders,
 * so destination URLs never reach this markup.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';

import {
  getActiveBanners,
  getActiveCategoriesWithCounts,
  getActiveDealCards,
  getCategoryListing,
  resolveActiveCategory,
  type DealCardDTO,
} from '@/lib/catalog';
import {
  DEAL_TYPE_LABELS,
  DISCOUNT_BUCKETS,
  EXPIRING_SOON_DAYS,
  buildDealQuery,
  countByDiscountBucket,
  countByType,
  countExpiringSoon,
  filterDeals,
  parseDealFilters,
  toggleType,
  type DealFilters,
} from '@/lib/deal-filters';
import type { DealType } from '@/lib/models/types';
import { buildMetadata } from '@/lib/seo';
import HeroCarousel from '@/components/HeroCarousel';
import { DealRow } from '@/components/DealRow';
import { DealsLoadMore } from '@/components/DealsLoadMore';
import { BrandStrip } from '@/components/BrandStrip';
import { Newsletter } from '@/components/Newsletter';

const PAGE_TITLE = "Today's Deals";
const PAGE_DESCRIPTION =
  'Browse every active coupon and deal — fresh offers from top stores, newest first.';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    path: '/deals',
    ogType: 'website',
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

export default function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="flex-1">
      <Suspense fallback={<BannerSkeleton />}>
        <DealBanners />
      </Suspense>

      <BrandStrip />

      <div className="reveal mx-auto w-full max-w-content px-4 py-8">
        <h1 className="sr-only">{PAGE_TITLE}</h1>
        <Suspense fallback={<DealsPageSkeleton />}>
          <DealsBrowser searchParams={searchParams} />
        </Suspense>
      </div>

      <Newsletter />
    </main>
  );
}

async function DealBanners() {
  await connection();
  const banners = await getActiveBanners();

  if (banners.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-content px-4 pt-6">
      <HeroCarousel banners={banners} perView={2} />
    </section>
  );
}

/**
 * Resolves the active category (when one is selected) and loads the matching
 * deals. An unknown slug falls back to the full listing rather than a 404, so a
 * stale bookmark still lands somewhere useful.
 */
async function loadDeals(categorySlug: string | null): Promise<{
  deals: DealCardDTO[];
  activeCategorySlug: string | null;
}> {
  if (!categorySlug) {
    return { deals: await getActiveDealCards(), activeCategorySlug: null };
  }

  const category = await resolveActiveCategory(categorySlug);
  if (!category) {
    return { deals: await getActiveDealCards(), activeCategorySlug: null };
  }

  const listing = await getCategoryListing(category.id);
  return { deals: listing.coupons, activeCategorySlug: category.slug };
}

async function DealsBrowser({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const params = await searchParams;

  const requestedCategory =
    typeof params.category === 'string' ? params.category : null;
  const filters = parseDealFilters(params);

  const [{ deals, activeCategorySlug }, categories] = await Promise.all([
    loadDeals(requestedCategory),
    getActiveCategoriesWithCounts(),
  ]);

  // Counts describe the category's full set, so a facet always shows how many
  // results it would yield rather than how many survive the current selection.
  const now = new Date();
  const typeCounts = countByType(deals);
  const discountCounts = countByDiscountBucket(deals);
  const expiringCount = countExpiringSoon(deals, now);

  const visible = filterDeals(deals, filters, now);
  const tabCategories = categories.slice(0, 6);

  return (
    <>
      <CategoryTabs
        categories={tabCategories}
        activeSlug={activeCategorySlug}
        filters={filters}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
        <FilterSidebar
          filters={filters}
          categorySlug={activeCategorySlug}
          categories={categories}
          typeCounts={typeCounts}
          discountCounts={discountCounts}
          expiringCount={expiringCount}
          total={deals.length}
          showing={visible.length}
        />

        <div className="min-w-0">
          {visible.length > 0 ? (
            <DealsLoadMore
              label="Deals"
              layout="stack"
              items={visible.map((deal) => (
                <DealRow key={deal.id} deal={deal} />
              ))}
            />
          ) : (
            <EmptyState filtered={deals.length > 0} />
          )}
        </div>
      </div>
    </>
  );
}

interface TabsProps {
  categories: { id: string; name: string; slug: string }[];
  activeSlug: string | null;
  filters: DealFilters;
}

/** Category tab row. "All" clears the category but keeps the other filters. */
function CategoryTabs({ categories, activeSlug, filters }: TabsProps) {
  const tabs = [
    { name: 'All', slug: null as string | null },
    ...categories.map((category) => ({
      name: category.name,
      slug: category.slug,
    })),
  ];

  return (
    <div className="flex gap-8 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = tab.slug === activeSlug;
        return (
          <Link
            key={tab.name}
            href={`/deals${buildDealQuery(filters, tab.slug)}`}
            aria-current={active ? 'page' : undefined}
            scroll={false}
            className={`whitespace-nowrap border-b-2 pb-3 text-[15px] transition-colors duration-200 ${
              active
                ? 'border-accent font-semibold text-foreground'
                : 'border-transparent font-medium text-secondary hover:text-accent'
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}

interface SidebarProps {
  filters: DealFilters;
  categorySlug: string | null;
  categories: { id: string; name: string; slug: string }[];
  typeCounts: Record<DealType, number>;
  discountCounts: Record<number, number>;
  expiringCount: number;
  total: number;
  showing: number;
}

function FilterSidebar({
  filters,
  categorySlug,
  categories,
  typeCounts,
  discountCounts,
  expiringCount,
  total,
  showing,
}: SidebarProps) {
  const hasFilters =
    filters.types.length > 0 ||
    filters.minDiscount !== null ||
    filters.expiringSoon ||
    categorySlug !== null;

  return (
    <aside
      aria-label="Filter deals"
      className="h-fit rounded-card border border-border bg-card p-5 lg:sticky lg:top-24"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">Filter Deals</h2>
        {hasFilters ? (
          <Link
            href="/deals"
            scroll={false}
            className="text-xs font-semibold text-accent hover:text-accent-hover"
          >
            Clear
          </Link>
        ) : null}
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-muted">
        Showing {showing} of {total}
      </p>

      {/* Discount — single-select buckets; re-picking the active one clears it. */}
      <div className="mt-5">
        <GroupHeading title="Discount" />
        <ul className="mt-2.5 space-y-2.5">
          {DISCOUNT_BUCKETS.map((bucket) => {
            const active = filters.minDiscount === bucket;
            return (
              <li key={bucket}>
                <FacetLink
                  href={`/deals${buildDealQuery(
                    { ...filters, minDiscount: active ? null : bucket },
                    categorySlug,
                  )}`}
                  active={active}
                  label={`${bucket}% And Above`}
                  count={discountCounts[bucket] ?? 0}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {/* Coupon type — multi-select, using the deal types the catalog stores. */}
      <div className="mt-5">
        <GroupHeading title="Coupon Type" />
        <ul className="mt-2.5 space-y-2.5">
          {(Object.keys(DEAL_TYPE_LABELS) as DealType[]).map((type) => {
            const active = filters.types.includes(type);
            return (
              <li key={type}>
                <FacetLink
                  href={`/deals${buildDealQuery(
                    toggleType(filters, type),
                    categorySlug,
                  )}`}
                  active={active}
                  label={DEAL_TYPE_LABELS[type]}
                  count={typeCounts[type]}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5">
        <GroupHeading title="Categories" />
        <ul className="mt-2.5 space-y-2.5">
          <li>
            <FacetLink
              href={`/deals${buildDealQuery(filters, null)}`}
              active={categorySlug === null}
              label="All Categories"
            />
          </li>
          {categories.slice(0, 5).map((category) => (
            <li key={category.id}>
              <FacetLink
                href={`/deals${buildDealQuery(filters, category.slug)}`}
                active={categorySlug === category.slug}
                label={category.name}
              />
            </li>
          ))}
          {categories.length > 5 ? (
            <li>
              <Link
                href="/categories"
                className="text-[13px] text-foreground underline-offset-2 hover:text-accent hover:underline"
              >
                Show More
              </Link>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="mt-5 space-y-3 border-t border-border pt-4">
        <ToggleLink
          href={`/deals${buildDealQuery(
            { ...filters, expiringSoon: !filters.expiringSoon },
            categorySlug,
          )}`}
          label={`Expiring in ${EXPIRING_SOON_DAYS} days`}
          on={filters.expiringSoon}
          count={expiringCount}
        />
      </div>
    </aside>
  );
}

function GroupHeading({ title }: { title: string }) {
  return (
    <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
  );
}

interface FacetLinkProps {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}

/** A checkbox-styled facet. Rendered as a link so filtering needs no client JS. */
function FacetLink({ href, active, label, count }: FacetLinkProps) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className="group/facet flex items-center gap-2 text-[13px] text-foreground transition-colors duration-200 hover:text-accent"
    >
      <span
        aria-hidden="true"
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-200 ${
          active
            ? 'border-accent bg-accent text-white'
            : 'border-muted bg-card group-hover/facet:border-accent'
        }`}
      >
        {active ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-2.5 w-2.5"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
        ) : null}
      </span>
      <span className={active ? 'font-semibold text-accent' : undefined}>
        {label}
      </span>
      {count !== undefined ? (
        <span className="text-muted">({count})</span>
      ) : null}
    </Link>
  );
}

function ToggleLink({
  href,
  label,
  on,
  count,
}: {
  href: string;
  label: string;
  on: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={on}
      className="flex items-center justify-between gap-3 text-[13px] font-medium text-foreground transition-colors duration-200 hover:text-accent"
    >
      <span>
        {label} <span className="font-normal text-muted">({count})</span>
      </span>
      <span
        aria-hidden="true"
        className={`flex h-4 w-8 shrink-0 items-center rounded-badge px-0.5 transition-colors duration-200 ${
          on ? 'justify-end bg-accent' : 'justify-start bg-border'
        }`}
      >
        <span className="h-3 w-3 rounded-full bg-white transition-transform duration-200" />
      </span>
    </Link>
  );
}

function BannerSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 pt-6">
      <div className="aspect-[16/9] w-full skeleton rounded-card" />
    </div>
  );
}

function DealsPageSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-10 w-full skeleton rounded-control" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="h-96 skeleton rounded-card border border-border" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-28 skeleton rounded-card border border-border"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state. `filtered` distinguishes "your filters matched nothing" from
 * "there is genuinely nothing published" (Req 10.5).
 */
function EmptyState({ filtered }: { filtered: boolean }) {
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
        {filtered ? 'No deals match these filters' : 'No deals available right now'}
      </h2>
      <p className="mt-2 max-w-md text-sm text-secondary">
        {filtered
          ? 'Try widening your selection — or clear the filters to see everything.'
          : 'There are no active coupons or deals at the moment. Please check back soon — new offers are added regularly.'}
      </p>
      {filtered ? (
        <Link
          href="/deals"
          scroll={false}
          className="press mt-5 rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
