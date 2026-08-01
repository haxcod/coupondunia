// Feature: dealspark, Property 2: Slug uniqueness via smallest free suffix
//
// Property 2: Slug uniqueness via smallest free suffix
// "For any sequence of source names inserted into a collection, every resulting
//  slug is distinct and valid-shaped; and when a derived slug collides, the
//  system appends `-n` using the smallest integer starting at 2 that yields
//  uniqueness while keeping the slug within 200 characters."
//
// Validates: Requirements 23.3, 23.4, 15.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ensureUniqueSlug, generateSlug, SLUG_PATTERN, MAX_SLUG_LENGTH } from './slug';

/**
 * Reference implementation of the "smallest free `-n` suffix" rule for the case
 * where the base slug is short enough that no truncation occurs. Mirrors the
 * specification independently of the implementation under test.
 */
function expectedSmallestFree(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Insert a sequence of source names into a fresh collection, recording the slug
 * assigned at each step alongside the snapshot of taken slugs that preceded it.
 */
async function simulateInsertions(names: readonly string[]) {
  const taken = new Set<string>();
  const steps: Array<{
    name: string;
    base: string;
    result: string;
    snapshot: Set<string>;
  }> = [];

  for (const name of names) {
    const base = generateSlug(name);
    const snapshot = new Set(taken);
    const result = await ensureUniqueSlug(name, taken);
    steps.push({ name, base, result, snapshot });
    taken.add(result);
  }

  return steps;
}

describe('Property 2: Slug uniqueness via smallest free suffix', () => {
  it('assigns distinct, valid-shaped slugs and the smallest free suffix on collision', async () => {
    // Draw names from a small pool of short, collision-prone sources so that the
    // suffixing path is exercised heavily while base slugs stay well under 200
    // characters (so the smallest-free reference applies without truncation).
    const namePool = [
      'Summer Sale',
      'summer  sale!!',
      'SUMMER-SALE',
      'Winter Deal',
      'winter   deal',
      'Mega Offer',
      'mega offer',
      'Flash',
      '   ',
      '!!!',
      'éclair', // folds to "eclair"
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...namePool), { minLength: 1, maxLength: 30 }),
        async (names) => {
          const steps = await simulateInsertions(names);

          const assigned = new Set<string>();
          for (const { base, result, snapshot } of steps) {
            // Valid-shaped: matches the canonical slug pattern and length bounds.
            expect(result).toMatch(SLUG_PATTERN);
            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);

            // Distinct: never reuses a slug already taken at insertion time.
            expect(snapshot.has(result)).toBe(false);

            // Smallest free suffix: matches the independent reference rule.
            expect(result).toBe(expectedSmallestFree(base, snapshot));

            assigned.add(result);
          }

          // Globally distinct across the whole sequence.
          expect(assigned.size).toBe(steps.length);
        },
      ),
    );
  });

  it('returns the base slug unchanged when it is free', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 80 }), async (name) => {
        const base = generateSlug(name);
        const result = await ensureUniqueSlug(name, new Set<string>());
        expect(result).toBe(base);
      }),
    );
  });

  it('keeps the slug within 200 characters when suffixing a near-maximum base', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A long alphanumeric base near the 200-char ceiling, plus how many
        // suffixed variants are already taken to force successive collisions.
        fc.integer({ min: 190, max: MAX_SLUG_LENGTH }),
        fc.integer({ min: 0, max: 25 }),
        async (baseLength, takenSuffixCount) => {
          const base = 'a'.repeat(baseLength);
          const taken = new Set<string>([base]);
          // Pre-populate the smallest suffixed variants so the implementation is
          // forced to keep probing while honoring the length ceiling.
          for (let n = 2; n < 2 + takenSuffixCount; n++) {
            taken.add(`${base}-${n}`);
          }

          const result = await ensureUniqueSlug(base, taken);

          expect(result).toMatch(SLUG_PATTERN);
          expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
          expect(taken.has(result)).toBe(false);
        },
      ),
    );
  });
});
