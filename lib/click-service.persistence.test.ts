// Feature: dealspark, Property 6: Click event persistence with field caps and defaults
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { deriveDeviceType, handleClick } from '@/lib/click-service';
import { ClickEvent, Deal, Product } from '@/lib/models';
import {
  DEVICE_TYPES,
  MAX_REFERRER_LENGTH,
  MAX_USER_AGENT_LENGTH,
} from '@/lib/models/types';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

/**
 * Property 6: Click event persistence with field caps and defaults
 *
 * For any valid click input, the persisted `Click_Event` records the click
 * type, item identifier, device type, creation timestamp, a referrer truncated
 * to at most 2048 characters, and a user agent truncated to at most 1024
 * characters; and when the referrer or user agent is omitted, the corresponding
 * stored field is the empty string.
 *
 * Validates: Requirements 7.2, 9.1, 7.3
 *
 * Note on the input space: `handleClick` validates the payload up front, and
 * the referrer/userAgent caps coincide exactly with the validation limits
 * (2048 / 1024). A "valid click input" therefore always has lengths within the
 * caps, so the generators below are constrained to that space (including the
 * exact-cap boundary and the omitted case). Over-cap inputs are not "valid
 * click inputs" — they are rejected with a 400 (Property 9), not truncated.
 */

setupMemoryMongo({ syncIndexes: true });

async function seedActiveProduct() {
  return new Product({
    title: 'Test Product',
    slug: `product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 12_345,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: 'https://example.com/go/product',
    status: 'active',
  }).save();
}

async function seedActiveDeal() {
  return new Deal({
    headline: 'Test Deal',
    slug: `deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: 'https://example.com/go/deal',
    status: 'active',
  }).save();
}

// User-Agent samples that exercise every `deriveDeviceType` branch, mixed with
// random/empty strings. The persisted device type is asserted against
// `deriveDeviceType` directly, so any generated value is handled correctly.
const userAgentSamples = [
  '', // -> unknown
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', // mobile
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36', // mobile
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1', // tablet
  'Mozilla/5.0 (Linux; Android 14; SM-X910) Safari/537.36', // tablet (android, no "mobile")
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36', // desktop
];

/**
 * Optional string capped at `max` characters. Mixes:
 *  - `undefined` (the omitted case -> stored '' default),
 *  - random ASCII strings of length 0..max,
 *  - padded strings whose length spans 0..max (guarantees boundary coverage,
 *    including exactly `max`).
 */
function optionalCappedString(max: number) {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant<string | undefined>(undefined) },
    {
      weight: 2,
      arbitrary: fc.string({ unit: 'binary-ascii', minLength: 0, maxLength: max }),
    },
    {
      weight: 1,
      arbitrary: fc.integer({ min: 0, max }).map((n) => 'x'.repeat(n)),
    },
  );
}

const userAgentArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant<string | undefined>(undefined) },
  { weight: 3, arbitrary: fc.constantFrom(...userAgentSamples) },
  {
    weight: 1,
    arbitrary: fc.string({ unit: 'binary-ascii', minLength: 0, maxLength: MAX_USER_AGENT_LENGTH }),
  },
);

describe('handleClick — Property 6: persistence with field caps and defaults', () => {
  it('persists click type, identifier, derived device type, timestamp, and capped/defaulted referrer & userAgent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'product' | 'deal'>('product', 'deal'),
        optionalCappedString(MAX_REFERRER_LENGTH),
        userAgentArb,
        async (type, referrer, userAgent) => {
          const record = type === 'product' ? await seedActiveProduct() : await seedActiveDeal();

          const result = await handleClick({
            type,
            id: record._id.toString(),
            referrer,
            userAgent,
          });

          // A successful click resolves the non-empty destination URL.
          expect(result.affiliateUrl).toBeTruthy();

          const filter = type === 'product' ? { productId: record._id } : { dealId: record._id };
          const event = await ClickEvent.findOne(filter).lean();
          expect(event).not.toBeNull();

          // Records the click type and item identifier (Req 9.1).
          expect(event!.clickType).toBe(type);
          if (type === 'product') {
            expect(event!.productId?.toString()).toBe(record._id.toString());
            expect(event!.dealId).toBeNull();
          } else {
            expect(event!.dealId?.toString()).toBe(record._id.toString());
            expect(event!.productId).toBeNull();
          }

          // Records a derived device type (Req 9.1).
          expect(DEVICE_TYPES).toContain(event!.deviceType);
          expect(event!.deviceType).toBe(deriveDeviceType(userAgent));

          // Records a creation timestamp.
          expect(event!.createdAt).toBeInstanceOf(Date);

          // Referrer: capped to <= 2048 and defaulted to '' when omitted (Req 7.2, 7.3).
          const expectedReferrer = referrer ?? '';
          expect(event!.referrer).toBe(expectedReferrer);
          expect(event!.referrer.length).toBeLessThanOrEqual(MAX_REFERRER_LENGTH);

          // User agent: capped to <= 1024 and defaulted to '' when omitted (Req 7.2, 7.3).
          const expectedUserAgent = userAgent ?? '';
          expect(event!.userAgent).toBe(expectedUserAgent);
          expect(event!.userAgent.length).toBeLessThanOrEqual(MAX_USER_AGENT_LENGTH);
        },
      ),
      // Reduced runs: every case performs real DB writes inside a transaction.
      { numRuns: 8 },
    );
  });
});
