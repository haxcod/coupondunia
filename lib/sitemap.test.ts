// Feature: dealspark, Property 24: Sitemap completeness and 50,000-URL partitioning
//
// Property 24: Sitemap completeness and 50,000-URL partitioning
// "For any catalog, the set of URLs emitted by the sitemap equals the set of
//  absolute canonical URLs of exactly the active categories, products, and deals
//  (excluding every inactive, deleted, or unpublished entry); and when the active
//  count exceeds 50,000, the entries are partitioned across files of at most
//  50,000 URLs each whose union equals the full active URL set, referenced from a
//  sitemap index."
//
// Validates: Requirements 24.2, 24.3
//
// This is a PURE-LOGIC property: it exercises the side-effect-free helpers in
// `lib/sitemap.ts` (`buildSitemapEntries`, `sitemapPartitionCount`,
// `selectSitemapPartition`, the per-entity URL builders, and `SITEMAP_URL_LIMIT`)
// without any database or Next.js runtime. The DB loaders are responsible for
// supplying ONLY active records, so the `ActiveSitemapData` fed to
// `buildSitemapEntries` already represents the active set; completeness here
// means "exactly one absolute canonical entry per supplied record, in order".
// Partitioning is exercised with a small `limit` override so the union/coverage
// invariants can be checked without materialising 50,000 items.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ActiveSitemapData,
  SitemapRecord,
  SITEMAP_URL_LIMIT,
  buildSitemapEntries,
  categorySitemapUrl,
  productSitemapUrl,
  dealSitemapUrl,
  normalizeBaseUrl,
  sitemapPartitionCount,
  selectSitemapPartition,
} from '@/lib/sitemap';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A URL-safe lowercase slug like `nike-air-max-90`. */
const slugArb = fc
  .array(fc.constantFrom('a', 'b', 'c', '1', '2', 'x', 'deal', 'nike', 'shoes', 'sale'), {
    minLength: 1,
    maxLength: 4,
  })
  .map((parts) => parts.join('-'));

/** A minimal active record: `{ slug, updatedAt }`. */
const recordArb: fc.Arbitrary<SitemapRecord> = fc.record({
  slug: slugArb,
  updatedAt: fc.date({ min: new Date('2000-01-01'), max: new Date('2035-12-31') }),
});

/** Active catalog data grouped by collection, each 0..20 records. */
const dataArb: fc.Arbitrary<ActiveSitemapData> = fc.record({
  categories: fc.array(recordArb, { maxLength: 20 }),
  products: fc.array(recordArb, { maxLength: 20 }),
  deals: fc.array(recordArb, { maxLength: 20 }),
});

/** A configured site origin, optionally with trailing slashes to normalise. */
const baseUrlArb = fc
  .tuple(
    fc.constantFrom(
      'https://dealspark.in',
      'https://www.example.com',
      'http://localhost:3000',
    ),
    fc.nat({ max: 3 }),
  )
  .map(([origin, slashes]) => normalizeBaseUrl(origin + '/'.repeat(slashes)));

// ---------------------------------------------------------------------------
// Property 24a — Completeness: one absolute canonical entry per active record
// ---------------------------------------------------------------------------

describe('Property 24: Sitemap completeness and 50,000-URL partitioning', () => {
  it('emits exactly one absolute canonical entry per active category, product, and deal', () => {
    fc.assert(
      fc.property(baseUrlArb, dataArb, (baseUrl, data) => {
        const entries = buildSitemapEntries(baseUrl, data);

        // The expected set of entries, in the documented stable order:
        // categories, then products, then deals.
        const expected = [
          ...data.categories.map((c) => ({
            url: categorySitemapUrl(baseUrl, c.slug),
            lastModified: c.updatedAt,
          })),
          ...data.products.map((p) => ({
            url: productSitemapUrl(baseUrl, p.slug),
            lastModified: p.updatedAt,
          })),
          ...data.deals.map((d) => ({
            url: dealSitemapUrl(baseUrl, d.slug),
            lastModified: d.updatedAt,
          })),
        ];

        const total = data.categories.length + data.products.length + data.deals.length;

        // Exactly one entry per supplied (active) record — no gaps, no extras.
        expect(entries.length).toBe(total);

        entries.forEach((entry, i) => {
          // Each emitted URL matches its record's canonical URL, in order.
          expect(entry.url).toBe(expected[i].url);
          expect(entry.lastModified).toBe(expected[i].lastModified);
          // Each URL is absolute (carries a scheme + host).
          expect(/^https?:\/\//.test(entry.url)).toBe(true);
          expect(entry.url.startsWith(`${baseUrl}/`)).toBe(true);
        });
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 24b — Partition count: 1 when total <= limit, else ceil(total/limit)
  // -------------------------------------------------------------------------

  it('requires one sitemap file at or below the limit and ceil(total/limit) above it', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 250_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        (total, limit) => {
          const count = sitemapPartitionCount(total, limit);

          // Always at least one file so `/sitemap.xml` resolves (even when empty).
          expect(count).toBeGreaterThanOrEqual(1);

          if (total <= limit) {
            expect(count).toBe(1);
          } else {
            expect(count).toBe(Math.ceil(total / limit));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applies the 50,000-URL limit by default when no override is supplied', () => {
    fc.assert(
      fc.property(fc.nat({ max: 250_000 }), (total) => {
        const count = sitemapPartitionCount(total);
        const expected = total <= SITEMAP_URL_LIMIT ? 1 : Math.ceil(total / SITEMAP_URL_LIMIT);
        expect(count).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 24c — Partitioning: the union of all partitions reconstructs the
  // full entry list exactly once, with each partition bounded by the limit.
  // -------------------------------------------------------------------------

  it('partitions entries into bounded, gap-free, duplicate-free files whose union is the whole set', () => {
    fc.assert(
      fc.property(
        // Abstract entries (their concrete shape is irrelevant to slicing) and a
        // small limit so multi-file partitioning is exercised without 50k items.
        fc.array(fc.integer(), { maxLength: 60 }),
        fc.integer({ min: 1, max: 12 }),
        (entries, limit) => {
          const count = sitemapPartitionCount(entries.length, limit);

          const reconstructed: number[] = [];
          for (let id = 0; id < count; id++) {
            const partition = selectSitemapPartition(entries, id, limit);
            // No sitemap file exceeds the per-file URL limit.
            expect(partition.length).toBeLessThanOrEqual(limit);
            reconstructed.push(...partition);
          }

          // The union of every partition reconstructs the full list exactly once,
          // preserving order — no gaps and no duplicates.
          expect(reconstructed).toEqual(entries);

          // The computed partition count is the minimum that covers every entry:
          // every entry index falls inside [0, count * limit).
          expect(count * limit).toBeGreaterThanOrEqual(entries.length);

          // Any id at or beyond the partition count addresses no entries.
          expect(selectSitemapPartition(entries, count, limit)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
