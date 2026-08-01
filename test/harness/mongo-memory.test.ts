/**
 * Smoke tests for the in-memory transactional harness.
 *
 * These verify the harness itself is wired correctly and that the shared
 * `withTransaction` helper provides the transactional guarantees the
 * Click_Service relies on:
 *  - commit persists all writes (Req 9.2)
 *  - a thrown error rolls back every write in the transaction (Req 9.3)
 *  - atomic `$inc` increments are durable within a committed transaction (Req 9.2)
 */
import { Types } from 'mongoose';
import { describe, expect, test } from 'vitest';
import { withTransaction } from '@/lib/db';
import { ClickEvent, Product } from '@/lib/models';
import { setupMemoryMongo } from './mongo-memory';

setupMemoryMongo({ syncIndexes: true });

function makeProduct() {
  return new Product({
    title: 'Test Product',
    slug: `test-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: 'https://example.com/go',
  });
}

describe('in-memory transactional harness', () => {
  test('replica set supports transactions: commit persists writes', async () => {
    const product = await makeProduct().save();

    await withTransaction(async (session) => {
      await ClickEvent.create(
        [{ clickType: 'product', productId: product._id, deviceType: 'mobile' }],
        { session },
      );
      await Product.updateOne(
        { _id: product._id },
        { $inc: { clickCount: 1 } },
        { session },
      );
    });

    const refreshed = await Product.findById(product._id).lean();
    const events = await ClickEvent.countDocuments({ productId: product._id });
    expect(refreshed?.clickCount).toBe(1);
    expect(events).toBe(1);
  });

  test('a thrown error rolls back every write in the transaction (Req 9.3)', async () => {
    const product = await makeProduct().save();

    await expect(
      withTransaction(async (session) => {
        await ClickEvent.create(
          [{ clickType: 'product', productId: product._id, deviceType: 'mobile' }],
          { session },
        );
        await Product.updateOne(
          { _id: product._id },
          { $inc: { clickCount: 1 } },
          { session },
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Pre-operation state must be fully restored: no event, no increment.
    const refreshed = await Product.findById(product._id).lean();
    const events = await ClickEvent.countDocuments({ productId: product._id });
    expect(refreshed?.clickCount).toBe(0);
    expect(events).toBe(0);
  });

  test('clearDatabase resets state between tests', async () => {
    // The afterEach hook from setupMemoryMongo should have cleared prior docs.
    const products = await Product.countDocuments();
    const events = await ClickEvent.countDocuments();
    expect(products).toBe(0);
    expect(events).toBe(0);
  });
});
