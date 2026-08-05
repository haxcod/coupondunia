/**
 * CouponCard — the coupon/deal tile from the Coupon Saga design: store logo +
 * a green "Verified" badge, the offer, a full-width "Shop Now" / "Get Code"
 * button, and an expiry line. Server component; the only interactive piece is
 * the store logo's image fallback (StoreLogo). Carries no destination URL and
 * does no click tracking — the CTA links to /deal/[slug].
 */
import Link from 'next/link';

import type { DealCardDTO } from '@/lib/catalog';
import { StoreLogo } from '@/components/StoreLogo';

export interface CouponCardProps {
  deal: DealCardDTO;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Absolute expiry `DD Mon YYYY` in UTC — kept deterministic for prerender. */
function formatExpiry(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function CouponCard({ deal }: CouponCardProps) {
  const couponCode = deal.couponCode?.trim() ?? '';
  const hasCouponCode = couponCode.length > 0;
  const discount = deal.discountValue?.trim() ?? '';

  // Headline strategy: lead with the discount value when the deal has one, and
  // use the headline as the supporting line; otherwise lead with the headline.
  const primary = discount || deal.headline;
  const secondary = discount ? deal.headline : `at ${deal.storeName}`;

  return (
    <article className="group flex h-full flex-col rounded-card border border-border bg-card p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
      <div className="flex items-start justify-between gap-3">
        {/* The design frames the store mark in a bordered tile. */}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border bg-card p-1">
          <StoreLogo name={deal.storeName} logoUrl={deal.storeLogoUrl} size={32} />
        </span>
        <span className="inline-flex items-center gap-1 rounded-badge bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
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

      <h3 className="mt-3 line-clamp-1 text-lg font-extrabold tracking-tight text-foreground">
        {primary}
      </h3>
      <p className="mt-0.5 line-clamp-1 text-sm text-secondary">{secondary}</p>

      <div className="mt-4">
        <Link
          href={`/deal/${deal.slug}`}
          className="press flex w-full items-center justify-center gap-1.5 rounded-control bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          {hasCouponCode ? 'Get Code' : 'Shop Now'}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="nudge h-4 w-4"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted">
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
        {deal.validUntil ? (
          <span>Ends {formatExpiry(deal.validUntil)}</span>
        ) : (
          <span>Limited time offer</span>
        )}
      </div>
    </article>
  );
}
