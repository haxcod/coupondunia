/*
 * StoreDealCard — the wide store tile used in "Top Deals Across Categories":
 * a large logo panel on the left, then the store name, a savings line, and a
 * "View DEAL" button. Links to a store-filtered search until store pages exist.
 */
import Link from 'next/link';

import { StoreLogo } from '@/components/StoreLogo';

interface StoreDealCardProps {
  name: string;
  logoUrl?: string | null;
  /** Short savings line, e.g. "Save 50%". */
  savings?: string;
  /** Supporting line under the savings. */
  detail?: string;
  /** Badge text in the top-right corner. */
  badge?: string;
}

export function StoreDealCard({
  name,
  logoUrl,
  savings = 'Save 50%',
  detail,
  badge = '20% Off',
}: StoreDealCardProps) {
  return (
    <article className="flex items-stretch gap-4 rounded-card border border-border bg-card p-3">
      <div className="flex w-28 shrink-0 items-center justify-center rounded-control bg-surface p-3">
        <StoreLogo name={name} logoUrl={logoUrl ?? null} size={64} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-bold uppercase tracking-wide text-foreground">
            {name}
          </h3>
          <span className="shrink-0 rounded-badge bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-accent">
            {badge}
          </span>
        </div>

        <p className="mt-1 text-sm font-semibold text-foreground">{savings}</p>
        <p className="line-clamp-2 text-xs text-secondary">
          {detail ?? `Off or More with Verified ${name} Coupons`}
        </p>

        <Link
          href={`/search?q=${encodeURIComponent(name)}`}
          className="mt-auto inline-flex w-fit items-center rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-accent-hover"
        >
          View DEAL
        </Link>
      </div>
    </article>
  );
}
