/**
 * CouponCard — the reusable Coupon_Card UI component (Requirement 3).
 *
 * Renders a Deal summary consistently across the Public_Site: a 40px circular
 * store logo (with first-letter fallback via {@link StoreLogo}), the store name,
 * a headline truncated to 2 lines, an optional dashed-border coupon-code
 * container, and an optional muted expiry date. The call-to-action links to the
 * deal's `/deal/[slug]` page, where the reveal/copy flow lives (Req 3.6); this
 * component performs no click tracking and embeds no destination URL.
 *
 * This is a Server Component so it can be cheaply rendered many times within
 * listings; the only interactive piece (the logo's image-error fallback,
 * Req 3.2) is isolated in the small {@link StoreLogo} Client Component.
 *
 * Mapping to acceptance criteria:
 *  - 3.1 circular 40px logo + store name + 2-line truncated headline
 *  - 3.2 first-letter fallback when the logo fails (handled by StoreLogo)
 *  - 3.3 dashed-border container rendered WHERE a coupon code exists
 *  - 3.4 dashed-border container omitted WHERE no coupon code exists
 *  - 3.5 expiry rendered in muted text meeting >= 4.5:1 contrast
 *  - 3.6 CTA navigates to `/deal/[slug]`
 */
import Link from 'next/link';

import type { DealCardDTO } from '@/lib/catalog';
import { StoreLogo } from '@/components/StoreLogo';

export interface CouponCardProps {
  /** The deal to summarize, projected without its destination URL (Req 7.9). */
  deal: DealCardDTO;
}

/** Fixed month abbreviations for deterministic, locale-independent formatting. */
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

/**
 * Format an expiry date as `DD Mon YYYY` (e.g. `09 Feb 2026`) using UTC fields,
 * matching the site-wide date format and keeping server output deterministic.
 */
function formatExpiry(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

export function CouponCard({ deal }: CouponCardProps) {
  const couponCode = deal.couponCode?.trim() ?? '';
  const hasCouponCode = couponCode.length > 0;
  const hasExpiry = deal.validUntil !== null;

  return (
    <article className="flex h-full flex-col rounded-card border border-border bg-card p-4 shadow-sm">
      {/* 3.1 — circular 40px logo + store name */}
      <div className="flex items-center gap-3">
        <StoreLogo name={deal.storeName} logoUrl={deal.storeLogoUrl} size={40} />
        <span className="truncate text-sm font-medium text-secondary">
          {deal.storeName}
        </span>
      </div>

      {/* 3.1 — headline truncated to a maximum of 2 lines with an ellipsis */}
      <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-foreground">
        {deal.headline}
      </h3>

      {/* 3.3 / 3.4 — dashed-border code container only WHERE a coupon code exists */}
      {hasCouponCode ? (
        <div className="mt-3 rounded-control border border-dashed border-border bg-background px-3 py-2">
          <span className="block truncate text-center font-mono text-sm font-semibold tracking-wider text-foreground">
            {couponCode}
          </span>
        </div>
      ) : null}

      {/* 3.5 — muted expiry; text-secondary (#6b6b6b) clears 4.5:1 on the card */}
      {hasExpiry ? (
        <p className="mt-3 text-xs text-secondary">
          Expires {formatExpiry(deal.validUntil as Date)}
        </p>
      ) : null}

      {/*
       * 3.6 — CTA navigates to the deal page where reveal/copy happens. The
       * `mt-auto` wrapper pins the CTA to the bottom so cards align in a grid,
       * while `pt-4` guarantees a gap above it regardless of card height.
       */}
      <div className="mt-auto pt-4">
        <Link
          href={`/deal/${deal.slug}`}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-control bg-accent px-2 py-2.5 text-xs font-semibold whitespace-nowrap text-white transition-colors duration-200 hover:bg-accent-hover sm:px-4 sm:text-sm"
        >
          <span className="sm:hidden">GET CODE</span>
          <span className="hidden sm:inline">GET COUPON CODE</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>
    </article>
  );
}
