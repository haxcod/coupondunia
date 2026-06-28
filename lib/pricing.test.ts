// Feature: dealspark, Property 4: Discount percentage computation and rejection
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeDiscountPercent } from "@/lib/pricing";

/**
 * Property 4: Discount percentage computation and rejection
 *
 * For any current price and original price where original > current, the
 * computed discount percentage equals round((original − current) / original ×
 * 100) and lies between 1 and 100; and for any original ≤ current (or an
 * absent / non-finite original), the system computes no discount and the input
 * is rejected as invalid (null).
 *
 * Validates: Requirements 16.6, 6.4, 16.7
 */

// Money values live in the documented 0.01..999,999,999.99 range.
const MIN_PRICE = 0.01;
const MAX_PRICE = 999_999_999.99;

const price = () =>
  fc.double({
    min: MIN_PRICE,
    max: MAX_PRICE,
    noNaN: true,
    noDefaultInfinity: true,
  });

describe("computeDiscountPercent — Property 4: discount computation and rejection", () => {
  it("computes round((original − current) / original × 100) within 1..100 when original > current", () => {
    fc.assert(
      fc.property(
        // Two distinct positive prices; the larger is the original.
        fc.tuple(price(), price()).filter(([a, b]) => a !== b),
        ([a, b]) => {
          const current = Math.min(a, b);
          const original = Math.max(a, b);

          const result = computeDiscountPercent(current, original);
          const expected = Math.round(((original - current) / original) * 100);

          // The raw ratio sits in (0, 100); rounding can only land on 0 for a
          // negligible relative difference, which the badge floors to 1.
          const expectedClamped = Math.min(100, Math.max(1, expected));

          expect(result).toBe(expectedClamped);
          // Per Req 6.4 the badge is an integer between 1 and 100 inclusive.
          expect(Number.isInteger(result)).toBe(true);
          expect(result!).toBeGreaterThanOrEqual(1);
          expect(result!).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  it("rejects (returns null) when original ≤ current", () => {
    fc.assert(
      fc.property(
        price(),
        // original anywhere in (0, current]; never exceeds current.
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (current, ratio) => {
          const original = current * ratio; // 0 ≤ original ≤ current
          expect(computeDiscountPercent(current, original)).toBeNull();
        },
      ),
    );
  });

  it("rejects (returns null) when the original price is absent", () => {
    fc.assert(
      fc.property(
        price(),
        fc.constantFrom<null | undefined>(null, undefined),
        (current, original) => {
          expect(computeDiscountPercent(current, original)).toBeNull();
        },
      ),
    );
  });

  it("rejects (returns null) when either input is non-finite", () => {
    const nonFinite = fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(nonFinite, price()),
          fc.tuple(price(), nonFinite),
          fc.tuple(nonFinite, nonFinite),
        ),
        ([current, original]) => {
          expect(computeDiscountPercent(current, original)).toBeNull();
        },
      ),
    );
  });
});
