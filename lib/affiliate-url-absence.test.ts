// Feature: dealspark, Property 11: Affiliate URLs are absent from server-rendered output
//
// Property 11: Affiliate URLs are absent from server-rendered output
// "For any product or deal, the server-rendered HTML (and serialized RSC
//  payload) of its public page does not contain that record's
//  affiliate/destination URL string."
//
// Validates: Requirements 7.9, 24.1
//
// ---------------------------------------------------------------------------
// LAYER 1 of 2 — DTO projection (the security boundary).
// ---------------------------------------------------------------------------
// This file exercises the *real* public read projections against an in-memory
// MongoDB: a product is created with a distinctive `affiliateUrl` token and a
// deal with a distinctive `destinationUrl` token. We then prove two things per
// generated record:
//
//   1. The raw stored document *does* carry the token — so the assertion below
//      is meaningful (the URL genuinely exists in the database).
//   2. None of the public projections that feed server-rendered pages — the
//      case-sensitive slug resolvers (`resolveActiveProduct` /
//      `resolveActiveDeal`) and the catalog `search` — leak the token into
//      their serialized output (`JSON.stringify`, which mirrors what is sent in
//      the HTML / RSC payload).
//
// The complementary "rendered markup" layer (rendering `ProductCard` /
// `CouponCard` to static HTML) lives in
// `components/affiliate-url-absence.markup.test.tsx`.

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { Types } from 'mongoose';

import {
  createDeal,
  createProduct,
  resolveActiveDeal,
  resolveActiveProduct,
} from '@/lib/catalog';
import { search } from '@/lib/search-service';
import { Deal, Product } from '@/lib/models';
import { dealSchema, productSchema } from '@/lib/validation';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

// DB-backed properties are slower than pure-logic ones; the design allows a
// reduced run count for the DB-backed layer (30–50). Each run performs several
// writes + reads, so we keep it at the lower bound.
const DB_RUNS = 30;

const NAME_WORDS = [
  'Summer',
  'Winter',
  'Mega',
  'Flash',
  'Daily',
  'Festive',
  'Super',
  'Prime',
  'Smart',
  'Gold',
] as const;

/** A multi-word product title / deal headline; its first word is ≥ 3 chars. */
const nameArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...NAME_WORDS), { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

/**
 * A distinctive, unambiguous affiliate/destination URL token. The random
 * hex suffix makes any substring match in serialized output unmistakable, and
 * the `affiliate.example` host never collides with the `cdn.example` image
 * hosts used elsewhere.
 */
const HEX_DIGITS = '0123456789abcdef'.split('');
const tokenArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...HEX_DIGITS), { minLength: 10, maxLength: 24 })
  .map((digits) => `https://affiliate.example/REDIR-${digits.join('')}`);

describe('Property 11 (projection layer): public DTOs exclude the affiliate/destination URL', () => {
  it('never leaks a product affiliate URL or deal destination URL through resolvers or search', async () => {
    await fc.assert(
      fc.asyncProperty(
        nameArb,
        tokenArb,
        tokenArb,
        async (name, productToken, dealToken) => {
          const categoryId = new Types.ObjectId().toString();

          // --- Create a product carrying the affiliate token. ---
          const product = await createProduct(
            productSchema.parse({
              title: name,
              store: `Store ${name}`,
              categoryId,
              currentPrice: 199.99,
              primaryImageUrl: 'https://cdn.example.com/p.jpg',
              affiliateUrl: productToken,
              status: 'active',
            }),
          );

          // --- Create a deal carrying the destination token. ---
          const deal = await createDeal(
            dealSchema.parse({
              headline: name,
              store: `Store ${name}`,
              categoryId,
              dealType: 'direct_deal',
              destinationUrl: dealToken,
              status: 'active',
            }),
          );

          // (1) Sanity: the tokens really are persisted on the raw documents,
          //     so the absence assertions below are meaningful.
          const rawProduct = await Product.findOne({ slug: product.slug })
            .select('affiliateUrl')
            .lean()
            .exec();
          const rawDeal = await Deal.findOne({ slug: deal.slug })
            .select('destinationUrl')
            .lean()
            .exec();
          expect(rawProduct?.affiliateUrl).toBe(productToken);
          expect(rawDeal?.destinationUrl).toBe(dealToken);

          // (2a) Slug resolvers (feed the /product and /deal detail pages).
          const productDetail = await resolveActiveProduct(product.slug);
          const dealDetail = await resolveActiveDeal(deal.slug);
          expect(productDetail).not.toBeNull();
          expect(dealDetail).not.toBeNull();
          expect(JSON.stringify(productDetail)).not.toContain(productToken);
          expect(JSON.stringify(dealDetail)).not.toContain(dealToken);

          // The detail DTOs expose only the boolean presence flag, never the URL.
          expect(productDetail?.hasAffiliateUrl).toBe(true);
          expect(dealDetail?.hasDestinationUrl).toBe(true);

          // (2b) Search (feeds the /search results page). Query by the first
          //      title word so both records are in scope of the matcher.
          const firstWord = name.split(' ')[0];
          const results = await search({ q: firstWord });
          const serializedResults = JSON.stringify(results);
          expect(serializedResults).not.toContain(productToken);
          expect(serializedResults).not.toContain(dealToken);
        },
      ),
      { numRuns: DB_RUNS },
    );
  }, 120_000);
});
