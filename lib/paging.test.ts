// Feature: dealspark, Property 20: "Load More" paging reconstructs the full ordered list exactly once
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getPage, getPageWindow, DEFAULT_PAGE_SIZE } from '@/lib/paging';

/**
 * Property 20: "Load More" paging reconstructs the full ordered list exactly once
 *
 * For any eligible ordered list, concatenating the successive pages produced by
 * repeated "Load More" actions (walking offset → nextOffset starting at 0)
 * reproduces the full ordered list with every item appearing exactly once and
 * in order, with no gaps or duplicates; each page holds at most `pageSize`
 * items; and the control is hidden (`hasMore === false`) precisely on the page
 * that renders the final remaining item(s).
 *
 * Validates: Requirements 5.11, 10.2, 10.3, 11.8, 11.9
 */

const NUM_RUNS = 20;

// An eligible ordered list of distinct, comparable items. Distinct values let
// us detect duplicates/gaps directly via strict equality against the source.
const orderedList = () => fc.array(fc.integer(), { maxLength: 200 });

// A page size in the realistic "Load More" range, including the production
// default of 20 and the boundary value 1.
const pageSize = () => fc.integer({ min: 1, max: 25 });

/**
 * Walk every page from offset 0, advancing to each page's `nextOffset` until
 * `hasMore` is false, and return the pages produced in order. Guarded against
 * non-advancing loops so a buggy helper fails loudly rather than hanging.
 */
function collectPages<T>(items: readonly T[], size: number) {
  const pages = [] as ReturnType<typeof getPage<T>>[];
  let offset = 0;
  // At most one page per item, plus one terminal page for the empty list.
  const maxIterations = items.length + 1;
  for (let i = 0; i <= maxIterations; i++) {
    const page = getPage(items, offset, size);
    pages.push(page);
    if (!page.hasMore) {
      return pages;
    }
    expect(page.nextOffset).toBeGreaterThan(offset);
    offset = page.nextOffset;
  }
  throw new Error('paging did not terminate: hasMore stayed true past the list end');
}

describe('getPage — Property 20: "Load More" paging reconstructs the full ordered list exactly once', () => {
  it('reconstructs the original list exactly once, in order, with correct page sizes and hasMore flag', () => {
    fc.assert(
      fc.property(orderedList(), pageSize(), (items, size) => {
        const pages = collectPages(items, size);

        // Concatenating all pages in order reproduces the source exactly.
        const reconstructed = pages.flatMap((p) => p.items);
        expect(reconstructed).toEqual(items);

        // Every page holds at most `pageSize` items.
        for (const page of pages) {
          expect(page.items.length).toBeLessThanOrEqual(size);
        }

        // The control is hidden precisely on the last page and only there.
        pages.forEach((page, index) => {
          const isLast = index === pages.length - 1;
          expect(page.hasMore).toBe(!isLast);
        });

        // Non-terminal pages are full; the terminal page may be partial/empty.
        pages.forEach((page, index) => {
          const isLast = index === pages.length - 1;
          if (!isLast) {
            expect(page.items.length).toBe(size);
          }
        });

        // No gaps or duplicates: each source index is covered exactly once.
        let cursor = 0;
        for (const page of pages) {
          expect(page.offset).toBe(cursor);
          cursor = page.nextOffset;
        }
        expect(cursor).toBe(items.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('paginates with the production default of 20 items per page', () => {
    fc.assert(
      fc.property(orderedList(), (items) => {
        const pages = collectPages(items, DEFAULT_PAGE_SIZE);
        const reconstructed = pages.flatMap((p) => p.items);
        expect(reconstructed).toEqual(items);
        for (const page of pages) {
          expect(page.items.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('agrees with getPageWindow on offsets, counts, and the hasMore flag', () => {
    fc.assert(
      fc.property(orderedList(), pageSize(), (items, size) => {
        let offset = 0;
        let guard = items.length + 2;
        while (guard-- > 0) {
          const page = getPage(items, offset, size);
          const window = getPageWindow(items.length, offset, size);
          expect(window.offset).toBe(page.offset);
          expect(window.count).toBe(page.items.length);
          expect(window.hasMore).toBe(page.hasMore);
          expect(window.nextOffset).toBe(page.nextOffset);
          if (!page.hasMore) break;
          offset = page.nextOffset;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
