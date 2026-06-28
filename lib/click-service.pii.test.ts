// Feature: dealspark, Property 12: Click events exclude personally identifiable information
//
// Property 12: Click events exclude personally identifiable information
// "For any incoming click payload — including payloads augmented with
//  PII-classified fields (full IP, email, full name, phone, government
//  identifier, or account identifier) — the persisted Click_Event and any
//  analytics export contain none of those fields or their values."
//
// Validates: Requirements 27.1, 27.2, 19.11
//
// This property exercises the *real* persistence path (`handleClick` →
// `withTransaction` → `ClickEvent.create`) against an in-memory single-node
// replica set. For each run we attempt to smuggle a randomly-generated set of
// PII-classified fields/values into the click input, then read back the raw
// persisted document directly from the collection and assert:
//   1. the stored keys are exactly the allowed (non-PII) set (plus Mongo's own
//      `_id`/`__v` metadata) — no PII key is ever persisted, and
//   2. none of the injected PII *values* appear in any stored string field.
//
// The `ClickEvent` schema uses `strict: 'throw'` and declares no PII field, so
// any attempt to persist an unknown key would throw rather than silently store
// it; this test confirms `handleClick` never even routes such fields to the DB.
//
// DB-backed properties are slower than pure-logic ones, so we reduce `numRuns`.

import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { handleClick, type ClickInput } from '@/lib/click-service';
import { ClickEvent, Deal, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const AFFILIATE_URL = 'https://example.com/go';
const DESTINATION_URL = 'https://example.com/deal';

/** The only data fields a persisted Click_Event may carry (Req 27.1/27.2). */
const ALLOWED_DATA_KEYS = [
  'clickType',
  'productId',
  'dealId',
  'deviceType',
  'referrer',
  'userAgent',
  'createdAt',
] as const;

/** Mongo-managed metadata keys that are not application PII. */
const META_KEYS = ['_id', '__v'] as const;

const ALLOWED_KEYS = new Set<string>([...ALLOWED_DATA_KEYS, ...META_KEYS]);

/**
 * Field names that classify as personally identifiable information per Req 27.1
 * (full IP, email, full name, phone, government identifier, account identifier)
 * plus common aliases an upstream caller might attach.
 */
const PII_KEYS = [
  'ip',
  'ipAddress',
  'clientIp',
  'email',
  'emailAddress',
  'name',
  'fullName',
  'phone',
  'phoneNumber',
  'governmentId',
  'ssn',
  'accountId',
  'userId',
  'userAccountId',
] as const;

/** Seed a single active Product with a non-empty affiliate URL. */
async function seedProduct() {
  const product = await new Product({
    title: 'PII Product',
    slug: `pii-product-${new Types.ObjectId().toString()}`,
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
    headline: 'PII Deal',
    slug: `pii-deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: DESTINATION_URL,
  }).save();
  return deal._id;
}

/**
 * Generate a non-empty-ish object mapping a random subset of PII keys to
 * random, recognizably-non-empty string values, so we can later assert none of
 * those keys *or* values were persisted.
 */
const piiArb: fc.Arbitrary<Record<string, string>> = fc
  .subarray([...PII_KEYS], { minLength: 0 })
  .chain((keys) =>
    fc
      .tuple(...keys.map(() => fc.string({ minLength: 1, maxLength: 32 })))
      .map((values) => {
        const obj: Record<string, string> = {};
        keys.forEach((k, i) => {
          // Prefix to guarantee a distinctive, non-empty marker value.
          obj[k] = `PII_${values[i]}`;
        });
        return obj;
      }),
  );

describe('Property 12: Click events exclude personally identifiable information', () => {
  it('persists only non-PII fields and no injected PII keys or values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'product' | 'deal'>('product', 'deal'),
        // referrer / userAgent are legitimately stored (capped); keep them PII-free.
        fc.option(fc.webUrl(), { nil: undefined }),
        fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
        piiArb,
        async (type, referrer, userAgent, pii) => {
          const recordId =
            type === 'product' ? await seedProduct() : await seedDeal();
          const id = recordId.toString();

          // Build a legitimate input and smuggle PII fields alongside it. The
          // cast models an upstream caller attaching extra (PII) properties.
          const input = {
            type,
            id,
            referrer,
            userAgent,
            ...pii,
          } as ClickInput;

          const result = await handleClick(input);
          expect(result.affiliateUrl).toBe(
            type === 'product' ? AFFILIATE_URL : DESTINATION_URL,
          );

          // Read the raw persisted document straight from the collection so we
          // inspect exactly what was stored (not a model-shaped projection).
          const raw = await ClickEvent.collection.findOne({});
          expect(raw).not.toBeNull();
          const doc = raw as Record<string, unknown>;

          // 1. Stored keys are a subset of the allowed (non-PII) set.
          for (const key of Object.keys(doc)) {
            expect(ALLOWED_KEYS.has(key)).toBe(true);
          }

          // 2. No PII key is present under any of its known names.
          for (const piiKey of PII_KEYS) {
            expect(Object.prototype.hasOwnProperty.call(doc, piiKey)).toBe(false);
          }

          // 3. None of the injected PII *values* leaked into any stored string.
          const storedStrings = Object.values(doc)
            .filter((v): v is string => typeof v === 'string')
            .join('\u0000');
          for (const value of Object.values(pii)) {
            expect(storedStrings.includes(value)).toBe(false);
          }
        },
      ),
      { numRuns: 8 },
    );
  });
});
