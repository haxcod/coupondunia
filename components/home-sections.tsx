/*
 * Static, presentational homepage sections inspired by the editorial blocks on
 * large coupon sites (promo strip, "3 ways to save" feature row, and an FAQ
 * accordion). They carry no database-backed data, so they render in the static
 * shell — they are deliberately kept OUTSIDE the homepage's data `<Suspense>`
 * boundary so they are visible immediately while the catalog streams in.
 *
 * All icons are inline SVGs (no emoji, consistent 24×24 viewBox per the project
 * UI rules). The FAQ uses native <details>/<summary> so the accordion is fully
 * accessible and needs zero client JavaScript.
 */
import Link from 'next/link';

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

type IconProps = { className?: string };

function SparkIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3 4 6v6c0 5 3.4 7.7 8 9 4.6-1.3 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function WalletIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M21 10h-5a2 2 0 0 0 0 4h5v-4Z" />
    </svg>
  );
}

function RefreshIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function CrossIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Promo strip                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A full-bleed gradient announcement bar pinned directly under the header,
 * mirroring the bright promo strip pattern. Static copy + a single CTA.
 */
export function PromoStrip() {
  return (
    <div className="hidden w-full bg-gradient-to-r from-accent to-highlight sm:block">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center">
        <SparkIcon className="h-5 w-5 shrink-0 text-white" />
        <p className="text-sm font-semibold text-white">
          Verified coupons &amp; cashback, refreshed daily — 100% free to use.
        </p>
        <Link
          href="/deals"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-badge bg-white px-3 py-1 text-xs font-bold text-accent transition-colors duration-200 hover:bg-white/90"
        >
          Browse deals
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-3.5 w-3.5"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3 Ways To Save                                                              */
/* -------------------------------------------------------------------------- */

const SAVE_FEATURES = [
  {
    title: 'Verified Coupons',
    body: 'Every code is checked before it goes live, so you never waste time at checkout.',
    Icon: ShieldCheckIcon,
  },
  {
    title: 'Cashback & Deals',
    body: 'Stack savings with the best offers and cashback from the stores you already shop.',
    Icon: WalletIcon,
  },
  {
    title: 'Updated Daily',
    body: 'Fresh deals are added every day across all of your favourite categories.',
    Icon: RefreshIcon,
  },
] as const;

/** A three-up feature row explaining the core value props. */
export function WaysToSave() {
  return (
    <section
      aria-label="Ways to save"
      className="mx-auto w-full max-w-content px-4 py-12"
    >
      <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        3 Ways to Save
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
        {SAVE_FEATURES.map(({ title, body, Icon }) => (
          <div
            key={title}
            className="flex flex-col gap-3 rounded-card border border-border bg-card p-6 shadow-sm"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-control bg-highlight/10 text-highlight">
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-sm leading-relaxed text-secondary">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Why choose us — comparison table                                            */
/* -------------------------------------------------------------------------- */

const COMPARISON_ROWS = [
  { feature: 'Hand-verified coupon codes', us: true, others: false },
  { feature: 'Cashback on top of coupons', us: true, others: false },
  { feature: 'Deals refreshed every day', us: true, others: false },
  { feature: 'No login required to use', us: true, others: false },
  { feature: '100% free, no hidden charges', us: true, others: true },
  { feature: 'Clean, ad-light experience', us: true, others: false },
] as const;

/** A "us vs them" comparison table using check / cross marks. */
export function WhyChooseUs() {
  return (
    <section
      aria-label="Why choose us"
      className="mx-auto w-full max-w-content px-4 py-12"
    >
      <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        Why Choose CouponDunia
      </h2>
      <div className="overflow-x-auto rounded-card border border-border bg-card shadow-sm">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">
            Feature comparison between CouponDunia and other coupon sites
          </caption>
          <thead>
            <tr className="border-b border-border bg-background">
              <th
                scope="col"
                className="px-4 py-4 text-sm font-semibold text-foreground sm:px-6"
              >
                Feature / Benefit
              </th>
              <th
                scope="col"
                className="px-3 py-4 text-center text-sm font-bold text-accent sm:px-6"
              >
                CouponDunia
              </th>
              <th
                scope="col"
                className="px-3 py-4 text-center text-sm font-semibold text-secondary sm:px-6"
              >
                Other Coupon Sites
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, index) => (
              <tr
                key={row.feature}
                className={
                  index < COMPARISON_ROWS.length - 1
                    ? 'border-b border-border'
                    : undefined
                }
              >
                <th
                  scope="row"
                  className="px-4 py-4 text-sm font-medium text-foreground sm:px-6"
                >
                  {row.feature}
                </th>
                <td className="px-3 py-4 text-center sm:px-6">
                  <Mark ok={row.us} />
                </td>
                <td className="px-3 py-4 text-center sm:px-6">
                  <Mark ok={row.others} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A single yes/no cell: green check when true, muted red cross when false. */
function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      role="img"
      aria-label={ok ? 'Yes' : 'No'}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
        ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
      }`}
    >
      {ok ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <CrossIcon className="h-4 w-4" />
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ accordion                                                               */
/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: 'How does this site help me save money?',
    a: 'We gather verified promo codes, coupons, and cashback offers from top stores in one place. Browse a store or category, grab the code, and apply it at checkout to save instantly.',
  },
  {
    q: 'Are the coupon codes verified?',
    a: 'Yes. Codes are checked before they are published and refreshed regularly, so the offers you see are the ones most likely to work.',
  },
  {
    q: 'How many stores and offers are available?',
    a: 'New deals are added across all popular categories every day, spanning fashion, electronics, home, beauty, travel, and more.',
  },
  {
    q: 'Is it free to use?',
    a: 'Completely free. Search, browse, and use any coupon or deal without an account or any charges.',
  },
] as const;

/** A no-JavaScript, accessible FAQ accordion built on <details>/<summary>. */
export function HomeFaq() {
  return (
    <section
      aria-label="Frequently asked questions"
      className="mx-auto w-full max-w-content px-4 py-12"
    >
      <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        Frequently Asked Questions
      </h2>
      <div className="divide-y divide-border border-y border-border">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-semibold text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              {q}
              <PlusIcon className="h-5 w-5 shrink-0 text-secondary transition-transform duration-200 group-open:rotate-45" />
            </summary>
            <p className="pb-5 text-sm leading-relaxed text-secondary">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
