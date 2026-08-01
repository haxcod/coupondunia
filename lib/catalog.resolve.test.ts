// Feature: dealspark, Property 3: Slug resolution round-trip and 404
//
// Property 3: Slug resolution round-trip and 404
// "For any active entry, requesting its exact (case-sensitive) slug resolves to
//  exactly that single entry; and for any slug not present among the active
//  entries of a collection, resolution returns not-found and resolves to no
//  other entry."
//
// Validates: Requirements 23.5, 23.6, 5.2, 6.2, 8.2
//
// This property exercises the real case-sensitive, active-only slug resolvers
// (`resolveActiveProduct` / `resolveActiveDeal` / `resolveActiveCategory`)
// against an in-memory MongoDB. Active entities are created through the catalog
// mutations (`createProduct` / `createDeal` / `createCategory`), which generate
// the canonical slug; we then assert four facets per collection:
//   1. round-trip — resolving the created slug returns exactly that entity;
//   2. 404        — resolving a slug absent from the collection returns null;
//   3. case-sensitive — resolving a different-case variant returns null;
//   4. active-only — an inactive entity never resolves by its slug.
//
// DB-backed properties are slower than pure-logic ones, so `numRuns` is reduced.

import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
  createCategory,
  createDeal,
  createProduct,
  resolveActiveCategory,
  resolveActiveDeal,
  resolveActiveProduct,
} from '@/lib/catalog';
import { categorySchema, dealSchema, productSchema } from '@/lib/validation';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const DB_RUNS = 8;

/**
 * A source name/title generator that always contains at least one ASCII letter,
 * so the derived (lowercase) slug is non-empty and changes under upper-casing
 * (letting us probe case-sensitivity meaningfully).
 */
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

const nameArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...NAME_WORDS), { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

/** An EntityStatus that is *not* `active` (so the row must be excluded). */
const inactiveStatusArb = fc.constant('inactive' as const);

/** A slug-shaped string guaranteed absent from any collection under test. */
function unusedSlug(): string {
  return `does-not-exist-${new Types.ObjectId().toString()}`;
}

/**
 * Build an upper-cased variant of a slug that is guaranteed to differ from it.
 * Slugs are lowercase `[a-z0-9-]`; upper-casing a slug that contains a letter
 * yields a distinct string that must not resolve under case-sensitive matching.
 * Returns null when the slug has no letters (nothing to probe).
 */
function differentCaseVariant(slug: string): string | null {
  const upper = slug.toUpperCase();
  return upper === slug ? null : upper;
}

describe('Property 3: Slug resolution round-trip and 404 (Product)', () => {
  it('round-trips active slugs, 404s unknown/wrong-case slugs, and excludes inactive', async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, inactiveStatusArb, async (title, inactiveStatus) => {
        const categoryId = new Types.ObjectId().toString();

        // --- Round-trip: an active product resolves to exactly itself. ---
        const active = await createProduct(
          productSchema.parse({
            title,
            store: `Store ${title}`,
            categoryId,
            currentPrice: 99.99,
            primaryImageUrl: 'https://example.com/p.jpg',
            affiliateUrl: 'https://example.com/go',
            status: 'active',
          }),
        );

        const resolved = await resolveActiveProduct(active.slug);
        expect(resolved).not.toBeNull();
        expect(resolved?.id).toBe(active.id);
        expect(resolved?.slug).toBe(active.slug);

        // --- 404: a slug absent from the collection resolves to nothing. ---
        expect(await resolveActiveProduct(unusedSlug())).toBeNull();

        // --- Case-sensitive: a different-case variant does not resolve. ---
        const wrongCase = differentCaseVariant(active.slug);
        if (wrongCase) {
          expect(await resolveActiveProduct(wrongCase)).toBeNull();
        }

        // --- Active-only: an inactive product never resolves by its slug. ---
        const inactive = await createProduct(
          productSchema.parse({
            title: `${title} Hidden`,
            store: `Store ${title}`,
            categoryId,
            currentPrice: 49.99,
            primaryImageUrl: 'https://example.com/p2.jpg',
            affiliateUrl: 'https://example.com/go2',
            status: inactiveStatus,
          }),
        );
        expect(await resolveActiveProduct(inactive.slug)).toBeNull();
      }),
      { numRuns: DB_RUNS },
    );
  });
});

describe('Property 3: Slug resolution round-trip and 404 (Deal)', () => {
  it('round-trips active slugs, 404s unknown/wrong-case slugs, and excludes inactive', async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, inactiveStatusArb, async (headline, inactiveStatus) => {
        const categoryId = new Types.ObjectId().toString();

        const active = await createDeal(
          dealSchema.parse({
            headline,
            store: `Store ${headline}`,
            categoryId,
            dealType: 'direct_deal',
            destinationUrl: 'https://example.com/deal',
            status: 'active',
          }),
        );

        const resolved = await resolveActiveDeal(active.slug);
        expect(resolved).not.toBeNull();
        expect(resolved?.id).toBe(active.id);
        expect(resolved?.slug).toBe(active.slug);

        expect(await resolveActiveDeal(unusedSlug())).toBeNull();

        const wrongCase = differentCaseVariant(active.slug);
        if (wrongCase) {
          expect(await resolveActiveDeal(wrongCase)).toBeNull();
        }

        const inactive = await createDeal(
          dealSchema.parse({
            headline: `${headline} Hidden`,
            store: `Store ${headline}`,
            categoryId,
            dealType: 'direct_deal',
            destinationUrl: 'https://example.com/deal2',
            status: inactiveStatus,
          }),
        );
        expect(await resolveActiveDeal(inactive.slug)).toBeNull();
      }),
      { numRuns: DB_RUNS },
    );
  });
});

describe('Property 3: Slug resolution round-trip and 404 (Category)', () => {
  it('round-trips active slugs, 404s unknown/wrong-case slugs, and excludes inactive', async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, inactiveStatusArb, async (name, inactiveStatus) => {
        const active = await createCategory(
          categorySchema.parse({ name, status: 'active' }),
        );

        const resolved = await resolveActiveCategory(active.slug);
        expect(resolved).not.toBeNull();
        expect(resolved?.id).toBe(active.id);
        expect(resolved?.slug).toBe(active.slug);

        expect(await resolveActiveCategory(unusedSlug())).toBeNull();

        const wrongCase = differentCaseVariant(active.slug);
        if (wrongCase) {
          expect(await resolveActiveCategory(wrongCase)).toBeNull();
        }

        const inactive = await createCategory(
          categorySchema.parse({ name: `${name} Hidden`, status: inactiveStatus }),
        );
        expect(await resolveActiveCategory(inactive.slug)).toBeNull();
      }),
      { numRuns: DB_RUNS },
    );
  });
});
