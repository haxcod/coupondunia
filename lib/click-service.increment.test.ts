// Feature: dealspark, Property 5: Atomic, lossless click increment
//
// Property 5: Atomic, lossless click increment
// "For any number N of concurrent click requests against a single active
//  record, the record's final click count equals its initial count plus the
//  number of successful clicks (no increments lost), and exactly one
//  Click_Event is persisted per successful click."
//
// Validates: Requirements 7.4, 9.2
//
// This property exercises the *real* transactional code path (`handleClick`
// → `withTransaction` → atomic `$inc`) against an in-memory single-node
// replica set, so MongoDB multi-document transactions actually run. Concurrency
// is created with `Promise.all` over N simultaneous `handleClick` calls; under
// a correct implementation `session.withTransaction` retries transient write
// conflicts, so no increment is ever lost.
//
// DB-backed properties are slower than pure-logic ones, so we reduce `numRuns`
// while keeping the concurrency (N) meaningful.

import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { handleClick } from '@/lib/click-service';
import { ClickEvent, Deal, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const AFFILIATE_URL = 'https://example.com/go';
const DESTINATION_URL = 'https://example.com/deal';

/** Seed a single active Product with a non-empty affiliate URL. */
async function seedProduct() {
  const product = await new Product({
    title: 'Concurrent Product',
    slug: `concurrent-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: AFFILIATE_URL,
  }).save();
  return product._id;
}

/** Seed a single active Deal with a non-empty destination URL. */
async function seedDeal() {
  const deal = await new Deal({
    headline: 'Concurrent Deal',
    slug: `concurrent-deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: DESTINATION_URL,
  }).save();
  return deal._id;
}

describe('Property 5: Atomic, lossless click increment', () => {
  it('product: final clickCount and ClickEvent count equal the number of successful concurrent clicks', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (n) => {
        // A fresh active record per run (afterEach clears the database).
        const productId = await seedProduct();
        const id = productId.toString();

        // Fire N concurrent clicks against the same record.
        const settled = await Promise.allSettled(
          Array.from({ length: n }, () =>
            handleClick({ type: 'product', id, userAgent: 'agent' }),
          ),
        );

        const successes = settled.filter((r) => r.status === 'fulfilled');
        // With a valid active record, every concurrent click should succeed;
        // transient write conflicts are retried internally, never lost.
        expect(successes.length).toBe(n);
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            expect(r.value.affiliateUrl).toBe(AFFILIATE_URL);
          }
        }

        // No lost updates: the atomic $inc total matches successful clicks...
        const refreshed = await Product.findById(productId).lean();
        expect(refreshed?.clickCount).toBe(successes.length);

        // ...and exactly one ClickEvent is persisted per successful click.
        const events = await ClickEvent.countDocuments({ productId });
        expect(events).toBe(successes.length);
      }),
      { numRuns: 15 },
    );
  });

  it('deal: final clickCount and ClickEvent count equal the number of successful concurrent clicks', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (n) => {
        const dealId = await seedDeal();
        const id = dealId.toString();

        const settled = await Promise.allSettled(
          Array.from({ length: n }, () =>
            handleClick({ type: 'deal', id, userAgent: 'agent' }),
          ),
        );

        const successes = settled.filter((r) => r.status === 'fulfilled');
        expect(successes.length).toBe(n);
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            expect(r.value.affiliateUrl).toBe(DESTINATION_URL);
          }
        }

        const refreshed = await Deal.findById(dealId).lean();
        expect(refreshed?.clickCount).toBe(successes.length);

        const events = await ClickEvent.countDocuments({ dealId });
        expect(events).toBe(successes.length);
      }),
      { numRuns: 15 },
    );
  });
});
