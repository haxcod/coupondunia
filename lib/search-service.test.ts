// Feature: dealspark, Property 14: Search soundness, completeness, case-insensitivity, counts, and limit
//
// Property 14: Search soundness, completeness, case-insensitivity, counts, and limit
// "For any catalog and any query of at least 2 characters, every returned result
//  contains the query as a case-insensitive substring of at least one searchable
//  field (product title/description, store name, category name, deal headline, or
//  coupon code); every active item that contains the query appears in the full
//  result set; the result set is invariant under changing the query's letter case;
//  the reported product/coupon counts equal the sizes of the respective matching
//  sets; and the number of results returned in one page does not exceed the limit
//  (<= 50)."
//
// Validates: Requirements 11.3, 11.4, 11.5, 11.7, 21.1, 21.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { setupMemoryMongo, clearDatabase } from '@/test/harness/mongo-memory';
import { Store, Category, Product, Deal } from '@/lib/models';
import { search, MAX_RESULTS } from '@/lib/search-service';

setupMemoryMongo();

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Tokens that appear in seeded field values (so queries can match them). */
const TOKENS = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'omega',
  'nova',
  'zen',
  'sale',
  'flip',
  'kart',
] as const;

/** Tokens that never appear in any seeded field (force empty-match cases). */
const MISS_TOKENS = ['xyzzy', 'qwq', 'zzzz'] as const;

type Casing = 'lower' | 'upper' | 'title';

function applyCasing(text: string, casing: Casing): string {
  if (casing === 'upper') return text.toUpperCase();
  if (casing === 'title') return text.replace(/\b\w/g, (c) => c.toUpperCase());
  return text.toLowerCase();
}

/** A 1–3 token phrase rendered in a randomly chosen casing. */
const casedPhraseArb = fc
  .tuple(
    fc.array(fc.constantFrom(...TOKENS), { minLength: 1, maxLength: 3 }),
    fc.constantFrom<Casing>('lower', 'upper', 'title'),
  )
  .map(([tokens, casing]) => applyCasing(tokens.join(' '), casing));

/** A query token (matching or non-matching) in a single, uniform casing. */
const queryArb = fc
  .tuple(
    fc.constantFrom(...TOKENS, ...MISS_TOKENS),
    fc.constantFrom<'lower' | 'upper'>('lower', 'upper'),
  )
  .map(([token, casing]) => (casing === 'upper' ? token.toUpperCase() : token.toLowerCase()));

interface ProductInput {
  title: string;
  description: string;
  storeIdx: number;
  categoryIdx: number;
  active: boolean;
}
interface DealInput {
  headline: string;
  hasCoupon: boolean;
  couponToken: string;
  storeIdx: number;
  categoryIdx: number;
  active: boolean;
}
interface CatalogInput {
  storeNames: string[];
  categoryNames: string[];
  products: ProductInput[];
  deals: DealInput[];
}

const catalogArb: fc.Arbitrary<CatalogInput & { query: string; limit: number }> = fc.record({
  storeNames: fc.array(casedPhraseArb, { minLength: 1, maxLength: 5 }),
  categoryNames: fc.array(casedPhraseArb, { minLength: 1, maxLength: 5 }),
  products: fc.array(
    fc.record({
      title: casedPhraseArb,
      description: fc.oneof(fc.constant(''), casedPhraseArb),
      storeIdx: fc.nat({ max: 1000 }),
      categoryIdx: fc.nat({ max: 1000 }),
      active: fc.boolean(),
    }),
    { minLength: 0, maxLength: 18 },
  ),
  deals: fc.array(
    fc.record({
      headline: casedPhraseArb,
      hasCoupon: fc.boolean(),
      couponToken: fc.constantFrom(...TOKENS),
      storeIdx: fc.nat({ max: 1000 }),
      categoryIdx: fc.nat({ max: 1000 }),
      active: fc.boolean(),
    }),
    { minLength: 0, maxLength: 18 },
  ),
  query: queryArb,
  limit: fc.integer({ min: 0, max: 60 }),
});

// ---------------------------------------------------------------------------
// Seeding + independent oracle
// ---------------------------------------------------------------------------

interface SeededProduct {
  id: string;
  title: string;
  description: string;
  storeIdx: number;
  categoryIdx: number;
  active: boolean;
}
interface SeededDeal {
  id: string;
  headline: string;
  couponCode: string | null;
  storeIdx: number;
  categoryIdx: number;
  active: boolean;
}

async function seedCatalog(cat: CatalogInput) {
  const stores = await Store.create(
    cat.storeNames.map((name, i) => ({ name, slug: `store-${i}` })),
  );
  const categories = await Category.create(
    cat.categoryNames.map((name, i) => ({ name, slug: `category-${i}` })),
  );

  const storeCount = stores.length;
  const categoryCount = categories.length;

  const productSources = cat.products.map((p, i) => {
    const storeIdx = p.storeIdx % storeCount;
    const categoryIdx = p.categoryIdx % categoryCount;
    return {
      doc: {
        title: p.title,
        slug: `product-${i}`,
        storeId: stores[storeIdx]._id,
        categoryId: categories[categoryIdx]._id,
        currentPrice: 1000,
        primaryImageUrl: 'https://example.test/img.png',
        affiliateUrl: 'https://example.test/aff',
        description: p.description,
        status: (p.active ? 'active' : 'inactive') as 'active' | 'inactive',
      },
      title: p.title,
      description: p.description,
      storeIdx,
      categoryIdx,
      active: p.active,
    };
  });

  const dealSources = cat.deals.map((d, i) => {
    const storeIdx = d.storeIdx % storeCount;
    const categoryIdx = d.categoryIdx % categoryCount;
    const couponCode = d.hasCoupon ? d.couponToken.toUpperCase() : null;
    return {
      doc: {
        headline: d.headline,
        slug: `deal-${i}`,
        storeId: stores[storeIdx]._id,
        categoryId: categories[categoryIdx]._id,
        dealType: (d.hasCoupon ? 'coupon_code' : 'direct_deal') as
          | 'coupon_code'
          | 'direct_deal',
        couponCode,
        destinationUrl: 'https://example.test/dest',
        status: (d.active ? 'active' : 'inactive') as 'active' | 'inactive',
      },
      headline: d.headline,
      couponCode,
      storeIdx,
      categoryIdx,
      active: d.active,
    };
  });

  const createdProducts = productSources.length
    ? await Product.create(productSources.map((p) => p.doc))
    : [];
  const createdDeals = dealSources.length
    ? await Deal.create(dealSources.map((d) => d.doc))
    : [];

  const products: SeededProduct[] = productSources.map((p, i) => ({
    id: createdProducts[i]._id.toString(),
    title: p.title,
    description: p.description,
    storeIdx: p.storeIdx,
    categoryIdx: p.categoryIdx,
    active: p.active,
  }));
  const deals: SeededDeal[] = dealSources.map((d, i) => ({
    id: createdDeals[i]._id.toString(),
    headline: d.headline,
    couponCode: d.couponCode,
    storeIdx: d.storeIdx,
    categoryIdx: d.categoryIdx,
    active: d.active,
  }));

  return { storeNames: cat.storeNames, categoryNames: cat.categoryNames, products, deals };
}

/** Independent reference for the case-insensitive substring contract. */
function contains(field: string | null | undefined, q: string): boolean {
  return typeof field === 'string' && field.toLowerCase().includes(q.toLowerCase());
}

interface Seeded {
  storeNames: string[];
  categoryNames: string[];
  products: SeededProduct[];
  deals: SeededDeal[];
}

function oracle(seeded: Seeded, q: string) {
  const matchStoreIdx = new Set<number>();
  seeded.storeNames.forEach((name, i) => {
    if (contains(name, q)) matchStoreIdx.add(i);
  });
  const matchCategoryIdx = new Set<number>();
  seeded.categoryNames.forEach((name, i) => {
    if (contains(name, q)) matchCategoryIdx.add(i);
  });

  const productIds = new Set<string>();
  for (const p of seeded.products) {
    if (!p.active) continue;
    if (
      contains(p.title, q) ||
      contains(p.description, q) ||
      matchStoreIdx.has(p.storeIdx) ||
      matchCategoryIdx.has(p.categoryIdx)
    ) {
      productIds.add(p.id);
    }
  }

  const dealIds = new Set<string>();
  for (const d of seeded.deals) {
    if (!d.active) continue;
    if (
      contains(d.headline, q) ||
      contains(d.couponCode, q) ||
      matchStoreIdx.has(d.storeIdx) ||
      matchCategoryIdx.has(d.categoryIdx)
    ) {
      dealIds.add(d.id);
    }
  }

  return { productIds, dealIds };
}

const idSet = (items: Array<{ id: string }>): string[] => items.map((x) => x.id).sort();

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 14: Search soundness, completeness, case-insensitivity, counts, and limit', () => {
  it('matches the independent oracle for soundness, completeness, counts, limit, and case-insensitivity', async () => {
    await fc.assert(
      fc.asyncProperty(catalogArb, async (cat) => {
        // fast-check iterations share one DB within a single test, so reset
        // before seeding each generated catalog.
        await clearDatabase();
        const seeded = await seedCatalog(cat);

        const q = cat.query;
        const { productIds, dealIds } = oracle(seeded, q);

        const clamped = Math.min(MAX_RESULTS, Math.max(0, Math.trunc(cat.limit)));
        const res = await search({ q, type: 'all', limit: cat.limit });

        // Counts equal the full matching-set sizes (completeness + counts).
        expect(res.productCount).toBe(productIds.size);
        expect(res.dealCount).toBe(dealIds.size);

        // Page size never exceeds the cap, and equals min(count, clamped limit).
        expect(res.products.length).toBeLessThanOrEqual(MAX_RESULTS);
        expect(res.deals.length).toBeLessThanOrEqual(MAX_RESULTS);
        expect(res.products.length).toBe(Math.min(res.productCount, clamped));
        expect(res.deals.length).toBe(Math.min(res.dealCount, clamped));

        // Soundness: every returned item genuinely matches the query.
        for (const p of res.products) expect(productIds.has(p.id)).toBe(true);
        for (const d of res.deals) expect(dealIds.has(d.id)).toBe(true);

        // Case-insensitivity: result set invariant under letter-case change.
        const lower = await search({ q: q.toLowerCase(), type: 'all' });
        const upper = await search({ q: q.toUpperCase(), type: 'all' });
        expect(upper.productCount).toBe(lower.productCount);
        expect(upper.dealCount).toBe(lower.dealCount);
        expect(idSet(upper.products)).toEqual(idSet(lower.products));
        expect(idSet(upper.deals)).toEqual(idSet(lower.deals));
      }),
      { numRuns: 8 },
    );
  }, 120_000);

  it('returns empty collections with success when nothing matches (Req 21.2)', async () => {
    await clearDatabase();
    await seedCatalog({
      storeNames: ['alpha'],
      categoryNames: ['beta'],
      products: [
        {
          title: 'gamma',
          description: 'delta',
          storeIdx: 0,
          categoryIdx: 0,
          active: true,
        },
      ],
      deals: [
        {
          headline: 'omega',
          hasCoupon: true,
          couponToken: 'sale',
          storeIdx: 0,
          categoryIdx: 0,
          active: true,
        },
      ],
    } as CatalogInput);

    const res = await search({ q: 'xyzzy', type: 'all' });
    expect(res).toEqual({ products: [], productCount: 0, deals: [], dealCount: 0 });
  }, 60_000);

  it('caps a single page at 50 while reporting the full count (Req 21.1)', async () => {
    await clearDatabase();
    const products = Array.from({ length: 55 }, () => ({
      title: 'sale',
      description: '',
      storeIdx: 0,
      categoryIdx: 0,
      active: true,
    }));
    await seedCatalog({
      storeNames: ['alpha'],
      categoryNames: ['beta'],
      products,
      deals: [],
    } as CatalogInput);

    const res = await search({ q: 'sale', type: 'all' });
    expect(res.productCount).toBe(55);
    expect(res.products.length).toBe(MAX_RESULTS);
  }, 60_000);
});
