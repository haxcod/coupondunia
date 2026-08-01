// @vitest-environment node
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
// LAYER 2 of 2 — rendered markup.
// ---------------------------------------------------------------------------
// The projection layer (`lib/affiliate-url-absence.test.ts`) proves the real
// public DTOs drop the affiliate/destination URL. This layer proves the server
// components that consume those DTOs — `ProductCard` and `CouponCard` — never
// reintroduce a redirect URL into their static HTML.
//
// For each generated card we associate a distinctive affiliate/destination URL
// token with the *source* record and build the card's DTO from it exactly as
// the catalog projection does (the URL is dropped; only the `hasAffiliateUrl`
// boolean survives). We then render the card with `renderToStaticMarkup` and
// assert:
//   1. the distinctive token never appears in the HTML, and
//   2. every anchor `href` is an internal `/product/[slug]` or `/deal/[slug]`
//      route — never an external redirect URL (image `src` hosts are allowed).
//
// `renderToStaticMarkup` needs no DOM, so this file runs in the node
// environment. `next/image` / `next/link` are stubbed to the minimal markup the
// cards rely on, matching the approach used by the existing component tests.

import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, loading, fill, sizes, onError, ...rest }: any) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      src={typeof src === 'string' ? src : ''}
      alt={alt}
      loading={loading}
      {...rest}
    />
  ),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

import { ProductCard } from '@/components/ProductCard';
import { CouponCard } from '@/components/CouponCard';
import type { ProductCardDTO, DealCardDTO } from '@/lib/catalog';
import type { DealType } from '@/lib/models';

const NUM_RUNS = 100;

const DEAL_TYPES: readonly DealType[] = [
  'coupon_code',
  'direct_deal',
  'bank_card',
  'cashback',
];

/** A distinctive, unambiguous affiliate/destination URL token. */
const HEX_DIGITS = '0123456789abcdef'.split('');
const tokenArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...HEX_DIGITS), { minLength: 10, maxLength: 24 })
  .map((digits) => `https://affiliate.example/REDIR-${digits.join('')}`);

/** Slug-shaped string so the rendered internal href is well-formed. */
const slugArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom('summer', 'sale', 'mega', 'deal', 'gold', '2026'), {
    minLength: 1,
    maxLength: 4,
  })
  .map((parts) => parts.join('-'));

/** Image/logo hosts deliberately differ from the affiliate-token host. */
const imageUrlArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...HEX_DIGITS), { minLength: 4, maxLength: 10 })
  .map((digits) => `https://cdn.example.com/img-${digits.join('')}.jpg`);

/**
 * Build a ProductCardDTO from a source record that carries `affiliateUrl`. The
 * projection drops the URL and keeps only the boolean presence flag — exactly
 * the contract enforced by `lib/catalog`'s `toProductCard`.
 */
const productCaseArb = fc.record({
  affiliateUrl: tokenArb,
  title: fc.string({ minLength: 1, maxLength: 80 }),
  slug: slugArb,
  storeName: fc.string({ maxLength: 40 }),
  storeLogoUrl: fc.option(imageUrlArb, { nil: null }),
  currentPrice: fc.integer({ min: 1, max: 99_999_900 }),
  originalPrice: fc.option(fc.integer({ min: 1, max: 99_999_900 }), { nil: null }),
  discountPercent: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  primaryImageUrl: imageUrlArb,
});

const dealCaseArb = fc.record({
  destinationUrl: tokenArb,
  headline: fc.string({ minLength: 1, maxLength: 80 }),
  slug: slugArb,
  storeName: fc.string({ maxLength: 40 }),
  storeLogoUrl: fc.option(imageUrlArb, { nil: null }),
  dealType: fc.constantFrom(...DEAL_TYPES),
  couponCode: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  discountValue: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  validUntil: fc.option(
    fc.integer({ min: 0, max: 4_102_444_800_000 }).map((ms) => new Date(ms)),
    { nil: null },
  ),
});

/** Extract every `href="..."` value from rendered HTML. */
function anchorHrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

describe('Property 11 (markup layer): rendered cards never contain the redirect URL', () => {
  it('ProductCard static HTML excludes the affiliate URL and links only internally', () => {
    fc.assert(
      fc.property(productCaseArb, (source) => {
        // Project to the public DTO: the affiliate URL is dropped.
        const dto: ProductCardDTO = {
          id: 'p1',
          title: source.title,
          slug: source.slug,
          storeName: source.storeName,
          storeLogoUrl: source.storeLogoUrl,
          currentPrice: source.currentPrice,
          originalPrice: source.originalPrice,
          discountPercent: source.discountPercent,
          primaryImageUrl: source.primaryImageUrl,
          hasAffiliateUrl: source.affiliateUrl.length > 0,
        };

        const html = renderToStaticMarkup(<ProductCard product={dto} />);

        // (1) The distinctive affiliate token never appears.
        expect(html).not.toContain(source.affiliateUrl);

        // (2) Every anchor points at the internal product route.
        for (const href of anchorHrefs(html)) {
          expect(href).toBe(`/product/${source.slug}`);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('CouponCard static HTML excludes the destination URL and links only internally', () => {
    fc.assert(
      fc.property(dealCaseArb, (source) => {
        const dto: DealCardDTO = {
          id: 'd1',
          headline: source.headline,
          slug: source.slug,
          storeName: source.storeName,
          storeLogoUrl: source.storeLogoUrl,
          dealType: source.dealType,
          couponCode: source.couponCode,
          discountValue: source.discountValue,
          validUntil: source.validUntil,
        };

        const html = renderToStaticMarkup(<CouponCard deal={dto} />);

        // (1) The distinctive destination token never appears.
        expect(html).not.toContain(source.destinationUrl);

        // (2) Every anchor points at the internal deal route.
        for (const href of anchorHrefs(html)) {
          expect(href).toBe(`/deal/${source.slug}`);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
