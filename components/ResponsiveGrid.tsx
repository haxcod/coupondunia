/**
 * ResponsiveGrid — the shared product-grid layout used by listing pages
 * (Task 10.7). It renders its children into a CSS grid whose column count
 * tracks the viewport exactly as required by Req 5.10 / 26.7:
 *
 *   - below 768px (default)        → 2 columns
 *   - 768px to 1023px (`md`)       → 3 columns
 *   - 1024px and above (`lg`)      → 4 columns
 *
 * Tailwind's default breakpoints line up with these thresholds (`md` = 768px,
 * `lg` = 1024px), so the responsive behavior is purely declarative — no media
 * query JavaScript and no layout shift. The component is presentational and
 * has no client state, so it renders on the server.
 *
 * Pages (Task 11.x) supply already-rendered cards as children (e.g.
 * `ProductCard`), and may pass an `aria-label` so the grid announces what it
 * contains to assistive technology.
 */
import type { ReactNode } from 'react';

export interface ResponsiveGridProps {
  /** The grid items, typically `ProductCard` / `CouponCard` elements. */
  children: ReactNode;
  /** Optional accessible label describing the collection (e.g. "Products"). */
  'aria-label'?: string;
  /** Optional extra classes appended to the grid container. */
  className?: string;
}

export function ResponsiveGrid({
  children,
  'aria-label': ariaLabel,
  className,
}: ResponsiveGridProps) {
  return (
    <div
      role="list"
      aria-label={ariaLabel}
      className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 ${
        className ?? ''
      }`.trim()}
    >
      {children}
    </div>
  );
}
