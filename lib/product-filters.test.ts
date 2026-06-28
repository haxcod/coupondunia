// Feature: dealspark, Property 19: Filters return exactly the items matching all active filters
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  applyProductFilters,
  DISCOUNT_TIERS,
  type DiscountTier,
  type FilterableProduct,
  type ProductFilters,
} from "@/lib/product-filters";

/**
 * Property 19: Filters return exactly the items matching all active filters
 *
 * For any set of active filters (subcategory, stores, discount tier, price
 * range), every product in the result satisfies every active filter
 * simultaneously (soundness), and every product excluded from the result
 * violates at least one active filter (completeness). Together these prove the
 * AND semantics of the filter combination.
 *
 * The test exercises the production `applyProductFilters` against an
 * independent oracle that re-derives the expected set directly from the active
 * filters, so the two must agree exactly.
 *
 * Validates: Requirements 5.7
 */

// Small, overlapping id pools so generated filters actually select a non-trivial
// subset of the products rather than trivially matching nothing/everything.
const CATEGORY_IDS = ["c1", "c2", "c3", "c4"] as const;
const STORE_IDS = ["s1", "s2", "s3", "s4"] as const;

// Prices live in integer paise (see lib/models/types.ts). Keep the range small
// enough that random price bands meaningfully partition the products.
const MAX_PRICE = 1_000_00; // ₹1,00,000 in paise

const productArb: fc.Arbitrary<FilterableProduct> = fc.record({
  categoryId: fc.constantFrom(...CATEGORY_IDS),
  storeId: fc.constantFrom(...STORE_IDS),
  currentPrice: fc.integer({ min: 0, max: MAX_PRICE }),
  discountPercent: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
});

// Each filter clause is independently active or inactive, covering the full
// power set of filter combinations (including the empty set).
const filtersArb: fc.Arbitrary<ProductFilters> = fc.record({
  subcategoryId: fc.option(fc.constantFrom(...CATEGORY_IDS), { nil: null }),
  storeIds: fc.option(
    fc.uniqueArray(fc.constantFrom(...STORE_IDS), { minLength: 1 }),
    { nil: null },
  ),
  discountTier: fc.option(
    fc.constantFrom<DiscountTier>(...DISCOUNT_TIERS),
    { nil: null },
  ),
  priceRange: fc.option(
    fc
      .tuple(
        fc.integer({ min: 0, max: MAX_PRICE }),
        fc.integer({ min: 0, max: MAX_PRICE }),
      )
      .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) })),
    { nil: null },
  ),
});

/**
 * Independent oracle: decide membership from the active filters alone, mirroring
 * the AND semantics described by Req 5.7 without reusing the implementation's
 * helpers.
 */
function oracleMatches(product: FilterableProduct, filters: ProductFilters): boolean {
  const subActive =
    typeof filters.subcategoryId === "string" && filters.subcategoryId.length > 0;
  if (subActive && String(product.categoryId) !== String(filters.subcategoryId)) {
    return false;
  }

  const storesActive = Array.isArray(filters.storeIds) && filters.storeIds.length > 0;
  if (
    storesActive &&
    !filters.storeIds!.some((id) => String(product.storeId) === String(id))
  ) {
    return false;
  }

  const tierActive = typeof filters.discountTier === "number";
  if (tierActive) {
    if (product.discountPercent === null || product.discountPercent < filters.discountTier!) {
      return false;
    }
  }

  const min = filters.priceRange?.min;
  if (typeof min === "number" && product.currentPrice < min) {
    return false;
  }
  const max = filters.priceRange?.max;
  if (typeof max === "number" && product.currentPrice > max) {
    return false;
  }

  return true;
}

describe("applyProductFilters — Property 19: exactly the items matching all active filters", () => {
  it("returns exactly the products satisfying every active filter (AND semantics)", () => {
    fc.assert(
      fc.property(
        fc.array(productArb, { maxLength: 40 }),
        filtersArb,
        (products, filters) => {
          const result = applyProductFilters(products, filters);
          const expected = products.filter((p) => oracleMatches(p, filters));

          // Completeness + soundness: result is exactly the oracle's set, in order.
          expect(result).toEqual(expected);

          // Soundness restated: every returned product matches all active filters.
          for (const p of result) {
            expect(oracleMatches(p, filters)).toBe(true);
          }

          // Completeness restated: every excluded product violates some filter.
          const resultSet = new Set(result);
          for (const p of products) {
            if (!resultSet.has(p)) {
              expect(oracleMatches(p, filters)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
