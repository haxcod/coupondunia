import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";

import HeroCarousel from "@/components/HeroCarousel";
import { StoreLogo } from "@/components/StoreLogo";
import { BrandStrip } from "@/components/BrandStrip";
import { Newsletter } from "@/components/Newsletter";
import {
  getActiveBanners,
  getActiveDealCards,
  getHomepageData,
  type DealCardDTO,
  type StoreDTO,
} from "@/lib/catalog";
import { buildMetadata } from "@/lib/seo";

/*
 * `/stores` — the store page from the Coupon Saga design: a two-up banner
 * carousel, a filter bar, the store grid with per-store offer counts, pagination,
 * a highlighted store panel, and that store's "Available Offers" beside an
 * about/alerts sidebar.
 *
 * There are no per-store public routes yet, so store links go to a
 * store-filtered search. The filter dropdowns, wishlist hearts, pagination, and
 * the alerts form are presentational — none has a backend.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "All Stores",
    description:
      "Browse verified coupons, promo codes, and cashback offers from every store.",
    path: "/stores",
    siteName: "Coupon Saga",
    ogType: "website",
  });
}

/** Offer-strength pills from the design, cycled across the store grid. */
const STORE_BADGES = [
  "Up to ₹300 Off",
  "Upto 80% off",
  "Flat 30% Off",
  "Extra 20% off",
  "Flat 50% Off",
  "Save 25% Today",
  "Buy 2 Get 1 Free",
];

/** Stores shown per page in the directory grid. */
const STORES_PER_PAGE = 12;

type SearchParams = Record<string, string | string[] | undefined>;

export default function StoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="flex-1">
      <Suspense fallback={<BannerSkeleton />}>
        <StoreBanners />
      </Suspense>

      <BrandStrip />

      <Suspense fallback={<StoresSkeleton />}>
        <StoresContent searchParams={searchParams} />
      </Suspense>

      <Newsletter />
    </main>
  );
}

async function StoreBanners() {
  await connection();
  const banners = await getActiveBanners();

  if (banners.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-content px-4 pt-6">
      <HeroCarousel banners={banners} perView={2} />
    </section>
  );
}

async function StoresContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const [params, homepage, deals] = await Promise.all([
    searchParams,
    getHomepageData(),
    getActiveDealCards(),
  ]);

  const stores = homepage.popularStores;

  // Page the directory from the query string, clamped so a hand-edited `?page`
  // can never land outside the real range.
  const pageCount = Math.max(1, Math.ceil(stores.length / STORES_PER_PAGE));
  const requestedPage = Number.parseInt(
    (Array.isArray(params.page) ? params.page[0] : params.page) ?? '1',
    10,
  );
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    pageCount,
  );
  const pageStart = (page - 1) * STORES_PER_PAGE;
  const pageStores = stores.slice(pageStart, pageStart + STORES_PER_PAGE);

  // Live offer count per store, so each card shows a real number.
  const offerCounts = new Map<string, number>();
  for (const deal of deals) {
    offerCounts.set(deal.storeName, (offerCounts.get(deal.storeName) ?? 0) + 1);
  }

  // The design highlights one store below the grid; use the one with the most
  // live offers so the "Available Offers" list is never empty.
  const featured =
    [...stores].sort(
      (a, b) => (offerCounts.get(b.name) ?? 0) - (offerCounts.get(a.name) ?? 0),
    )[0] ?? null;
  const featuredStoreDeals = featured
    ? deals.filter((deal) => deal.storeName === featured.name)
    : [];
  const featuredDeals = featuredStoreDeals.slice(0, 4);
  const featuredCodeCount = featuredStoreDeals.filter(
    (deal) => (deal.couponCode?.trim() ?? '').length > 0,
  ).length;

  return (
    <>
      <section className="reveal mx-auto w-full max-w-content px-4 py-8">
        <h1 className="sr-only">All Stores</h1>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            Filter
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />
            </svg>
          </span>
          <Dropdown label="All categories" />
          <Dropdown label="All coupon types" />
          <span className="ml-auto text-sm text-secondary">
            Showing {stores.length === 0 ? 0 : pageStart + 1}-
            {pageStart + pageStores.length} of {stores.length} stores
          </span>
        </div>

        {stores.length > 0 ? (
          <>
            <ul className="reveal-stagger mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {pageStores.map((store, index) => (
                <li key={store.id}>
                  <StoreCard
                    store={store}
                    offers={offerCounts.get(store.name) ?? 0}
                    badge={STORE_BADGES[index % STORE_BADGES.length]}
                  />
                </li>
              ))}
            </ul>
            <Pagination page={page} pageCount={pageCount} />
          </>
        ) : (
          <EmptyState />
        )}
      </section>

      {featured ? (
        <>
          <FeaturedStorePanel
            store={featured}
            offers={offerCounts.get(featured.name) ?? 0}
            codeCount={featuredCodeCount}
          />
          <AvailableOffers store={featured} deals={featuredDeals} />
        </>
      ) : null}
    </>
  );
}

function Dropdown({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground">
      {label}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 text-secondary"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

interface StoreCardProps {
  store: StoreDTO;
  offers: number;
  badge: string;
}

/** A store tile: wishlist heart, boxed logo, name, offer count, offer pill. */
function StoreCard({ store, offers, badge }: StoreCardProps) {
  return (
    <div className="relative flex h-full flex-col items-center rounded-card border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
      {/* Wishlist heart — presentational (no user accounts). */}
      <span
        aria-hidden="true"
        className="absolute right-3 top-3 text-accent/70"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" />
        </svg>
      </span>

      <Link
        href={`/search?q=${encodeURIComponent(store.name)}`}
        className="flex w-full flex-1 flex-col items-center"
      >
        <span className="mt-3 flex h-20 w-full items-center justify-center rounded-control border border-border bg-card p-3">
          <StoreLogo name={store.name} logoUrl={store.logoUrl} size={56} />
        </span>
        <span className="mt-3 w-full truncate text-center text-sm font-bold text-foreground">
          {store.name}
        </span>
        <span className="mt-0.5 text-xs text-muted">
          {offers}+ Offers
        </span>
        <span className="mt-2.5 rounded-[4px] bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          {badge}
        </span>
      </Link>
    </div>
  );
}

/**
 * Pager over the store grid. Rendered only when there is genuinely more than one
 * page — the design mocks up "1 2 3 … 50+", but showing page numbers that lead
 * nowhere would be worse than showing none.
 */
function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null;

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav aria-label="Store pages" className="mt-10 flex justify-center">
      <ul className="flex items-center gap-2">
        {pages.map((number) => {
          const active = number === page;
          return (
            <li key={number}>
              <Link
                href={number === 1 ? "/stores" : `/stores?page=${number}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-control text-sm transition-colors duration-200 ${
                  active
                    ? "bg-accent font-semibold text-white"
                    : "text-secondary hover:text-accent"
                }`}
              >
                {number}
              </Link>
            </li>
          );
        })}
        {page < pageCount ? (
          <li>
            <Link
              href={`/stores?page=${page + 1}`}
              scroll={false}
              aria-label="Next page"
              className="flex h-8 w-8 items-center justify-center text-secondary transition-colors duration-200 hover:text-accent"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

/** Dark highlight panel for one store, with its stats card. */
function FeaturedStorePanel({
  store,
  offers,
  codeCount,
}: {
  store: StoreDTO;
  offers: number;
  codeCount: number;
}) {
  return (
    <section className="reveal mx-auto w-full max-w-content px-4 py-8">
      <div className="grid gap-6 rounded-card bg-[#1e2235] p-6 md:grid-cols-[1fr_300px] md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-24 w-32 shrink-0 items-center justify-center rounded-control bg-white p-3">
            <StoreLogo name={store.name} logoUrl={store.logoUrl} size={72} />
          </span>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-badge bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
                aria-hidden="true"
              >
                <path d="m5 13 4 4L19 7" />
              </svg>
              Verified
            </span>
            <h2 className="mt-2 text-lg font-bold text-white">
              {store.name} Promo Codes &amp; Coupons
            </h2>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-white/65">
              Explore amazing {store.name} deals, promo codes, and discounts
              available this month.
            </p>
            <p className="mt-3 text-xs text-white/80">
              {offers === 1
                ? "1 verified offer available right now"
                : `${offers} verified offers available right now`}
            </p>
          </div>
        </div>

        <div className="rounded-card bg-white p-5">
          <h3 className="text-sm font-bold text-foreground">
            Top Store in Electronics
          </h3>
          {/* Only figures the catalog can actually back — no invented metrics. */}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div>
              <dt className="text-[10px] text-muted">Live coupons</dt>
              <dd className="mt-0.5 text-sm font-bold text-foreground">
                {offers}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted">With a code</dt>
              <dd className="mt-0.5 text-sm font-bold text-foreground">
                {codeCount}
              </dd>
            </div>
          </dl>
          <Link
            href={`/search?q=${encodeURIComponent(store.name)}`}
            className="mt-4 flex w-full items-center justify-center rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover"
          >
            Visit Store
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Offer list for the highlighted store, with the about/alerts sidebar. */
function AvailableOffers({
  store,
  deals,
}: {
  store: StoreDTO;
  deals: DealCardDTO[];
}) {
  return (
    <section className="reveal mx-auto w-full max-w-content px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Available Offers
          </h2>

          {deals.length > 0 ? (
            <ul className="mt-6 space-y-4">
              {deals.map((deal) => (
                <li key={deal.id}>
                  <OfferRow deal={deal} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 rounded-card border border-border bg-card px-6 py-10 text-center text-sm text-secondary">
              No offers listed for {store.name} right now.
            </p>
          )}

          <p className="mt-8 text-center text-sm font-semibold text-accent">
            Need More Coupons? We Brings To You Soon....
          </p>
        </div>

        <div className="space-y-5">
          <div className="rounded-card border border-border bg-card p-5">
            <h3 className="text-sm font-bold text-foreground">
              About {store.name}
            </h3>
            <p className="mt-2.5 text-xs leading-relaxed text-secondary">
              {store.name} is a global leader in e-commerce, specializing in a
              vast array of products including electronics, books, and household
              items. With a commitment to customer satisfaction, {store.name}{" "}
              offers fast shipping, competitive prices, and a user-friendly
              shopping experience.
            </p>
            <dl className="mt-4 space-y-2.5 text-xs">
              {[
                ["Free Shipping", "On orders ₹499+"],
                ["Student Discount", "10% Off"],
                ["Return Policy", "2 Weeks"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-t border-border pt-2.5"
                >
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* No subscriber backend yet — the form is presentational. */}
          <div className="rounded-card bg-accent p-5">
            <h3 className="text-sm font-bold text-white">
              Get {store.name} Alerts
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-white/80">
              Never miss a {store.name} deal. We&apos;ll email you when new
              coupons are added.
            </p>
            <div className="mt-3 rounded-control border border-white/40 px-3 py-2 text-center text-xs text-white/80">
              Your email address
            </div>
            <button
              type="button"
              className="mt-2 w-full rounded-control bg-white px-4 py-2 text-xs font-bold text-accent transition-colors duration-200 hover:bg-white/90"
            >
              Notify Me
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One offer row: discount tile, title, meta, and a "Get Deal" button. */
function OfferRow({ deal }: { deal: DealCardDTO }) {
  const discount = deal.discountValue?.trim() || "Deal";
  const hasCode = (deal.couponCode?.trim() ?? "").length > 0;

  return (
    <article className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 sm:flex-row sm:items-center">
      <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-control border border-border px-2 text-center text-sm font-bold leading-tight text-accent">
        {discount}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-sm font-bold text-foreground">
            {deal.headline}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-badge bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
              aria-hidden="true"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
            Verified
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-secondary">
          Applies to eligible items at checkout. Exclusions may apply on sale
          items and gift cards.
        </p>
        <p className="mt-2 flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
              aria-hidden="true"
            >
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5" />
            </svg>
            1,245 Users
          </span>
          <span className="flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            Limited time
          </span>
        </p>
      </div>

      <Link
        href={`/deal/${deal.slug}`}
        className="shrink-0 self-start rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover sm:self-center"
      >
        {hasCode ? "Get Code" : "Get Deal"}
      </Link>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-card border border-border bg-card px-6 py-16 text-center">
      <p className="text-lg font-semibold text-foreground">No stores yet</p>
      <p className="mx-auto mt-2 max-w-prose text-secondary">
        Stores appear here as soon as offers are published. Please check back
        soon.
      </p>
    </div>
  );
}

function BannerSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 pt-6">
      <div className="aspect-[16/9] w-full skeleton rounded-card" />
    </div>
  );
}

function StoresSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 py-8">
      <div className="h-6 w-72 skeleton rounded-control" />
      <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-48 skeleton rounded-card border border-border"
          />
        ))}
      </div>
    </div>
  );
}
