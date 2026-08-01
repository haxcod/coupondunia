// Feature: dealspark, Property 26: JSON-LD presence and safe round-trip
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildProductJsonLd,
  buildOfferJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbListJsonLd,
  stringifyJsonLd,
  type JsonLd,
} from '@/lib/seo';

/**
 * Property 26: JSON-LD presence and safe round-trip
 *
 * For any homepage, category, product, or deal page, the structured data
 * emitted by the JSON-LD builders carries the correct `@context`/`@type` plus
 * its required fields, and the XSS-safe serialiser `stringifyJsonLd` escapes
 * `<` → `\u003c`, `>` → `\u003e`, `&` → `\u0026` (plus the JSON line/paragraph
 * separators) so the output contains no raw `<` or `>` and can never break out
 * of a `<script>` element — even when inputs contain `</script>`, markup, or
 * lone ampersands. Because every escape is a valid JSON unicode escape,
 * `JSON.parse(stringifyJsonLd(obj))` deep-equals the original object.
 *
 * Validates: Requirements 24.9
 */

const SCHEMA_CONTEXT = 'https://schema.org';
const NUM_RUNS = 100;

// A pool of hostile fragments that must survive serialisation without being
// able to terminate or escape a <script> element.
const HOSTILE_FRAGMENTS = [
  '</script>',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<!-- comment -->',
  '&',
  '&amp;',
  '&lt;&gt;',
  '"></script><script>',
  'A\u2028B', // line separator (valid JSON, illegal in JS string literal)
  'C\u2029D', // paragraph separator
  '\u2028\u2029',
  '</SCRIPT >',
];

/** Strings that mix ordinary text, unicode, and hostile markup fragments. */
const hostileString = (): fc.Arbitrary<string> =>
  fc
    .array(
      fc.oneof(
        fc.constantFrom(...HOSTILE_FRAGMENTS),
        fc.string(),
        fc.string({ unit: 'binary' }),
      ),
      { minLength: 0, maxLength: 4 },
    )
    .map((parts) => parts.join(''));

/** A non-empty hostile string (for required text fields). */
const hostileNonEmpty = (): fc.Arbitrary<string> =>
  hostileString().map((s) => (s.length > 0 ? s : '</script>fallback'));

/** A site-relative path that may carry a `page` query param and markup. */
const pathArb = (): fc.Arbitrary<string> =>
  fc.tuple(hostileString(), fc.option(fc.integer({ min: 1, max: 50 }), { nil: null })).map(
    ([seg, page]) => {
      const slug = encodeURIComponent(seg).slice(0, 40) || 'item';
      const base = `/p/${slug}`;
      return page === null ? base : `${base}?page=${page}`;
    },
  );

const baseUrlArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('https://www.dealspark.in', 'https://example.test', 'https://cdn.shop.io');

const imageUrlArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    '/images/a.jpg',
    '/img/b.png?v=2',
    'https://cdn.example.com/c.webp',
    '/x.jpg',
  );

/**
 * Assert the universal serialiser invariants on a structured-data object:
 *   - no raw `<` or `>` in the output (cannot break out of <script>)
 *   - no raw U+2028 / U+2029 (illegal in a JS string literal)
 *   - JSON.parse round-trips to a value deep-equal to the original
 */
function assertSafeRoundTrip(obj: JsonLd): void {
  const serialized = stringifyJsonLd(obj);

  // Cannot terminate or inject into the <script> element.
  expect(serialized).not.toMatch(/[<>]/);
  // A literal `</script>` in the input is neutralised.
  expect(serialized.toLowerCase()).not.toContain('</script>');
  // JSON line/paragraph separators are escaped.
  expect(serialized).not.toMatch(/[\u2028\u2029]/);

  // Safe round-trip: parsing the emitted payload yields the original object.
  expect(JSON.parse(serialized)).toEqual(obj);
}

describe('stringifyJsonLd — Property 26: XSS-safe escaping and round-trip', () => {
  it('escapes < > & and round-trips arbitrary nested structured data', () => {
    // An arbitrary JSON-LD-shaped object built from hostile strings.
    const valueArb: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
      value: fc.oneof(
        { depthSize: 'small' },
        hostileString(),
        fc.integer(),
        fc.boolean(),
        fc.array(tie('value'), { maxLength: 4 }),
        fc.dictionary(hostileNonEmpty(), tie('value'), { maxKeys: 4 }),
      ),
    })).value;

    const objArb = fc.dictionary(hostileNonEmpty(), valueArb, { maxKeys: 6 }).map(
      (props): JsonLd => ({ '@context': SCHEMA_CONTEXT, '@type': 'Thing', ...props }),
    );

    fc.assert(
      fc.property(objArb, (obj) => {
        const serialized = stringifyJsonLd(obj);
        expect(serialized).not.toContain('<');
        expect(serialized).not.toContain('>');
        // The raw control characters never survive in the output.
        expect(serialized).not.toMatch(/[\u2028\u2029]/);
        expect(JSON.parse(serialized)).toEqual(obj);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('buildProductJsonLd — Property 26: presence and safe round-trip', () => {
  it('emits Product @context/@type with required fields and round-trips safely', () => {
    const inputArb = fc.record({
      path: pathArb(),
      title: hostileNonEmpty(),
      description: hostileString(),
      storeName: hostileNonEmpty(),
      currentPrice: fc.integer({ min: 0, max: 99_999_999_99 }),
      primaryImageUrl: imageUrlArb(),
      additionalImages: fc.array(imageUrlArb(), { maxLength: 3 }),
      inStock: fc.boolean(),
      baseUrl: baseUrlArb(),
    });

    fc.assert(
      fc.property(inputArb, (input) => {
        const obj = buildProductJsonLd(input);

        expect(obj['@context']).toBe(SCHEMA_CONTEXT);
        expect(obj['@type']).toBe('Product');
        expect(obj.name).toBe(input.title);
        expect(obj.description).toBe(input.description);
        expect(Array.isArray(obj.image)).toBe(true);
        expect(obj.brand).toEqual({ '@type': 'Brand', name: input.storeName });

        const offers = obj.offers as Record<string, unknown>;
        expect(offers['@type']).toBe('Offer');
        expect(offers.priceCurrency).toBe('INR');
        expect(typeof offers.price).toBe('string');
        expect(offers.availability).toBe(
          `${SCHEMA_CONTEXT}/${input.inStock ? 'InStock' : 'OutOfStock'}`,
        );

        assertSafeRoundTrip(obj);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('buildOfferJsonLd — Property 26: presence and safe round-trip', () => {
  it('emits Offer @context/@type with required fields and round-trips safely', () => {
    const dateArb = fc.option(
      fc.date({
        min: new Date('2000-01-01'),
        max: new Date('2100-01-01'),
        noInvalidDate: true,
      }),
      { nil: null },
    );
    const inputArb = fc.record({
      path: pathArb(),
      headline: hostileNonEmpty(),
      storeName: hostileNonEmpty(),
      description: fc.option(hostileString(), { nil: null }),
      validFrom: dateArb,
      validUntil: dateArb,
      baseUrl: baseUrlArb(),
    });

    fc.assert(
      fc.property(inputArb, (input) => {
        const obj = buildOfferJsonLd(input);

        expect(obj['@context']).toBe(SCHEMA_CONTEXT);
        expect(obj['@type']).toBe('Offer');
        expect(obj.name).toBe(input.headline);
        expect(typeof obj.url).toBe('string');
        expect(obj.seller).toEqual({ '@type': 'Organization', name: input.storeName });

        if (input.validFrom) {
          expect(obj.availabilityStarts).toBe(input.validFrom.toISOString());
        }
        if (input.validUntil) {
          expect(obj.validThrough).toBe(input.validUntil.toISOString());
        }

        assertSafeRoundTrip(obj);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('buildWebSiteJsonLd — Property 26: presence and safe round-trip', () => {
  it('emits WebSite + SearchAction with required fields and round-trips safely', () => {
    const inputArb = fc.record({
      siteName: hostileNonEmpty(),
      searchPath: fc.option(fc.constantFrom('/search', '/find', '/s'), { nil: undefined }),
      baseUrl: baseUrlArb(),
    });

    fc.assert(
      fc.property(inputArb, (input) => {
        const obj = buildWebSiteJsonLd(input);

        expect(obj['@context']).toBe(SCHEMA_CONTEXT);
        expect(obj['@type']).toBe('WebSite');
        expect(obj.name).toBe(input.siteName);
        expect(typeof obj.url).toBe('string');

        const action = obj.potentialAction as Record<string, unknown>;
        expect(action['@type']).toBe('SearchAction');
        expect(action['query-input']).toBe('required name=search_term_string');
        const entry = action.target as Record<string, unknown>;
        expect(entry['@type']).toBe('EntryPoint');
        expect(String(entry.urlTemplate)).toContain('{search_term_string}');

        assertSafeRoundTrip(obj);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('buildBreadcrumbListJsonLd — Property 26: presence and safe round-trip', () => {
  it('emits BreadcrumbList with 1-based positions and round-trips safely', () => {
    const itemsArb = fc.array(
      fc.record({ name: hostileNonEmpty(), path: pathArb() }),
      { minLength: 1, maxLength: 6 },
    );

    fc.assert(
      fc.property(itemsArb, baseUrlArb(), (items, baseUrl) => {
        const obj = buildBreadcrumbListJsonLd(items, baseUrl);

        expect(obj['@context']).toBe(SCHEMA_CONTEXT);
        expect(obj['@type']).toBe('BreadcrumbList');

        const list = obj.itemListElement as Array<Record<string, unknown>>;
        expect(list).toHaveLength(items.length);
        list.forEach((el, index) => {
          expect(el['@type']).toBe('ListItem');
          expect(el.position).toBe(index + 1);
          expect(el.name).toBe(items[index].name);
          expect(typeof el.item).toBe('string');
        });

        assertSafeRoundTrip(obj);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
