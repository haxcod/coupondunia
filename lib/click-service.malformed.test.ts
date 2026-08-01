// Feature: dealspark, Property 9: Malformed click payload yields 400 with no mutation
//
// Property 9: Malformed click payload yields 400 with no mutation
// "For any click payload that omits the identifier, carries an identifier
//  longer than 64 characters, or omits a required field, the service returns a
//  400 response identifying the invalid field and makes no change to any stored
//  event or click count."
//
// Validates: Requirements 9.6, 21.7
//
// This property exercises the *real* `handleClick` code path against an
// in-memory single-node replica set. We generate schema-invalid payloads
// (missing id / id length > 64 / invalid type / missing type) and assert that
// each one throws `ClickValidationError` (HTTP 400) identifying the offending
// field, while leaving the database untouched (no ClickEvent persisted, no
// click count incremented on any seeded record).
//
// IMPORTANT generator boundary (per design + implementation): a *present*
// identifier that is well-formed for the schema but is not a valid ObjectId is
// treated as a 404 (`ClickNotFoundError`), NOT a 400. So the generators here
// only ever produce payloads that fail the *schema* (missing/oversized id,
// invalid/missing type) — never a schema-valid id that would reach the
// ObjectId/404 branch.

import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { ClickValidationError, handleClick, type ClickInput } from '@/lib/click-service';
import { ClickEvent, Deal, Product } from '@/lib/models';
import { MAX_CLICK_ID_LENGTH } from '@/lib/validation/primitives';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const AFFILIATE_URL = 'https://example.com/go';
const DESTINATION_URL = 'https://example.com/deal';

/** Seed a single active Product (clickCount defaults to 0). */
async function seedProduct() {
  const product = await new Product({
    title: 'Malformed-Test Product',
    slug: `malformed-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: AFFILIATE_URL,
  }).save();
  return product._id;
}

/** Seed a single active Deal (clickCount defaults to 0). */
async function seedDeal() {
  const deal = await new Deal({
    headline: 'Malformed-Test Deal',
    slug: `malformed-deal-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    dealType: 'direct_deal',
    destinationUrl: DESTINATION_URL,
  }).save();
  return deal._id;
}

// --- Generators -----------------------------------------------------------

const ALNUM = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');

/** Non-whitespace string of `min..max` chars (so trimming cannot shrink it). */
function alnumString(min: number, max: number) {
  return fc
    .array(fc.constantFrom(...ALNUM), { minLength: min, maxLength: max })
    .map((chars) => chars.join(''));
}

const VALID_TYPE = fc.constantFrom<'product' | 'deal'>('product', 'deal');

/** A schema-acceptable identifier (non-empty, ≤ 64 chars) for the cases that
 *  fail on the *type* field instead of the id. */
const SCHEMA_VALID_ID = alnumString(1, MAX_CLICK_ID_LENGTH);

/** An identifier strictly longer than the 64-char cap. */
const OVERSIZED_ID = alnumString(MAX_CLICK_ID_LENGTH + 1, MAX_CLICK_ID_LENGTH + 40);

/** A `type` value that is neither "product" nor "deal" (incl. wrong-case,
 *  near-misses, wrong JS types). */
const INVALID_TYPE = fc
  .oneof(
    fc.constantFrom('PRODUCT', 'Deal', 'deals', 'products', 'item', 'click', '', ' '),
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  )
  .filter((v) => v !== 'product' && v !== 'deal');

/**
 * A malformed payload paired with the field we expect the service to flag.
 * Each variant fails the Zod schema (so it short-circuits to a 400 before the
 * ObjectId/404 branch is ever reached).
 */
const MALFORMED = fc.oneof(
  // (a) identifier omitted entirely → field "id"
  VALID_TYPE.map((type) => ({ payload: { type }, field: 'id' })),
  // (b) identifier longer than 64 chars → field "id"
  fc.record({ type: VALID_TYPE, id: OVERSIZED_ID }).map((payload) => ({ payload, field: 'id' })),
  // (c) required field "type" invalid → field "type"
  fc
    .record({ type: INVALID_TYPE, id: SCHEMA_VALID_ID })
    .map((payload) => ({ payload, field: 'type' })),
  // (d) required field "type" omitted → field "type"
  SCHEMA_VALID_ID.map((id) => ({ payload: { id }, field: 'type' })),
);

describe('Property 9: Malformed click payload yields 400 with no mutation', () => {
  it('rejects malformed payloads with a 400 ClickValidationError and persists no mutation', async () => {
    await fc.assert(
      fc.asyncProperty(MALFORMED, async ({ payload, field }) => {
        // Seed one active record of each type so we can prove their click
        // counts are untouched. (afterEach clears between tests; within a run
        // these accumulate, but we assert per-id, and no events are ever made.)
        const productId = await seedProduct();
        const dealId = await seedDeal();

        let thrown: unknown;
        try {
          await handleClick(payload as unknown as ClickInput);
        } catch (err) {
          thrown = err;
        }

        // 400: malformed payload → ClickValidationError identifying the field.
        expect(thrown).toBeInstanceOf(ClickValidationError);
        const validationError = thrown as ClickValidationError;
        expect(validationError.status).toBe(400);
        expect(validationError.field).toBe(field);

        // No mutation: not a single ClickEvent was persisted...
        expect(await ClickEvent.countDocuments({})).toBe(0);
        // ...and neither seeded record's click count moved off its initial 0.
        expect((await Product.findById(productId).lean())?.clickCount).toBe(0);
        expect((await Deal.findById(dealId).lean())?.clickCount).toBe(0);
      }),
      { numRuns: 10 },
    );
  });
});
