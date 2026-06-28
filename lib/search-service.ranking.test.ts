// Feature: dealspark, Property 15: Exact title matches rank ahead of partial matches
//
// Property 15: Exact title matches rank ahead of partial matches
// "For any query and catalog, no result whose match is only a partial match
//  appears before any result that is an exact product-title match."
//
// Validates: Requirements 11.6
//
// This is a DB-backed property: it seeds Products whose titles either equal the
// query exactly (case-insensitively) or merely contain it as a substring, runs
// the real `search` against an in-memory single-node replica set, and asserts
// that every exact-title match in the returned `products` array appears before
// every partial-only match. `numRuns` is reduced because each iteration performs
// real database operations, and `clearDatabase()` resets state between runs.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { setupMemoryMongo, clearDatabase } from '@/test/harness/mongo-memory';
import { Store, Category, Product } from '@/lib/models';
import { search, MAX_RESULTS } from '@/lib/search-service';

setupMemoryMongo();

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Single-word query tokens (used verbatim as exact product titles). */
const TOKENS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'nova', 'zen'] as const;
/** Extra words used to turn a query into a partial-only (substring) title. */
const AFFIXES = ['super', 'sale', 'deal', 'mega', 'pro', 'plus'] as const;

type Casing = 'lower' | 'upper' | 'title';

function applyCasing(text: string, casing: Casing): string {
  if (casing === 'upper') return text.toUpperCase();
  if (casing === 'title') return text.replace(/\b\w/g, (c) => c.toUpperCase());
  return text.toLowerCase();
}

const casingArb = fc.constantFrom<Casing>('lower', 'upper', 'title');

/** An exact-title product: its title equals the query (in some casing). */
const exactArb = fc.record({ casing: casingArb });

/**
 * A partial-only product: its title embeds the query as a substring alongside
 * an affix word, so it can never equal the query exactly.
 */
const partialArb = fc.record({
  affix: fc.constantFrom(...AFFIXES),
  position: fc.constantFrom<'pre' | 'post'>('pre', 'post'),
  casing: casingArb,
});

const scenarioArb = fc.record({
  // Uniform casing of the query the user types.
  query: fc.constantFrom(...TOKENS),
  queryCasing: fc.constantFrom<'lower' | 'upper'>('lower', 'upper'),
  exact: fc.array(exactArb, { minLength: 1, maxLength: 8 }),
  partial: fc.array(partialArb, { minLength: 1, maxLength: 8 }),
});

function toScenario(s: {
  query: string;
  queryCasing: 'lower' | 'upper';
  exact: Array<{ casing: Casing }>;
  partial: Array<{ affix: string; position: 'pre' | 'post'; casing: Casing }>;
}) {
  return s;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Seed a single store/category plus the exact and partial-title products for a
 * scenario. Returns the set of product ids whose title exactly equals the query
 * (case-insensitively) so the assertion can classify returned results.
 */
async function seedScenario(s: ReturnType<typeof toScenario>) {
  const store = await Store.create({ name: 'A Store', slug: 'a-store' });
  const category = await Category.create({ name: 'A Category', slug: 'a-category' });

  const base = {
    storeId: store._id,
    categoryId: category._id,
    currentPrice: 1000,
    primaryImageUrl: 'https://example.test/img.png',
    affiliateUrl: 'https://example.test/aff',
    description: '',
    status: 'active' as const,
  };

  let n = 0;
  const docs: Array<Record<string, unknown> & { __exact: boolean }> = [];

  for (const e of s.exact) {
    docs.push({
      ...base,
      title: applyCasing(s.query, e.casing), // equals query (case-insensitively)
      slug: `product-${n++}`,
      __exact: true,
    });
  }
  for (const p of s.partial) {
    const phrase = p.position === 'pre' ? `${p.affix} ${s.query}` : `${s.query} ${p.affix}`;
    docs.push({
      ...base,
      title: applyCasing(phrase, p.casing), // contains query but never equals it
      slug: `product-${n++}`,
      __exact: false,
    });
  }

  const created = await Product.create(docs.map(({ __exact, ...doc }) => doc));
  const exactIds = new Set<string>();
  docs.forEach((d, i) => {
    if (d.__exact) exactIds.add(created[i]._id.toString());
  });
  return exactIds;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 15: Exact title matches rank ahead of partial matches', () => {
  it('returns every exact product-title match before any partial-only match', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (raw) => {
        const s = toScenario(raw);
        // fast-check iterations share one DB within a single test, so reset
        // before seeding each generated scenario.
        await clearDatabase();
        const exactIds = await seedScenario(s);

        const q = s.queryCasing === 'upper' ? s.query.toUpperCase() : s.query.toLowerCase();
        const res = await search({ q, type: 'product' });

        // Scenario sizes are well below the page cap, so the full ranked set is
        // returned and ordering can be checked end to end.
        expect(res.products.length).toBeLessThanOrEqual(MAX_RESULTS);
        expect(res.productCount).toBe(s.exact.length + s.partial.length);
        expect(res.products.length).toBe(res.productCount);

        // Walk the returned order: once any partial-only match is seen, no
        // exact-title match may follow it.
        let seenPartial = false;
        for (const p of res.products) {
          const isExact = exactIds.has(p.id);
          if (isExact) {
            expect(seenPartial).toBe(false);
          } else {
            seenPartial = true;
          }
        }
      }),
      { numRuns: 8 },
    );
  }, 120_000);
});
