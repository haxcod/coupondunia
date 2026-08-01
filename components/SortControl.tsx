'use client';

/**
 * SortControl — the category-detail sort selector (Task 10.7, Req 5.4/5.5).
 *
 * Renders exactly the five product sort modes defined in `@/lib/catalog`
 * (`PRODUCT_SORT_MODES` / `PRODUCT_SORT_LABELS`) with "Most Popular" selected by
 * default (`DEFAULT_PRODUCT_SORT_MODE`). The vocabulary and ordering live in the
 * catalog module so the control, the comparators, and the data loaders can never
 * drift apart.
 *
 * It is a controlled, presentational client component: it owns no sort state of
 * its own. It surfaces the current `value` and reports changes through
 * `onChange`, leaving the owning page (Task 11.x) to wire the selection to URL
 * state / data fetching and to actually reorder the products.
 *
 * A native `<select>` is used deliberately — it is keyboard- and
 * screen-reader-accessible out of the box and renders the platform's own
 * option list, which is the most robust choice for a five-item menu.
 */
import { useId } from 'react';

import {
  DEFAULT_PRODUCT_SORT_MODE,
  PRODUCT_SORT_LABELS,
  PRODUCT_SORT_MODES,
  type ProductSortMode,
} from '@/lib/product-sort';

export interface SortControlProps {
  /** The currently selected sort mode. Defaults to "Most Popular" (Req 5.4). */
  value?: ProductSortMode;
  /** Invoked with the newly selected sort mode when the Visitor changes it. */
  onChange: (mode: ProductSortMode) => void;
  /** Optional extra classes appended to the control's wrapper. */
  className?: string;
}

/** Type guard: is `value` one of the five known sort modes? */
function isProductSortMode(value: string): value is ProductSortMode {
  return (PRODUCT_SORT_MODES as readonly string[]).includes(value);
}

export function SortControl({
  value = DEFAULT_PRODUCT_SORT_MODE,
  onChange,
  className,
}: SortControlProps) {
  const labelId = useId();
  const selectId = useId();

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`.trim()}>
      <label
        id={labelId}
        htmlFor={selectId}
        className="shrink-0 text-sm font-medium text-secondary"
      >
        Sort by
      </label>

      <div className="relative">
        <select
          id={selectId}
          aria-labelledby={labelId}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (isProductSortMode(next)) {
              onChange(next);
            }
          }}
          className="cursor-pointer appearance-none rounded-control border border-border bg-card py-2 pl-3 pr-9 text-sm font-medium text-foreground transition-colors duration-200 hover:border-accent focus-visible:border-accent"
        >
          {PRODUCT_SORT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {PRODUCT_SORT_LABELS[mode]}
            </option>
          ))}
        </select>

        {/* Decorative chevron; the native control still owns interaction. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}
