// Feature: dealspark, Task 15.5 — recent click-event feed (Req 14.6, 19.11)
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { loadRecentEvents } from '@/lib/analytics';
import { ClickEvent, Deal, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

async function seedProduct(title: string) {
  return new Product({
    title,
    slug: `product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 12_345,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: 'https://example.com/go/product',
    status: 'active',
  }).save();
}

async function seedDeal(headline: string) {
  return new Deal({
    headline,
    slug: `deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: 'https://example.com/go/deal',
    status: 'active',
  }).save();
}

/**
 * Insert click events with explicit timestamps via the native driver so the
 * ordering is deterministic (Mongoose `timestamps` would otherwise stamp
 * `createdAt` to "now").
 */
async function insertEvents(
  docs: ReadonlyArray<{
    clickType: 'product' | 'deal';
    productId?: Types.ObjectId | null;
    dealId?: Types.ObjectId | null;
    deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    createdAt: Date;
  }>,
): Promise<void> {
  await ClickEvent.collection.insertMany(
    docs.map((d) => ({
      clickType: d.clickType,
      productId: d.productId ?? null,
      dealId: d.dealId ?? null,
      deviceType: d.deviceType,
      referrer: 'https://secret.example/private?token=abc',
      userAgent: 'Mozilla/5.0 sensitive',
      createdAt: d.createdAt,
    })),
  );
}

describe('loadRecentEvents — Req 14.6 recent click-event feed', () => {
  it('returns events newest-first with resolved item names and slugs', async () => {
    const product = await seedProduct('Wireless Earbuds');
    const deal = await seedDeal('Mega Festive Sale');

    await insertEvents([
      {
        clickType: 'product',
        productId: product._id,
        deviceType: 'mobile',
        createdAt: new Date('2024-03-01T08:00:00Z'),
      },
      {
        clickType: 'deal',
        dealId: deal._id,
        deviceType: 'desktop',
        createdAt: new Date('2024-03-02T08:00:00Z'),
      },
    ]);

    const rows = await loadRecentEvents();

    expect(rows).toHaveLength(2);
    // Newest first (deal click recorded later).
    expect(rows[0]!.clickType).toBe('deal');
    expect(rows[0]!.itemName).toBe('Mega Festive Sale');
    expect(rows[0]!.slug).toBe(deal.slug);
    expect(rows[0]!.deviceType).toBe('desktop');

    expect(rows[1]!.clickType).toBe('product');
    expect(rows[1]!.itemName).toBe('Wireless Earbuds');
    expect(rows[1]!.slug).toBe(product.slug);
  });

  it('exposes only PII-free fields (Req 19.11)', async () => {
    const product = await seedProduct('Smart Watch');
    await insertEvents([
      {
        clickType: 'product',
        productId: product._id,
        deviceType: 'tablet',
        createdAt: new Date('2024-03-01T08:00:00Z'),
      },
    ]);

    const [row] = await loadRecentEvents();
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(
      ['clickType', 'createdAt', 'deviceType', 'id', 'itemName', 'slug'].sort(),
    );
    // The PII-bearing referrer/userAgent are never surfaced.
    expect(row).not.toHaveProperty('referrer');
    expect(row).not.toHaveProperty('userAgent');
    expect(typeof row!.createdAt).toBe('string');
  });

  it('renders gracefully when the clicked item no longer exists (Req 14.7)', async () => {
    await insertEvents([
      {
        clickType: 'product',
        productId: new Types.ObjectId(), // no matching product
        deviceType: 'unknown',
        createdAt: new Date('2024-03-01T08:00:00Z'),
      },
    ]);

    const [row] = await loadRecentEvents();
    expect(row).toBeDefined();
    expect(row!.itemName).toBe('');
    expect(row!.slug).toBeNull();
  });

  it('caps the number of returned rows to the requested limit', async () => {
    const product = await seedProduct('Bluetooth Speaker');
    const docs = Array.from({ length: 6 }, (_, i) => ({
      clickType: 'product' as const,
      productId: product._id,
      deviceType: 'mobile' as const,
      createdAt: new Date(Date.UTC(2024, 2, 1, 0, i, 0)),
    }));
    await insertEvents(docs);

    const rows = await loadRecentEvents(3);
    expect(rows).toHaveLength(3);
    // The three newest (minutes 5, 4, 3) in descending order.
    expect(rows.map((r) => r.createdAt)).toEqual([
      new Date(Date.UTC(2024, 2, 1, 0, 5, 0)).toISOString(),
      new Date(Date.UTC(2024, 2, 1, 0, 4, 0)).toISOString(),
      new Date(Date.UTC(2024, 2, 1, 0, 3, 0)).toISOString(),
    ]);
  });

  it('returns an empty list when there are no click events', async () => {
    expect(await loadRecentEvents()).toEqual([]);
  });
});
