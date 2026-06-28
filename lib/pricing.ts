/**
 * Pure discount/pricing computation for DealSpark.
 *
 * No database access lives here — this module is deterministic, side-effect-free
 * logic so it can be exercised exhaustively by property tests.
 *
 * Money convention: monetary values are integer paise per `lib/models/types.ts`.
 * Because the discount percentage is a ratio of two money values, the result is
 * identical whether the inputs are expressed in paise or in rupees.
 */

/**
 * Compute the integer discount percentage for a product/deal price pair.
 *
 * Per Req 16.6 / 6.4 the percentage is
 * `round((original − current) / original × 100)` and, per Property 4, lies in
 * the inclusive range 1..100 whenever `original > current`.
 *
 * Per Req 16.7 an absent original price or an `original ≤ current` pairing
 * yields no discount: the function returns `null`, signalling that the input is
 * invalid for discount purposes (callers/validation layer reject it).
 *
 * Non-finite inputs and a non-positive `original` are treated as having no
 * computable discount and also return `null`.
 *
 * @param current  The current (sale) price.
 * @param original The optional original (pre-discount) price.
 * @returns An integer in 1..100, or `null` when no valid discount applies.
 */
export function computeDiscountPercent(
  current: number,
  original?: number | null,
): number | null {
  // No original price provided → nothing to discount against (Req 16.7 / 5).
  if (original === null || original === undefined) {
    return null;
  }

  // Guard against non-finite values so the ratio is always well-defined.
  if (!Number.isFinite(current) || !Number.isFinite(original)) {
    return null;
  }

  // The original price must be a positive amount strictly greater than the
  // current price; otherwise there is no valid discount (Req 16.7).
  if (original <= 0 || original <= current) {
    return null;
  }

  const percent = Math.round(((original - current) / original) * 100);

  // Clamp into the 1..100 range guaranteed by Property 4. A positive `current`
  // smaller than `original` produces a value in (0, 100); rounding can land on
  // 0 for a tiny relative difference, so the floor of 1 keeps the badge valid.
  return Math.min(100, Math.max(1, percent));
}
