'use client';

/**
 * CategoryProductBrowser — the interactive product browser for the
 * `/category/[slug]` detail page (Task 11.3, Req 5.3–5.12).
 *
 * The server loads the category's full active product set once (unsorted) and
 * hands it to this client component, which owns the interactive state:
 *   - the selected **sort** mode (`SortControl`, Req 5.4/5.5);
 *   - the active **filters** (`Filters`: subcategory pills, store checkboxes,
 *     discount tiers, price range; Req 5.3/5.6/5.7/5.8);
 *   - the "Load More" reveal window (20 per page, Req 5.11/5.12).
 *
 * Filtering and sorting reuse the shared pure helpers so the page can never
 * drift from the comparators/predicate exercised by the property tests:
 * `applyProductFilters` (Req 5.7) then `compareProductsBy(sort)` (Req 5.5).
 * The result is revealed 20 at a time via offset paging; the "Load More"
 * control hides itself once the remainder is shown (Req 5.12). Changing the
 * sort or any filter resets the reveal window back to the first page.
 *
 * When the active filter+sort combination yields zero products, an empty-state
 * message is shown while the filter controls (and their active chips) remain in
 * place so the Visitor can adjust them (Req 5.9).
 *
 * The sort vocabulary/comparators are imported from the database-free
 * `lib/product-sort` module (not `lib/catalog`) so this client component never
 * pulls the server-only catalog/Mongoose code into the browser bundle. The
 * product DTO type is a type-only import (erased at build time).
 */
import { useMemo, useState } from 'react';

import { Filters, type FilterOption } from '@/components/Filters';
import { SortControl } from '@/components/SortControl';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { ProductCard } from '@/components/ProductCard';
import {
  DEFAULT_PRODUCT_SORT_MODE,
  compareProductsBy,
  sortBy,
  type ProductSortMode,
} from '@/lib/product-sort';
import type { CategoryListingProductDTO } from '@/lib/catalog';
import { applyProductFilters, type ProductFilters } from '@/lib/product-filters';
import { DEFAULT_PAGE_SIZE } from '@/lib/paging';

const EMPTY_FILTERS: ProductFilters = {
  subcategoryId: null,
  storeIds: null,
  discountTier: null,
  priceRange: null,
};

export interface CategoryProductBrowserProps {
  /** Every active product in the category + subcategories (unsorted). */
  products: CategoryListingProductDTO[];
  /** Subcategories for the subcategory-pill row (Req 5.3). */
  subcategories: FilterOption[];
  /** Stores for the store-checkbox group (Req 5.6). */
  stores: FilterOption[];
}

export function CategoryProductBrowser({
  products,
  subcategories,
  stores,
}: CategoryProductBrowserProps) {
  const [sort, setSort] = useState<ProductSortMode>(DEFAULT_PRODUCT_SORT_MODE);
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_FILTERS);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_PAGE_SIZE);

  // Filter (AND-combined, Req 5.7) then sort (Req 5.5) with the shared helpers.
  const ordered = useMemo(
    () => sortBy(applyProductFilters(products, filters), compareProductsBy(sort)),
    [products, filters, sort],
  );

  // Any change to sort/filters returns the Visitor to the first page.
  function handleSortChange(next: ProductSortMode) {
    setSort(next);
    setVisibleCount(DEFAULT_PAGE_SIZE);
  }

  function handleFiltersChange(next: ProductFilters) {
    setFilters(next);
    setVisibleCount(DEFAULT_PAGE_SIZE);
  }

  const total = ordered.length;
  const visible = ordered.slice(0, visibleCount);
  const hasMore = visibleCount < total;
  const remaining = total - visibleCount;
  const nextBatch = Math.min(DEFAULT_PAGE_SIZE, remaining);

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Filters
          subcategories={subcategories}
          stores={stores}
          value={filters}
          onChange={handleFiltersChange}
        />
      </aside>

      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-secondary">
            {total} {total === 1 ? 'product' : 'products'}
          </p>
          <SortControl value={sort} onChange={handleSortChange} />
        </div>

        {total === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ResponsiveGrid aria-label="Products">
              {visible.map((product) => (
                <div role="listitem" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </ResponsiveGrid>

            {hasMore ? (
              <div className="mt-8 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((count) =>
                      Math.min(count + DEFAULT_PAGE_SIZE, total),
                    )
                  }
                  className="inline-flex cursor-pointer items-center justify-center rounded-control border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Load More
                </button>
                <p aria-live="polite" className="text-xs text-secondary">
                  Showing {visible.length} of {total} products
                  {nextBatch > 0 ? ` · ${nextBatch} more` : ''}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Empty state shown when the active filter+sort yields zero products (Req 5.9). */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-6 py-16 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-12 w-12 text-muted"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        No products match your filters
      </h2>
      <p className="mt-2 max-w-md text-sm text-secondary">
        Try removing a filter or two to see more products in this category.
      </p>
    </div>
  );
}
