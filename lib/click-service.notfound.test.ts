// Feature: dealspark, Property 8: Unknown identifier yields 404 with no mutation
//
// Property 8: Unknown identifier yields 404 with no mutation
// "For any click request whose identifier matches no active record, the
//  service returns a 404 response, persists no Click_Event, and leaves every
//  click count unchanged."
//
// Validates: Requirements 7.10, 9.5, 21.4
//
// We exercise the *real* code path (`handleClick` -> `withTransaction`) against
// an in-memory single-node replica set. Two flavours of "matches no active
// record" are generated:
//   1. A syntactically-valid-but-nonexistent ObjectId (nothing seeded).
//   2. A seeded-but-INACTIVE Product/Deal (status: 'inactive'), whose id is
//      well-formed and present, yet must not resolve as an active record.
// In both cases the service must reject with ClickNotFoundError (status 404),
// persist zero Click_Events, and leave any seeded record's clickCount at 0.
//
// DB-backed properties are slower than pure-logic ones, so numRuns is reduced.

import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
  ClickNotFoundError,
  handleClick,
  type ClickType,
} from '@/lib/click-service';
import { ClickEvent, Deal, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const AFFILIATE_URL = 'https://example.com/go';
const DESTINATION_URL = 'https://example.com/deal';

/** Seed an INACTIVE Product (well-formed id, present, but not active). */
async function seedInactiveProduct() {
  const product = await new Product({
    title: 'Inactive Product',
    slug: `inactive-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: AFFILIATE_URL,
    status: 'inactive',
  }).save();
  return product._id;
}

/** Seed an INACTIVE Deal (well-formed id, present, but not active). */
async function seedInactiveDeal() {
  const deal = await new Deal({
    headline: 'Inactive Deal',
    slug: `inactive-deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: DESTINATION_URL,
    status: 'inactive',
  }).save();
  return deal._id;
}

/** Arbitrary: a fresh, valid 24-hex-char ObjectId string (never seeded). */
const arbObjectIdString = fc
  .constant(null)
  .map(() => new Types.ObjectId().toString());

/** Arbitrary click type. */
const arbClickType = fc.constantFrom<ClickType>('product', 'deal');

/** Arbitrary optional metadata that must never affect the not-found outcome. */
const arbUserAgent = fc.option(
  fc.constantFrom(
    'Mozilla/5.0 (iPhone)',
    'Mozilla/5.0 (Windows NT 10.0)',
    'curl/8.0',
    '',
  ),
  { nil: undefined },
);

describe('Property 8: Unknown identifier yields 404 with no mutation', () => {
  it('valid-but-nonexistent identifier: rejects with 404 and persists nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbClickType,
        arbObjectIdString,
        arbUserAgent,
        async (type, id, userAgent) => {
          // Nothing is seeded for this id (afterEach clears between runs).
          let caught: unknown;
          try {
            await handleClick({ type, id, userAgent });
          } catch (err) {
            caught = err;
          }

          // 404 mapping: a well-formed but unmatched identifier is NotFound.
          expect(caught).toBeInstanceOf(ClickNotFoundError);
          expect((caught as ClickNotFoundError).status).toBe(404);

          // No Click_Event persisted by the aborted/short-circuited transaction.
          const events = await ClickEvent.countDocuments({});
          expect(events).toBe(0);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('inactive record: rejects with 404, persists nothing, leaves clickCount unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbClickType,
        arbUserAgent,
        async (type, userAgent) => {
          // Seed a present-but-inactive record; its id is well-formed and
          // exists, yet it must not resolve as an active record.
          const recordId =
            type === 'product'
              ? await seedInactiveProduct()
              : await seedInactiveDeal();
          const id = recordId.toString();

          let caught: unknown;
          try {
            await handleClick({ type, id, userAgent });
          } catch (err) {
            caught = err;
          }

          expect(caught).toBeInstanceOf(ClickNotFoundError);
          expect((caught as ClickNotFoundError).status).toBe(404);

          // No event persisted...
          const events = await ClickEvent.countDocuments({});
          expect(events).toBe(0);

          // ...and the seeded record's clickCount is untouched (still 0).
          if (type === 'product') {
            const refreshed = await Product.findById(recordId).lean();
            expect(refreshed?.clickCount).toBe(0);
          } else {
            const refreshed = await Deal.findById(recordId).lean();
            expect(refreshed?.clickCount).toBe(0);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
