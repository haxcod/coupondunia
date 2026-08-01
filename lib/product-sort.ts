/**
 * Pure listing sort vocabulary, comparators, and sort/cap helpers for DealSpark.
 *
 * This module is deliberately **free of any database or Next.js runtime
 * imports** so it can be consumed from three contexts that the database-backed
 * `lib/catalog` module cannot reach:
 *
 *   1. **Client Components** — the category-detail `SortControl` and product
 *      browser need the sort-mode vocabulary and `compareProductsBy` to reorder
 *      products in the browser (Req 5.4/5.5). Importing them from `lib/catalog`
 *      would pull Mongoose into the client bundle; importing them from here
 *      does not.
 *   2. **Property tests** — the comparators encode the ordering rules from the
 *      requirements and are exercised exhaustively without touching MongoDB.
 *   3. **Server loaders** — `lib/catalog` imports and re-exports everything here
 *      so existing server consumers keep importing from `@/lib/catalog`.
 *
 * The ordering rules captured here:
 *   - category ordering for the pill row (Req 1.8) and `/categories` (Req 4.3);
 *   - the five product sort modes (Req 5.4/5.5);
 *   - deals-by-newest (Req 10.1);
 *   - dashboard top-N-by-clicks (Req 14.4).
 */

// =============================================================================
// Product sort-mode vocabulary (Req 5.4/5.5)
// =============================================================================

/** The five product sort modes offered by the category sort control (Req 5.4/5.5). */
export type ProductSortMode =
  | 'most_popular'
  | 'newest'
  | 'price_low_high'
  | 'price_high_low'
  | 'biggest_discount';

/** Ordered list of the sort modes, with the default ("Most Popular") first (Req 5.4). */
export const PRODUCT_SORT_MODES: readonly ProductSortMode[] = [
  'most_popular',
  'newest',
  'price_low_high',
  'price_high_low',
  'biggest_discount',
];

/** The default sort mode applied when none is selected (Req 5.4). */
export const DEFAULT_PRODUCT_SORT_MODE: ProductSortMode = 'most_popular';

/** Human-facing labels for each sort mode, exactly as required (Req 5.4). */
export const PRODUCT_SORT_LABELS: Record<ProductSortMode, string> = {
  most_popular: 'Most Popular',
  newest: 'Newest',
  price_low_high: 'Price Low-High',
  price_high_low: 'Price High-Low',
  biggest_discount: 'Biggest Discount',
};

// =============================================================================
// Pure listing comparators (no DB, no Next.js runtime)
// =============================================================================

/** A standard comparator returning negative/zero/positive for a/b ordering. */
export type Comparator<T> = (a: T, b: T) => number;

/** Deterministic ascending string comparison by code point (locale-independent). */
function compareStringsAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Descending-by-recency tiebreak: more recently created sorts first. */
function recencyDesc(a: { createdAt: Date }, b: { createdAt: Date }): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

/** Fields a category needs to be ordered in a listing. */
export interface CategoryOrderItem {
  name: string;
  displayOrder: number;
  activeProductCount: number;
}

/**
 * Homepage pill-row ordering (Req 1.8): descending active product count, then
 * ascending display order, then ascending name as a final stabilizer so the
 * order is total and deterministic.
 */
export function compareCategoriesByProductCountThenDisplayOrder(
  a: CategoryOrderItem,
  b: CategoryOrderItem,
): number {
  if (b.activeProductCount !== a.activeProductCount) {
    return b.activeProductCount - a.activeProductCount;
  }
  if (a.displayOrder !== b.displayOrder) {
    return a.displayOrder - b.displayOrder;
  }
  return compareStringsAsc(a.name, b.name);
}

/**
 * `/categories` listing ordering (Req 4.3): descending active product count,
 * then ascending category name.
 */
export function compareCategoriesByProductCountThenName(
  a: CategoryOrderItem,
  b: CategoryOrderItem,
): number {
  if (b.activeProductCount !== a.activeProductCount) {
    return b.activeProductCount - a.activeProductCount;
  }
  return compareStringsAsc(a.name, b.name);
}

/** Fields a product needs to be ordered by any of the five sort modes (Req 5.5). */
export interface ProductSortItem {
  currentPrice: number;
  viewCount: number;
  discountPercent: number | null;
  createdAt: Date;
}

/** Treat a missing discount as 0% so it sorts last under "Biggest Discount". */
function discountValue(item: ProductSortItem): number {
  return item.discountPercent ?? 0;
}

/**
 * Build the comparator for a product sort mode (Req 5.5):
 *   - "Most Popular"    → descending view count
 *   - "Newest"          → descending creation timestamp
 *   - "Price Low-High"  → ascending current price
 *   - "Price High-Low"  → descending current price
 *   - "Biggest Discount"→ descending discount percentage
 *
 * Every mode falls back to descending recency as a tiebreak (the primary key
 * for "Newest"), giving a total, deterministic ordering.
 */
export function compareProductsBy(mode: ProductSortMode): Comparator<ProductSortItem> {
  switch (mode) {
    case 'most_popular':
      return (a, b) => b.viewCount - a.viewCount || recencyDesc(a, b);
    case 'newest':
      return (a, b) => recencyDesc(a, b);
    case 'price_low_high':
      return (a, b) => a.currentPrice - b.currentPrice || recencyDesc(a, b);
    case 'price_high_low':
      return (a, b) => b.currentPrice - a.currentPrice || recencyDesc(a, b);
    case 'biggest_discount':
      return (a, b) => discountValue(b) - discountValue(a) || recencyDesc(a, b);
  }
}

/** Fields needed to order a listing by newest-first (Req 10.1). */
export interface CreatedAtItem {
  createdAt: Date;
}

/** Deals listing ordering (Req 10.1): descending deal creation date. */
export function compareByNewest(a: CreatedAtItem, b: CreatedAtItem): number {
  return recencyDesc(a, b);
}

/** Fields needed to rank a top-N list by click count (Req 14.4). */
export interface ClickRankItem {
  clickCount: number;
  createdAt: Date;
}

/**
 * Dashboard top-N ordering (Req 14.4): descending click count, breaking ties by
 * most recent creation timestamp.
 */
export function compareByClicksThenRecency(
  a: ClickRankItem,
  b: ClickRankItem,
): number {
  if (b.clickCount !== a.clickCount) {
    return b.clickCount - a.clickCount;
  }
  return recencyDesc(a, b);
}

// =============================================================================
// Pure sort/cap helpers
// =============================================================================

/** Return a new array sorted by `cmp` (input is never mutated; sort is stable). */
export function sortBy<T>(items: readonly T[], cmp: Comparator<T>): T[] {
  return [...items].sort(cmp);
}

/**
 * Return at most `max` leading items of `items`. Enforces a section cap without
 * mutating the input. A negative `max` is treated as 0 (empty section).
 */
export function capSection<T>(items: readonly T[], max: number): T[] {
  return items.slice(0, Math.max(0, max));
}

/** Sort by `cmp`, then cap to `max` items — the common "ordered, capped section" op. */
export function sortAndCap<T>(
  items: readonly T[],
  cmp: Comparator<T>,
  max: number,
): T[] {
  return capSection(sortBy(items, cmp), max);
}

/** Top-N items by descending click count with recency tiebreak (Req 14.4). */
export function topByClicks<T extends ClickRankItem>(
  items: readonly T[],
  n: number,
): T[] {
  return sortAndCap(items, compareByClicksThenRecency, n);
}
