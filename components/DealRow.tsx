/*
 * DealRow — the horizontal deal listing row from the "Today's Deals" design:
 * store logo in a bordered tile, a "Trending" badge, the offer headline and a
 * supporting line, a red expiry line, and a "Get Deal" button on the right.
 *
 * Server component. Carries no destination URL — the CTA links to /deal/[slug]
 * where the reveal/redirect happens.
 */
import Link from 'next/link';

import type { DealCardDTO } from '@/lib/catalog';
import { StoreLogo } from '@/components/StoreLogo';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Absolute expiry `DD Mon YYYY` in UTC — deterministic for prerender. */
function formatExpiry(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export interface DealRowProps {
  deal: DealCardDTO;
  /** Show the purple "Trending" badge above the headline. */
  trending?: boolean;
}

export function DealRow({ deal, trending = true }: DealRowProps) {
  const hasCode = (deal.couponCode?.trim() ?? '').length > 0;
  const discount = deal.discountValue?.trim() ?? '';

  return (
    <article className="group flex items-center gap-4 rounded-card border border-border bg-card p-4 transition-all duration-300 ease-out hover:translate-x-0.5 hover:border-accent/40 hover:shadow-md sm:gap-5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-control border border-border bg-card p-2 sm:h-[72px] sm:w-[72px]">
        <StoreLogo name={deal.storeName} logoUrl={deal.storeLogoUrl} size={48} />
      </div>

      <div className="min-w-0 flex-1">
        {trending ? (
          <span className="inline-flex rounded-[4px] bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
            Trending
          </span>
        ) : null}

        <h3 className="mt-1.5 line-clamp-1 text-base font-bold text-foreground">
          {discount ? `${discount} on ${deal.storeName}` : deal.headline}
        </h3>
        <p className="line-clamp-1 text-sm text-secondary">
          {discount ? deal.headline : `Verified offer at ${deal.storeName}`}
        </p>

        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-error">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {deal.validUntil
            ? `Expires ${formatExpiry(deal.validUntil)}`
            : 'Limited time offer'}
        </p>
      </div>

      <Link
        href={`/deal/${deal.slug}`}
        className="press flex shrink-0 items-center gap-1.5 self-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
      >
        {hasCode ? 'Get Code' : 'Get Deal'}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="nudge h-3.5 w-3.5"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </article>
  );
}
