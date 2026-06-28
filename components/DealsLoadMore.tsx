'use client';

/**
 * DealsLoadMore — client-side "Load More" control for the `/deals` listing
 * (Task 11.6).
 *
 * The server loads every active deal once (ordered newest-first) and hands the
 * full ordered list to this component. Rather than refetching, the control
 * progressively reveals the list 20 deals at a time (Req 10.2/10.3): the first
 * page is shown on initial render, each "Load More" activation appends the next
 * page, and the control hides itself precisely when no further deals remain
 * (Req 10.3/10.4). This mirrors the offset paging in `lib/paging` — successive
 * pages reconstruct the full ordered list exactly once, in order.
 *
 * Cards are pre-rendered on the server (as `CouponCard` server components) and
 * passed in as list items, so no deal data beyond what the cards already
 * contain is shipped, and the destination URL is never present (Req 7.9). The
 * component is purely presentational reveal state; it embeds no affiliate URL
 * and performs no network requests.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { DEFAULT_PAGE_SIZE } from '@/lib/paging';

export interface DealsLoadMoreProps {
  /** Pre-rendered coupon cards, already ordered newest-first. */
  items: ReactNode[];
  /** Items revealed per page (Req 10.2 fixes this at 20). */
  pageSize?: number;
  /** Accessible label announced for the grid (e.g. "Deals"). */
  label?: string;
}

export function DealsLoadMore({
  items,
  pageSize = DEFAULT_PAGE_SIZE,
  label = 'Deals',
}: DealsLoadMoreProps) {
  const total = items.length;
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(pageSize, total),
  );

  const hasMore = visibleCount < total;
  const remaining = total - visibleCount;
  const nextBatch = Math.min(pageSize, remaining);

  function handleLoadMore() {
    setVisibleCount((count) => Math.min(count + pageSize, total));
  }

  return (
    <>
      <ResponsiveGrid aria-label={label}>
        {items.slice(0, visibleCount).map((node, index) => (
          // Order is stable and append-only, so the index is a safe key here.
          <div role="listitem" key={index}>
            {node}
          </div>
        ))}
      </ResponsiveGrid>

      {hasMore ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleLoadMore}
            className="inline-flex cursor-pointer items-center justify-center rounded-control border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Load More
          </button>
          {/* Announce progress to assistive tech without stealing focus. */}
          <p aria-live="polite" className="text-xs text-secondary">
            Showing {visibleCount} of {total} deals
            {nextBatch > 0 ? ` · ${nextBatch} more` : ''}
          </p>
        </div>
      ) : null}
    </>
  );
}
