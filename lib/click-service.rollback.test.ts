// Feature: dealspark, Property 10: Failed transaction rolls back completely
//
// Property 10: Failed transaction rolls back completely
// "For any click input processed while the persistence transaction fails, the
//  post-operation state equals the pre-operation state (neither a new
//  Click_Event nor an incremented count is retained) and a server-error
//  response is returned."
//
// Validates: Requirements 9.3
//
// This property exercises the *real* transactional code path (`handleClick`
// → `withTransaction`) against an in-memory single-node replica set, so MongoDB
// multi-document transactions actually run and roll back. We force a failure
// *inside* the transaction at two distinct points:
//
//   1. at the Click_Event insert (`ClickEvent.create` throws), and
//   2. at the atomic increment (`Product/Deal.updateOne` throws) — which runs
//      AFTER the event insert, so this case proves the already-written event is
//      rolled back too, not merely never written.
//
// In both cases the post-state must equal the pre-state: zero Click_Events
// persisted and the record's clickCount unchanged, and `handleClick` must
// surface a `ClickServerError` (HTTP 500).
//
// DB-backed properties are slower than pure-logic ones, so we reduce `numRuns`
// while keeping the input space (record type, failure point, initial count)
// meaningful.

import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';

import { ClickServerError, handleClick } from '@/lib/click-service';
import { ClickEvent, Deal, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

afterEach(() => {
  vi.restoreAllMocks();
});

const AFFILIATE_URL = 'https://example.com/go';
const DESTINATION_URL = 'https://example.com/deal';

/** Seed a single active Product with a non-empty affiliate URL and given count. */
async function seedProduct(initialClickCount: number): Promise<Types.ObjectId> {
  const product = await new Product({
    title: 'Rollback Product',
    slug: `rollback-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: AFFILIATE_URL,
    clickCount: initialClickCount,
  }).save();
  return product._id;
}

/** Seed a single active Deal with a non-empty destination URL and given count. */
async function seedDeal(initialClickCount: number): Promise<Types.ObjectId> {
  const deal = await new Deal({
    headline: 'Rollback Deal',
    slug: `rollback-deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: DESTINATION_URL,
    clickCount: initialClickCount,
  }).save();
  return deal._id;
}

type RecordType = 'product' | 'deal';
type FailurePoint = 'event-insert' | 'increment';

describe('Property 10: Failed transaction rolls back completely', () => {
  it('a failure inside the transaction leaves zero events, an unchanged count, and surfaces a 500', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<RecordType>('product', 'deal'),
        fc.constantFrom<FailurePoint>('event-insert', 'increment'),
        fc.integer({ min: 0, max: 1000 }),
        async (type, failurePoint, initialClickCount) => {
          // A fresh active record per run (afterEach clears the database).
          const recordId =
            type === 'product'
              ? await seedProduct(initialClickCount)
              : await seedDeal(initialClickCount);
          const id = recordId.toString();

          // Inject a failure at the chosen point inside the transaction.
          if (failurePoint === 'event-insert') {
            vi.spyOn(ClickEvent, 'create').mockImplementation(() => {
              throw new Error('injected event-insert failure');
            });
          } else {
            // The increment runs AFTER the event insert succeeds, so failing
            // here proves the already-written event is rolled back as well.
            const model = type === 'product' ? Product : Deal;
            vi.spyOn(model, 'updateOne').mockImplementation(() => {
              throw new Error('injected increment failure');
            });
          }

          // The click must surface as a rolled-back server error (500).
          await expect(
            handleClick({ type, id, userAgent: 'agent' }),
          ).rejects.toBeInstanceOf(ClickServerError);

          // Post-state equals pre-state: no Click_Event persisted...
          const eventFilter =
            type === 'product' ? { productId: recordId } : { dealId: recordId };
          const events = await ClickEvent.countDocuments(eventFilter);
          expect(events).toBe(0);

          // ...and the record's clickCount is exactly its initial value.
          const refreshed =
            type === 'product'
              ? await Product.findById(recordId).lean()
              : await Deal.findById(recordId).lean();
          expect(refreshed?.clickCount).toBe(initialClickCount);
        },
      ),
      { numRuns: 8 },
    );
  });

  it('the surfaced ClickServerError carries HTTP status 500', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<RecordType>('product', 'deal'),
        async (type) => {
          const recordId =
            type === 'product' ? await seedProduct(0) : await seedDeal(0);
          const id = recordId.toString();

          vi.spyOn(ClickEvent, 'create').mockImplementation(() => {
            throw new Error('injected failure');
          });

          try {
            await handleClick({ type, id, userAgent: 'agent' });
            // Should never reach here — the transaction must fail.
            expect.unreachable('handleClick should have thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(ClickServerError);
            expect((err as ClickServerError).status).toBe(500);
          }
        },
      ),
      { numRuns: 5 },
    );
  });
});
