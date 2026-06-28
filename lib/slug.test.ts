// Feature: dealspark, Property 1: Slug shape, fallback, and store tokens
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateSlug,
  storeScopedSlug,
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
} from '@/lib/slug';

/**
 * Property 1: Slug shape, fallback, and store tokens
 * Validates: Requirements 23.1, 23.2, 24.12, 15.5
 *
 * - Req 23.1 / 15.5: a generated slug contains only lowercase letters, digits,
 *   and single hyphens (matches SLUG_PATTERN), with no leading/trailing/
 *   consecutive hyphens, and is 1..200 characters long.
 * - Req 23.2: when the source sanitizes to empty, a non-empty fallback slug is
 *   produced (the result is never empty).
 * - Req 24.12: every store-scoped Product/Deal slug includes the sanitized
 *   tokens of the store name.
 */

/** Assert a value satisfies the canonical slug shape and length bounds. */
function assertValidSlug(slug: string): void {
  expect(slug.length).toBeGreaterThanOrEqual(1);
  expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  expect(slug).toMatch(SLUG_PATTERN);
}

// Arbitrary covering ASCII, full Unicode (CJK/emoji), and binary code points so
// empty/whitespace/punctuation/non-Latin inputs are all exercised.
const anyTextArb = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: 'binary' }),
);

// A handful of explicit edge inputs that should all fall back to a valid slug.
const edgeInputs = ['', '   ', '\t\n', '!!!', '---', '@#$%^&*', '日本語', '😀😀', '...---...'];

// Lowercase-alphanumeric "word" used to build store names with predictable
// sanitized tokens for the store-token containment check.
const wordArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 12,
  })
  .map((chars) => chars.join(''));

describe('Property 1: Slug shape, fallback, and store tokens', () => {
  it('generateSlug always produces a valid-shaped, non-empty, 1..200 char slug', () => {
    fc.assert(
      fc.property(anyTextArb, (source) => {
        assertValidSlug(generateSlug(source));
      }),
    );
  });

  it('generateSlug honors a custom fallback while keeping a valid shape', () => {
    fc.assert(
      fc.property(anyTextArb, anyTextArb, (source, fallback) => {
        assertValidSlug(generateSlug(source, fallback));
      }),
    );
  });

  it('generateSlug returns a non-empty fallback for inputs that sanitize to empty', () => {
    for (const input of edgeInputs) {
      const slug = generateSlug(input);
      assertValidSlug(slug);
    }
  });

  it('storeScopedSlug is always a valid-shaped slug for any (store, title) pair', () => {
    fc.assert(
      fc.property(anyTextArb, anyTextArb, (storeName, title) => {
        assertValidSlug(storeScopedSlug(storeName, title));
      }),
    );
  });

  it('storeScopedSlug contains the sanitized tokens of the store name', () => {
    fc.assert(
      fc.property(
        fc.array(wordArb, { minLength: 1, maxLength: 5 }),
        anyTextArb,
        (storeWords, title) => {
          // Raw store name uses spaces between words; sanitization turns those
          // spaces into hyphen token boundaries, so the expected sanitized store
          // value is simply the words joined by single hyphens.
          const storeName = storeWords.join(' ');
          const expectedStoreSlug = storeWords.join('-');

          const slug = storeScopedSlug(storeName, title);

          assertValidSlug(slug);
          // The store name is placed first, so its tokens survive truncation and
          // form the slug prefix (Req 24.12).
          expect(slug.startsWith(expectedStoreSlug)).toBe(true);
          // Every individual store token is present in the slug.
          for (const word of storeWords) {
            expect(slug.includes(word)).toBe(true);
          }
        },
      ),
    );
  });
});
