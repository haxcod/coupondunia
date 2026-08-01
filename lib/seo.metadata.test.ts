// Feature: dealspark, Property 25: Per-page SEO invariants
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildMetadata,
  buildCanonicalUrl,
  toAbsoluteUrl,
  contentAlt,
  DECORATIVE_ALT,
  MAX_ALT_LENGTH,
  getSiteBaseUrl,
  DEFAULT_OG_IMAGE_PATH,
  type BuildMetadataOptions,
} from '@/lib/seo';

/**
 * Property 25: Per-page SEO invariants
 *
 * For any public page, the metadata builders guarantee:
 *   - exactly one canonical URL that is always ABSOLUTE (Req 24.6);
 *   - paginated paths (carrying `?page=N`) collapse the canonical to the first
 *     page (the canonical never contains a `page` query param) (Req 24.11);
 *   - Open Graph title/description/url and images[0].url are all non-empty, and
 *     the image falls back to the designated default when none is supplied
 *     (Req 24.7 / 24.8);
 *   - the canonical URL and the OG url match;
 *   - the emitted url fields are always public page URLs on the configured
 *     site origin — never an affiliate/destination URL (Req 24.1);
 *   - `contentAlt` produces a non-empty alt of 1–125 characters for content
 *     images, while `DECORATIVE_ALT` is empty (Req 24.10).
 *
 * Validates: Requirements 24.6, 24.7, 24.8, 24.10, 24.11, 24.1
 */

const NUM_RUNS = 100;

/** A fixed, known site origin so we can assert URLs are public + absolute. */
const BASE_URL = 'https://www.dealspark.in';

/** An absolute URL is well-formed and parses to a real origin. */
function isAbsoluteUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Arbitrary text that may contain leading/trailing whitespace, unicode, and
 * occasionally be blank — exercising the trim / fallback paths.
 */
const looseText = () => fc.string({ maxLength: 200 });
const nonBlankText = () =>
  fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

/** A site-relative public path, optionally carrying a `page` query param. */
const pagePathArb = () =>
  fc
    .tuple(
      fc.constantFrom(
        '/',
        '/deals',
        '/categories',
        '/category/electronics',
        '/product/nike-air-max-flipkart',
        '/deal/big-billion-flipkart',
        '/search',
      ),
      fc.option(fc.integer({ min: 1, max: 9999 }), { nil: undefined }),
    )
    .map(([path, page]) => (page === undefined ? path : `${path}?page=${page}`));

/** Optional OG image: sometimes a relative path, sometimes absolute, sometimes absent. */
const imageArb = () =>
  fc.option(
    fc.oneof(
      fc.constantFrom('/images/product.jpg', '/og/custom.png'),
      fc.constantFrom('https://cdn.dealspark.in/a.jpg', 'http://img.example.com/b.png'),
      fc.constant(''),
      fc.constant('   '),
    ),
    { nil: undefined },
  );

const metadataOptionsArb = (): fc.Arbitrary<BuildMetadataOptions> =>
  fc.record({
    title: nonBlankText(),
    description: looseText(),
    path: pagePathArb(),
    imageUrl: imageArb(),
    siteName: fc.option(nonBlankText(), { nil: undefined }),
    ogType: fc.option(fc.constantFrom('website' as const, 'article' as const), {
      nil: undefined,
    }),
    baseUrl: fc.constant(BASE_URL),
  });

describe('buildMetadata — Property 25: Per-page SEO invariants', () => {
  it('emits exactly one absolute canonical, non-empty OG tags, default image fallback, and public URLs only', () => {
    fc.assert(
      fc.property(metadataOptionsArb(), (options) => {
        const meta = buildMetadata(options);

        // --- Exactly one canonical, always ABSOLUTE (Req 24.6) ---
        const canonical = meta.alternates?.canonical;
        expect(typeof canonical).toBe('string');
        const canonicalStr = canonical as string;
        expect(isAbsoluteUrl(canonicalStr)).toBe(true);
        // Canonical must live on the configured public origin (Req 24.1: only
        // public page URLs, never an affiliate/destination URL).
        expect(new URL(canonicalStr).origin).toBe(BASE_URL);

        // --- Paginated paths collapse canonical to first page (Req 24.11) ---
        const canonicalUrl = new URL(canonicalStr);
        expect(canonicalUrl.searchParams.has('page')).toBe(false);
        // The canonical equals the absolute URL of the first page (page param
        // stripped from the original path).
        const firstPagePath = options.path.replace(/([?&])page=\d+/g, '$1').replace(/[?&]$/, '');
        expect(canonicalStr).toBe(buildCanonicalUrl(firstPagePath, BASE_URL));

        // --- OG tags each non-empty (Req 24.7) ---
        const og = meta.openGraph;
        expect(og).toBeDefined();
        const ogTitle = og?.title as string;
        const ogDescription = og?.description as string;
        const ogUrl = og?.url as string;
        expect(typeof ogTitle).toBe('string');
        expect(ogTitle.length).toBeGreaterThan(0);
        expect(typeof ogDescription).toBe('string');
        expect(ogDescription.length).toBeGreaterThan(0);
        expect(typeof ogUrl).toBe('string');
        expect((ogUrl as string).length).toBeGreaterThan(0);

        // --- Canonical and OG url match ---
        expect(String(ogUrl)).toBe(canonicalStr);

        // --- OG image present, absolute, non-empty, with default fallback (Req 24.8) ---
        const images = og?.images as ReadonlyArray<{ url: string }> | undefined;
        expect(Array.isArray(images)).toBe(true);
        expect(images!.length).toBeGreaterThan(0);
        const imageUrl = images![0].url;
        expect(typeof imageUrl).toBe('string');
        expect(imageUrl.length).toBeGreaterThan(0);
        expect(isAbsoluteUrl(imageUrl)).toBe(true);

        // When no usable image was supplied, the default site image is used.
        const suppliedImage =
          typeof options.imageUrl === 'string' && options.imageUrl.trim().length > 0
            ? options.imageUrl.trim()
            : null;
        if (suppliedImage === null) {
          expect(imageUrl).toBe(toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH, BASE_URL));
        } else {
          expect(imageUrl).toBe(toAbsoluteUrl(suppliedImage, BASE_URL));
        }

        // --- No affiliate/destination URL ever emitted (Req 24.1) ---
        // Every URL field stays on the public origin (or an explicit https/http
        // image CDN the caller provided) — there is no opaque redirect param.
        for (const u of [canonicalStr, String(ogUrl)]) {
          expect(new URL(u).origin).toBe(BASE_URL);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('keeps the canonical stable across every page of a paginated set (Req 24.11)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/deals', '/categories', '/category/electronics', '/search'),
        fc.integer({ min: 1, max: 9999 }),
        fc.integer({ min: 1, max: 9999 }),
        (basePath, pageA, pageB) => {
          const first = buildMetadata({
            title: 'Listing',
            description: 'desc',
            path: basePath,
            baseUrl: BASE_URL,
          });
          const a = buildMetadata({
            title: 'Listing',
            description: 'desc',
            path: `${basePath}?page=${pageA}`,
            baseUrl: BASE_URL,
          });
          const b = buildMetadata({
            title: 'Listing',
            description: 'desc',
            path: `${basePath}?page=${pageB}`,
            baseUrl: BASE_URL,
          });
          // Every page in the set shares the first page's canonical.
          expect(a.alternates?.canonical).toBe(first.alternates?.canonical);
          expect(b.alternates?.canonical).toBe(first.alternates?.canonical);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('contentAlt / DECORATIVE_ALT — Property 25: alt-text invariants (Req 24.10)', () => {
  it('produces a non-empty 1–125 char alt for content images, regardless of input', () => {
    fc.assert(
      fc.property(looseText(), looseText(), (subject, fallback) => {
        // contentAlt requires a non-empty fallback default; pass through both
        // generated values (which may be blank) to exercise the fallback chain.
        const alt =
          fallback.trim().length > 0 ? contentAlt(subject, fallback) : contentAlt(subject);
        expect(typeof alt).toBe('string');
        expect(alt.length).toBeGreaterThanOrEqual(1);
        expect(alt.length).toBeLessThanOrEqual(MAX_ALT_LENGTH);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('emits an empty alt for purely decorative images', () => {
    expect(DECORATIVE_ALT).toBe('');
    expect(MAX_ALT_LENGTH).toBe(125);
  });
});

describe('getSiteBaseUrl — Property 25: site origin is absolute', () => {
  it('returns an absolute origin', () => {
    expect(isAbsoluteUrl(getSiteBaseUrl())).toBe(true);
  });
});
