// Feature: dealspark, Property 18: Listings respect their comparator and cap
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  PRODUCT_SORT_MODES,
  compareCategoriesByProductCountThenDisplayOrder,
  compareCategoriesByProductCountThenName,
  compareProductsBy,
  compareByNewest,
  compareByClicksThenRecency,
  sortBy,
  capSection,
  sortAndCap,
  topByClicks,
  type Comparator,
  type CategoryOrderItem,
  type ProductSortItem,
  type CreatedAtItem,
  type ClickRankItem,
} from "@/lib/catalog";

/**
 * Property 18: Listings respect their comparator and cap
 *
 * For any collection and any supported ordering (category ordering by
 * descending active-product count then name/display-order tiebreak; the five
 * product sort modes; deals by descending creation date; top-N by descending
 * clicks with recency tiebreak), the rendered list is a permutation of the
 * eligible items arranged in the comparator's order and never exceeds the
 * section's item cap.
 *
 * Validates: Requirements 4.3, 1.8, 5.5, 10.1, 14.4
 */

const NUM_RUNS = 20;

// ---------------------------------------------------------------------------
// Shared multiset / ordering assertions
// ---------------------------------------------------------------------------

/** Multiset of references: counts how many times each object appears. */
function refCounts<T>(items: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

/** Assert `out` is a permutation of `input` (same references, same multiplicity). */
function assertPermutation<T>(out: readonly T[], input: readonly T[]): void {
  expect(out.length).toBe(input.length);
  const a = refCounts(out);
  const b = refCounts(input);
  expect(a.size).toBe(b.size);
  for (const [ref, count] of b) {
    expect(a.get(ref)).toBe(count);
  }
}

/**
 * Assert `out` is a sub-multiset of `input`: every element appears in `input`
 * and never more times than it does there. Combined with a prefix check this
 * proves the capped output is a prefix of the sorted permutation.
 */
function assertSubMultiset<T>(out: readonly T[], input: readonly T[]): void {
  const a = refCounts(out);
  const b = refCounts(input);
  for (const [ref, count] of a) {
    expect(b.get(ref) ?? 0).toBeGreaterThanOrEqual(count);
  }
}

/** Assert every adjacent pair respects the comparator (cmp(out[i], out[i+1]) <= 0). */
function assertOrdered<T>(out: readonly T[], cmp: Comparator<T>): void {
  for (let i = 1; i < out.length; i++) {
    expect(cmp(out[i - 1], out[i])).toBeLessThanOrEqual(0);
  }
}

/** Snapshot used to prove the helpers never mutate their input array. */
function snapshot<T>(items: readonly T[]): T[] {
  return [...items];
}

function assertUnchanged<T>(items: readonly T[], before: readonly T[]): void {
  expect(items.length).toBe(before.length);
  for (let i = 0; i < before.length; i++) {
    expect(items[i]).toBe(before[i]);
  }
}

// ---------------------------------------------------------------------------
// Generators (constrained to the documented input space)
// ---------------------------------------------------------------------------

const dateGen = () =>
  fc
    .integer({ min: 0, max: 4_102_444_800_000 }) // epoch .. year 2100
    .map((ms) => new Date(ms));

const categoryItem = (): fc.Arbitrary<CategoryOrderItem> =>
  fc.record({
    // Small name alphabet so ties on count + displayOrder are exercised.
    name: fc.constantFrom("a", "b", "c", "d", "e", "alpha", "beta", "gamma"),
    displayOrder: fc.integer({ min: 0, max: 5 }),
    activeProductCount: fc.integer({ min: 0, max: 5 }),
  });

const productItem = (): fc.Arbitrary<ProductSortItem> =>
  fc.record({
    // Small ranges so the recency tiebreak gets exercised on price/view/discount ties.
    currentPrice: fc.integer({ min: 0, max: 10 }),
    viewCount: fc.integer({ min: 0, max: 5 }),
    discountPercent: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
    createdAt: dateGen(),
  });

const createdAtItem = (): fc.Arbitrary<CreatedAtItem> =>
  fc.record({ createdAt: dateGen() });

const clickRankItem = (): fc.Arbitrary<ClickRankItem> =>
  fc.record({
    clickCount: fc.integer({ min: 0, max: 5 }),
    createdAt: dateGen(),
  });

function listOf<T>(item: fc.Arbitrary<T>) {
  return fc.array(item, { minLength: 0, maxLength: 30 });
}

// A cap that can be negative, zero, in-range, or larger than the list.
const capGen = () => fc.integer({ min: -3, max: 35 });

// ---------------------------------------------------------------------------
// Property 18 — comparator ordering + permutation (sortBy)
// ---------------------------------------------------------------------------

describe("catalog listings — Property 18: comparators produce ordered permutations", () => {
  it("orders the `/categories` listing by desc product count then name (Req 4.3)", () => {
    fc.assert(
      fc.property(listOf(categoryItem()), (items) => {
        const before = snapshot(items);
        const out = sortBy(items, compareCategoriesByProductCountThenName);
        assertPermutation(out, items);
        assertOrdered(out, compareCategoriesByProductCountThenName);
        assertUnchanged(items, before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("orders the homepage pill row by desc count, then display order, then name (Req 1.8)", () => {
    fc.assert(
      fc.property(listOf(categoryItem()), (items) => {
        const out = sortBy(items, compareCategoriesByProductCountThenDisplayOrder);
        assertPermutation(out, items);
        assertOrdered(out, compareCategoriesByProductCountThenDisplayOrder);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("orders products by every supported sort mode (Req 5.5)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PRODUCT_SORT_MODES),
        listOf(productItem()),
        (mode, items) => {
          const cmp = compareProductsBy(mode);
          const out = sortBy(items, cmp);
          assertPermutation(out, items);
          assertOrdered(out, cmp);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("orders deals by descending creation date (Req 10.1)", () => {
    fc.assert(
      fc.property(listOf(createdAtItem()), (items) => {
        const out = sortBy(items, compareByNewest);
        assertPermutation(out, items);
        assertOrdered(out, compareByNewest);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("orders top-N candidates by desc clicks with recency tiebreak (Req 14.4)", () => {
    fc.assert(
      fc.property(listOf(clickRankItem()), (items) => {
        const out = sortBy(items, compareByClicksThenRecency);
        assertPermutation(out, items);
        assertOrdered(out, compareByClicksThenRecency);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18 — section caps (capSection / sortAndCap / topByClicks)
// ---------------------------------------------------------------------------

describe("catalog listings — Property 18: sections never exceed their cap", () => {
  it("capSection returns a prefix that never exceeds max and keeps the input intact", () => {
    fc.assert(
      fc.property(listOf(productItem()), capGen(), (items, max) => {
        const before = snapshot(items);
        const out = capSection(items, max);

        const expectedLen = Math.min(items.length, Math.max(0, max));
        expect(out.length).toBe(expectedLen);
        expect(out.length).toBeLessThanOrEqual(Math.max(0, max));

        // It is exactly the leading prefix of the input.
        for (let i = 0; i < out.length; i++) {
          expect(out[i]).toBe(items[i]);
        }
        assertUnchanged(items, before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("sortAndCap yields an ordered prefix of the sorted permutation within the cap", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PRODUCT_SORT_MODES),
        listOf(productItem()),
        capGen(),
        (mode, items, max) => {
          const cmp = compareProductsBy(mode);
          const sorted = sortBy(items, cmp);
          const out = sortAndCap(items, cmp, max);

          // Cap respected.
          expect(out.length).toBeLessThanOrEqual(Math.max(0, max));
          expect(out.length).toBe(Math.min(items.length, Math.max(0, max)));

          // Ordered and a sub-multiset of the eligible items.
          assertOrdered(out, cmp);
          assertSubMultiset(out, items);

          // It is precisely the leading prefix of the full sorted permutation.
          for (let i = 0; i < out.length; i++) {
            expect(out[i]).toBe(sorted[i]);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("topByClicks returns the top-N by clicks/recency without exceeding N (Req 14.4)", () => {
    fc.assert(
      fc.property(listOf(clickRankItem()), fc.integer({ min: 0, max: 15 }), (items, n) => {
        const sorted = sortBy(items, compareByClicksThenRecency);
        const out = topByClicks(items, n);

        expect(out.length).toBeLessThanOrEqual(n);
        expect(out.length).toBe(Math.min(items.length, n));
        assertOrdered(out, compareByClicksThenRecency);
        assertSubMultiset(out, items);
        for (let i = 0; i < out.length; i++) {
          expect(out[i]).toBe(sorted[i]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
