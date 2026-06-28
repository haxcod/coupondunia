/**
 * `/deal/[slug]` — the Deal Detail Page (Task 11.5, Requirement 8).
 *
 * Renders an active Deal: a 60px Store logo, Store name, the headline as an H1,
 * a deal-type badge and Category tags (Req 8.1); the coupon reveal + "COPY
 * CODE" flow for coupon-code deals (a `ClickCTA` for other deal types); a
 * countdown when the expiry is within 7 days, otherwise "No expiry listed"
 * (Req 8.6/8.7); 3–5 numbered "How to Use" steps plus expandable terms
 * (Req 8.8); and up to 4 same-store Deals and 4 same-store Products (Req 8.9).
 * An unknown / inactive slug yields a 404 via `notFound()` (Req 8.2).
 *
 * **Build constraint (`cacheComponents: true`, no DB at build).** The static
 * shell prerenders WITHOUT a database: every DB read happens inside an async
 * child wrapped in `<Suspense>` that calls `connection()` first, deferring the
 * cached `resolveActiveDeal` / `getDealPageExtras` reads to request time.
 * `generateStaticParams` is resilient (DB failure → `[]`) and `generateMetadata`
 * calls `connection()` before reading the catalog (see `app/sitemap.ts`,
 * `app/page.tsx`).
 *
 * **Affiliate-URL confidentiality (Req 7.9).** No destination URL is rendered:
 * the JSON-LD `Offer` points at this public page, and the destination is
 * revealed only by `POST /api/public/click` from the client reveal/CTA.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getActiveDealSlugs,
  getDealPageExtras,
  resolveActiveDeal,
  type DealDetailDTO,
} from '@/lib/catalog';
import type { DealType } from '@/lib/models';
import { buildMetadata, buildOfferJsonLd, stringifyJsonLd } from '@/lib/seo';
import { StoreLogo } from '@/components/StoreLogo';
import { CountdownTimer } from '@/components/CountdownTimer';
import { CouponCard } from '@/components/CouponCard';
import { ProductCard } from '@/components/ProductCard';
import { CouponReveal } from '@/components/CouponReveal';
import ClickCTA from '@/components/ClickCTA';

/** Window (ms) under which a deal expiry renders a live countdown (Req 8.6). */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

/** Human-facing labels for the deal-type badge (Req 8.1). */
const DEAL_TYPE_LABELS: Record<DealType, string> = {
  coupon_code: 'Coupon Code',
  direct_deal: 'Deal',
  bank_card: 'Bank Offer',
  cashback: 'Cashback',
};

/** Month abbreviations for deterministic, locale-independent expiry display. */
const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/**
 * `generateStaticParams` for the deal detail route (Req 8.1).
 *
 * During `next build` there is no database, so the slug read throws; under
 * Cache Components a `generateStaticParams` must return at least one result, so
 * we fall back to a single sentinel (mirroring `app/sitemap.ts`'s non-empty
 * `[{ id: 0 }]` fallback). The sentinel prerenders only the static shell — the
 * DB read is deferred via `connection()` inside the Suspense boundary — and
 * resolves to a 404 at request time (Req 8.2). Real deal slugs are generated on
 * demand (`dynamicParams` defaults to true) and revalidated on the 300s ISR
 * window (Req 25.8).
 */
const PLACEHOLDER_SLUG = '__deal__';

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const slugs = await getActiveDealSlugs();
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
  // Defer the DB-backed lookup to request time so the build never reads a
  // database (`generate-metadata.md`, `connection.md`).
  await connection();
  const { slug } = await params;
  const deal = await resolveActiveDeal(slug);

  if (!deal) {
    return {
      title: 'Deal not found',
      robots: { index: false, follow: true },
    };
  }

  const title = `${deal.headline} — ${deal.storeName}`;
  const description = deal.terms?.trim()
    ? deal.terms.trim().slice(0, 160)
    : `Grab this ${deal.storeName} offer on DealSpark: ${deal.headline}.`;

  return buildMetadata({
    title,
    description,
    path: `/deal/${deal.slug}`,
    imageUrl: deal.storeLogoUrl,
    siteName: 'DealSpark',
    ogType: 'article',
  });
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="mx-auto w-full max-w-content flex-1 px-4 py-8">
      {/* The deal is database-backed; defer it to request time behind
          `<Suspense>` so the static shell prerenders WITHOUT a database, while
          the cached loaders keep `use cache` for runtime ISR (Req 8, 25.8). */}
      <Suspense fallback={<DealSkeleton />}>
        <DealContent slug={slug} />
      </Suspense>
    </main>
  );
}

async function DealContent({ slug }: { slug: string }) {
  await connection();
  const deal = await resolveActiveDeal(slug);

  // Req 8.2: an unknown or inactive slug returns a 404.
  if (!deal) {
    notFound();
  }

  const extras = await getDealPageExtras({
    dealId: deal.id,
    storeId: deal.storeId,
    categoryId: deal.categoryId,
  });

  // Offer JSON-LD points at this public page — never the destination (Req 7.9/24.1).
  const offerJsonLd = buildOfferJsonLd({
    path: `/deal/${deal.slug}`,
    headline: deal.headline,
    storeName: deal.storeName,
    description: deal.terms,
    validFrom: deal.validFrom,
    validUntil: deal.validUntil,
  });

  const isCouponCode =
    deal.dealType === 'coupon_code' && (deal.couponCode?.trim().length ?? 0) > 0;
  const steps = normalizeSteps(deal.howToUseSteps);
  const hasTerms = (deal.terms?.trim().length ?? 0) > 0;

  return (
    <>
      <script
        type="application/ld+json"
        // stringifyJsonLd escapes `<`/`>`/`&` so the payload cannot break out of
        // the script element (Req 24.9).
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(offerJsonLd) }}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          {/* Header: 60px logo, store name, H1 headline, badge + category tags (Req 8.1). */}
          <header className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <StoreLogo
                name={deal.storeName}
                logoUrl={deal.storeLogoUrl}
                size={60}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-secondary">
                  {deal.storeName}
                </p>
                <span className="mt-1 inline-flex items-center rounded-badge bg-accent/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
                  {DEAL_TYPE_LABELS[deal.dealType]}
                </span>
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {deal.headline}
            </h1>

            {extras.categoryTags.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Categories">
                {extras.categoryTags.map((tag) => (
                  <li key={tag.slug}>
                    <Link
                      href={`/category/${tag.slug}`}
                      className="inline-flex cursor-pointer items-center rounded-badge border border-border bg-card px-3 py-1 text-xs font-medium text-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
                    >
                      {tag.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </header>

          {/* Reveal / activation. Coupon-code deals get the COPY CODE flow
              (Req 8.3/8.4/8.10); other deal types get the deal ClickCTA. */}
          {isCouponCode ? (
            <CouponReveal
              dealId={deal.id}
              couponCode={deal.couponCode as string}
            />
          ) : (
            <ClickCTA
              kind="deal"
              id={deal.id}
              label={deal.buttonLabel?.trim() || 'GET DEAL →'}
            />
          )}

          {/* How to use — 3–5 numbered steps (Req 8.8). */}
          {steps.length > 0 ? (
            <section aria-labelledby="how-to-use-heading">
              <h2
                id="how-to-use-heading"
                className="text-lg font-semibold text-foreground"
              >
                How to use this offer
              </h2>
              <ol className="mt-3 flex flex-col gap-3">
                {steps.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Terms & conditions — expandable (Req 8.8). */}
          {hasTerms ? (
            <details className="rounded-card border border-border bg-card p-4">
              <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
                Terms &amp; Conditions
              </summary>
              <p className="mt-3 whitespace-pre-line text-sm text-secondary">
                {deal.terms}
              </p>
            </details>
          ) : null}
        </div>

        {/* Expiry: countdown within 7 days, else date, else "No expiry listed". */}
        <aside className="lg:pt-1">
          <div className="rounded-card border border-border bg-card p-4 shadow-sm">
            <ExpiryBlock deal={deal} />
          </div>
        </aside>
      </div>

      {/* Same-store related Deals and Products (Req 8.9). */}
      {extras.relatedDeals.length > 0 ? (
        <RelatedSection title={`More deals from ${deal.storeName}`}>
          {extras.relatedDeals.map((related) => (
            <CouponCard key={related.id} deal={related} />
          ))}
        </RelatedSection>
      ) : null}

      {extras.relatedProducts.length > 0 ? (
        <RelatedSection title={`Products from ${deal.storeName}`}>
          {extras.relatedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </RelatedSection>
      ) : null}
    </>
  );
}

/**
 * Expiry rendering (Req 8.6/8.7): a live countdown when the expiry is within the
 * next 7 days (the timer swaps to an expired message on reaching it, Req 8.12),
 * the formatted date when it is further out, or "No expiry listed" when absent.
 */
function ExpiryBlock({ deal }: { deal: DealDetailDTO }) {
  if (deal.validUntil === null) {
    return (
      <p className="text-sm font-medium text-secondary">No expiry listed</p>
    );
  }

  const nowMs = Date.now();
  const remainingMs = deal.validUntil.getTime() - nowMs;

  if (remainingMs <= SEVEN_DAYS_MS) {
    return (
      <CountdownTimer
        expiry={deal.validUntil}
        nowMs={nowMs}
        label="Offer ends in"
        expiredLabel="This offer has expired"
      />
    );
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-secondary">
        Valid until
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {formatDate(deal.validUntil)}
      </p>
    </div>
  );
}

interface RelatedSectionProps {
  title: string;
  children: React.ReactNode;
}

function RelatedSection({ title, children }: RelatedSectionProps) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

/**
 * Clamp the deal's "How to Use" steps to the required 3–5 range (Req 8.8),
 * dropping blank entries. Fewer than 3 stored steps are rendered as-is (the
 * record simply has fewer); more than 5 are capped at 5.
 */
function normalizeSteps(steps: readonly string[]): string[] {
  return steps
    .map((step) => step.trim())
    .filter((step) => step.length > 0)
    .slice(0, 5);
}

/** Skeleton streamed in the static shell while the deal loads. */
function DealSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="h-[60px] w-[60px] shrink-0 animate-pulse rounded-full bg-border" />
        <div className="flex-1">
          <div className="h-4 w-32 animate-pulse rounded bg-border" />
          <div className="mt-2 h-5 w-24 animate-pulse rounded-badge bg-border" />
        </div>
      </div>
      <div className="h-8 w-3/4 animate-pulse rounded bg-border" />
      <div className="h-24 w-full animate-pulse rounded-card bg-border" />
      <div className="h-40 w-full animate-pulse rounded-card bg-border" />
    </div>
  );
}
