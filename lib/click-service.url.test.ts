// Feature: dealspark, Property 7: Successful click returns the destination URL
//
// Property 7: Successful click returns the destination URL
// "For any active product or deal, a successful click logging operation
//  returns that record's non-empty affiliate/destination URL in the response
//  body."
//
// Validates: Requirements 7.5, 9.4
//
// This property seeds a single active Product (with a random non-empty
// affiliateUrl) or Deal (with a random non-empty destinationUrl) into the
// in-memory transactional database, then drives the *real* `handleClick`
// code path and asserts the returned `affiliateUrl` is EXACTLY the seeded URL.
//
// DB-backed properties are slower than pure-logic ones, so `numRuns` is reduced
// while still exercising a varied space of URLs.

import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { handleClick } from '@/lib/click-service';
import { Deal, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

// A generator of random, non-empty destination URLs. `fc.webUrl()` yields
// syntactically valid http(s) URLs; we constrain the length to stay well within
// the Deal.destinationUrl 2048-char cap and filter out the (rare) empty/blank
// candidate so the seeded URL is always non-empty (Req 9.4).
const urlArb = fc
  .webUrl({ withQueryParameters: true, withFragments: true })
  .filter((u) => u.trim().length > 0 && u.length <= 2048);

/** Seed a single active Product carrying the given non-empty affiliate URL. */
async function seedProduct(affiliateUrl: string) {
  const product = await new Product({
    title: 'URL Product',
    slug: `url-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl,
  }).save();
  return product._id;
}

/** Seed a single active Deal carrying the given non-empty destination URL. */
async function seedDeal(destinationUrl: string) {
  const deal = await new Deal({
    headline: 'URL Deal',
    slug: `url-deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl,
  }).save();
  return deal._id;
}

describe('Property 7: Successful click returns the destination URL', () => {
  it('product: handleClick returns exactly the seeded affiliateUrl', async () => {
    await fc.assert(
      fc.asyncProperty(urlArb, async (affiliateUrl) => {
        // A fresh active record per run (afterEach clears the database).
        const productId = await seedProduct(affiliateUrl);

        const result = await handleClick({
          type: 'product',
          id: productId.toString(),
          userAgent: 'agent',
        });

        expect(result.affiliateUrl).toBe(affiliateUrl);
      }),
      { numRuns: 25 },
    );
  });

  it('deal: handleClick returns exactly the seeded destinationUrl', async () => {
    await fc.assert(
      fc.asyncProperty(urlArb, async (destinationUrl) => {
        const dealId = await seedDeal(destinationUrl);

        const result = await handleClick({
          type: 'deal',
          id: dealId.toString(),
          userAgent: 'agent',
        });

        expect(result.affiliateUrl).toBe(destinationUrl);
      }),
      { numRuns: 25 },
    );
  });
});
