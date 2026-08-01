/**
 * Pure, deterministic "Load More" paging helper for DealSpark.
 *
 * No database access lives here — this module is side-effect-free, offset-based
 * logic so it can be exercised exhaustively by property tests. The public
 * pages (`/category/[slug]`, `/deals`, `/search`) all expose a "Load More"
 * control that appends the next page of an already-ordered, eligible list; this
 * helper computes the slice for a requested offset plus whether more items
 * remain and the offset to request next.
 *
 * Because paging is offset-based and deterministic, concatenating the
 * successive pages produced by walking `offset → nextOffset` reproduces the
 * full ordered list exactly once, in order, with no gaps or duplicates
 * (design Property 20).
 *
 * Requirements:
 *   - 5.11 / 5.12  Category products: 20 per page, "Load More" appends the next
 *     20, hidden when none remain.
 *   - 10.2 / 10.3 / 10.4  Deals listing: first 20 on load, append next 20,
 *     hide the control once the remainder is rendered (and when ≤20 exist).
 *   - 11.8 / 11.9  Search results: pages of 20, "Load More" while unshown
 *     results remain, appends the next 20 when activated.
 */

/**
 * Default number of items per "Load More" page. The requirements fix this at 20
 * for products (5.11), deals (10.2), and search results (11.8); it is exposed
 * as a named constant and is parameterizable per call for flexibility/testing.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * The outcome of paging over a concrete in-memory ordered list.
 *
 * @typeParam T - The element type of the eligible ordered list.
 */
export interface Page<T> {
  /** The items in the requested page (length ≤ `pageSize`). */
  items: T[];
  /** The (normalized) offset this page starts at. */
  offset: number;
  /** The page size that was applied. */
  pageSize: number;
  /** Total number of eligible items in the source list. */
  total: number;
  /** True when at least one further item remains beyond this page. */
  hasMore: boolean;
  /**
   * The offset to request for the next page. When `hasMore` is false this
   * equals `total`, so a follow-up call returns an empty page.
   */
  nextOffset: number;
}

/**
 * A paging window computed from a total count alone (no materialized list),
 * suitable for driving a database `skip`/`limit` query.
 */
export interface PageWindow {
  /** The (normalized) zero-based offset to skip to. */
  offset: number;
  /** The maximum number of items to fetch (the page size). */
  limit: number;
  /** The number of items this window will actually yield (≤ `limit`). */
  count: number;
  /** Total number of eligible items. */
  total: number;
  /** True when at least one further item remains beyond this window. */
  hasMore: boolean;
  /** The offset to request for the next window; equals `total` when none remain. */
  nextOffset: number;
}

/**
 * Validate and normalize a requested page size.
 *
 * The page size must be a positive, finite integer; anything else is a
 * programming error rather than user input, so it throws rather than silently
 * defaulting.
 */
function normalizePageSize(pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(
      `pageSize must be a positive integer, received: ${pageSize}`,
    );
  }
  return pageSize;
}

/**
 * Clamp a requested offset into the valid `[0, total]` range.
 *
 * Out-of-range offsets are handled gracefully: a negative or fractional offset
 * is floored/clamped to 0, and an offset past the end is clamped to `total`
 * (which yields an empty page with `hasMore === false`).
 */
function normalizeOffset(offset: number, total: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }
  const floored = Math.floor(offset);
  if (floored <= 0) {
    return 0;
  }
  return Math.min(floored, total);
}

/**
 * Compute a paging window from a total item count.
 *
 * Use this when the eligible list is not materialized in memory (e.g. to derive
 * a database `skip`/`limit` and a `hasMore` flag for a "Load More" control).
 *
 * @param total    Total number of eligible items (non-negative integer).
 * @param offset   Zero-based offset of the requested page (default 0). Out-of-range values are clamped.
 * @param pageSize Items per page (default {@link DEFAULT_PAGE_SIZE}). Must be a positive integer.
 */
export function getPageWindow(
  total: number,
  offset: number = 0,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageWindow {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError(
      `total must be a non-negative integer, received: ${total}`,
    );
  }
  const size = normalizePageSize(pageSize);
  const start = normalizeOffset(offset, total);
  const count = Math.min(size, total - start);
  const nextOffset = start + count;
  return {
    offset: start,
    limit: size,
    count,
    total,
    hasMore: nextOffset < total,
    nextOffset,
  };
}

/**
 * Return the requested page of an already-ordered, eligible list.
 *
 * The slice preserves the input order. Repeatedly calling this starting at
 * offset 0 and advancing to `nextOffset` until `hasMore` is false yields every
 * item exactly once, in order (design Property 20).
 *
 * @param items    The full eligible ordered list. Treated as read-only.
 * @param offset   Zero-based offset of the requested page (default 0). Out-of-range values are clamped.
 * @param pageSize Items per page (default {@link DEFAULT_PAGE_SIZE}). Must be a positive integer.
 */
export function getPage<T>(
  items: readonly T[],
  offset: number = 0,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Page<T> {
  const window = getPageWindow(items.length, offset, pageSize);
  return {
    items: items.slice(window.offset, window.nextOffset),
    offset: window.offset,
    pageSize: window.limit,
    total: window.total,
    hasMore: window.hasMore,
    nextOffset: window.nextOffset,
  };
}
