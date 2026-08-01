/**
 * Sitemap_Generator — data + pure logic backing `app/sitemap.ts` (Task 12.4).
 *
 * The sitemap lists the absolute canonical URL of **every active** Category,
 * Product, and Deal and excludes anything inactive, deleted, or unpublished
 * (Req 24.2). When the active count exceeds 50,000 URLs the entries are split
 * across multiple files of at most 50,000 URLs each, referenced from the
 * `/sitemap.xml` index that Next.js synthesises from `generateSitemaps`
 * (Req 24.3). If the catalog cannot be read, the loaders **throw** so Next.js
 * surfaces an error response rather than emitting a partial or empty 200
 * sitemap (Req 24.4).
 *
 * This module is split into three layers so the partitioning/URL logic can be
 * exercised by property tests (Task 12.5) without a database, and the DB read
 * can be exercised against the in-memory MongoDB harness:
 *
 *   1. **Pure helpers** — base-URL normalisation, per-entity URL builders,
 *      partition-count / partition-selection, and `buildSitemapEntries`. No
 *      database, no Next.js runtime.
 *   2. **Uncached DB loaders** — `loadActiveSitemapData` / `loadActiveSitemapEntries`
 *      / `countActiveSitemapUrls`. These read the active catalog and throw on
 *      failure (Req 24.4).
 *   3. **Cached wrappers** — `getActiveSitemapEntries` / `getActiveSitemapUrlCount`
 *      wrap the loaders in a Next.js 16 `use cache` boundary tagged with the
 *      catalog collection tags so a catalog mutation revalidates the sitemap.
 */
import { cacheLife, cacheTag } from 'next/cache';

import { connectToDatabase } from '@/lib/db';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { Category, Product, Deal } from '@/lib/models';

// =============================================================================
// SECTION 1 — Constants & types
// =============================================================================

/** Google's per-sitemap limit; a single file holds at most this many URLs (Req 24.3). */
export const SITEMAP_URL_LIMIT = 50_000;

/** A single `<url>` entry: an absolute canonical URL plus its last-modified date. */
export interface SitemapEntry {
  url: string;
  lastModified: Date;
}

/** The minimal active-record shape the sitemap needs to build a URL entry. */
export interface SitemapRecord {
  slug: string;
  updatedAt: Date;
}

/** Active categories/products/deals grouped by collection, in stable order. */
export interface ActiveSitemapData {
  categories: SitemapRecord[];
  products: SitemapRecord[];
  deals: SitemapRecord[];
}

// =============================================================================
// SECTION 2 — Pure helpers (no DB, no Next.js runtime) — testable by Property 24
// =============================================================================

/**
 * Normalise the configured site origin into a base URL with no trailing slash.
 * Throws when `NEXT_PUBLIC_SITE_URL` is unset/blank: without an origin we cannot
 * emit absolute canonical URLs, so erroring is preferable to a wrong sitemap.
 */
export function normalizeBaseUrl(raw: string | undefined | null): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not configured; cannot build absolute canonical sitemap URLs.',
    );
  }
  return raw.trim().replace(/\/+$/, '');
}

/** Resolve the site base URL from the environment (Req 24.2 absolute URLs). */
export function getSiteBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

/** Join an already-normalised base URL with an absolute path. */
export function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/** Canonical URL for a category detail page (`/category/[slug]`). */
export function categorySitemapUrl(baseUrl: string, slug: string): string {
  return joinUrl(baseUrl, `/category/${slug}`);
}

/** Canonical URL for a product detail page (`/product/[slug]`). */
export function productSitemapUrl(baseUrl: string, slug: string): string {
  return joinUrl(baseUrl, `/product/${slug}`);
}

/** Canonical URL for a deal detail page (`/deal/[slug]`). */
export function dealSitemapUrl(baseUrl: string, slug: string): string {
  return joinUrl(baseUrl, `/deal/${slug}`);
}

/**
 * Build the full, ordered list of sitemap entries for the active catalog.
 * Categories, then products, then deals — a stable concatenation so a given
 * partition id always maps to the same slice across `generateSitemaps` and the
 * `sitemap` calls.
 */
export function buildSitemapEntries(
  baseUrl: string,
  data: ActiveSitemapData,
): SitemapEntry[] {
  return [
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
}

/**
 * Number of sitemap files required for `total` URLs (Req 24.3): a single file
 * while `total <= 50,000`, otherwise `ceil(total / 50,000)` files. Always at
 * least one file so `/sitemap.xml` resolves even for an empty catalog.
 */
export function sitemapPartitionCount(
  total: number,
  limit = SITEMAP_URL_LIMIT,
): number {
  if (!Number.isFinite(total) || total <= limit) {
    return 1;
  }
  return Math.ceil(total / limit);
}

/**
 * The slice of `entries` belonging to sitemap partition `id` (0-based): the
 * window `[id * limit, id * limit + limit)`. Out-of-range ids yield an empty
 * slice. The union of all partitions reconstructs `entries` exactly once.
 */
export function selectSitemapPartition<T>(
  entries: readonly T[],
  id: number,
  limit = SITEMAP_URL_LIMIT,
): T[] {
  const start = id * limit;
  return entries.slice(start, start + limit);
}

// =============================================================================
// SECTION 3 — Uncached DB loaders (throw on failure — Req 24.4)
// =============================================================================

/** Project the active records of a collection to `{ slug, updatedAt }`, id-ordered. */
const SITEMAP_FIELDS = 'slug updatedAt';

/**
 * Read the active categories, products, and deals from MongoDB in a stable
 * (`_id` ascending) order. Excludes any record whose `status` is not `active`,
 * which covers inactive, unpublished/draft, and (hard-)deleted records (Req 24.2).
 *
 * Any read failure propagates to the caller; the route never converts it into a
 * partial or empty success response (Req 24.4).
 */
export async function loadActiveSitemapData(): Promise<ActiveSitemapData> {
  await connectToDatabase();
  const [categories, products, deals] = await Promise.all([
    Category.find({ status: 'active' })
      .select(SITEMAP_FIELDS)
      .sort({ _id: 1 })
      .lean<SitemapRecord[]>()
      .exec(),
    Product.find({ status: 'active' })
      .select(SITEMAP_FIELDS)
      .sort({ _id: 1 })
      .lean<SitemapRecord[]>()
      .exec(),
    Deal.find({ status: 'active' })
      .select(SITEMAP_FIELDS)
      .sort({ _id: 1 })
      .lean<SitemapRecord[]>()
      .exec(),
  ]);
  return { categories, products, deals };
}

/**
 * Build the full, ordered list of active-catalog sitemap entries (uncached).
 * Throws when the catalog cannot be read or the base URL is unconfigured.
 */
export async function loadActiveSitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getSiteBaseUrl();
  const data = await loadActiveSitemapData();
  return buildSitemapEntries(baseUrl, data);
}

/**
 * Total number of active URLs (categories + products + deals) without
 * materialising every record — used by `generateSitemaps` to decide how many
 * sitemap files to emit. Throws on read failure (Req 24.4).
 */
export async function countActiveSitemapUrls(): Promise<number> {
  await connectToDatabase();
  const [categoryCount, productCount, dealCount] = await Promise.all([
    Category.countDocuments({ status: 'active' }).exec(),
    Product.countDocuments({ status: 'active' }).exec(),
    Deal.countDocuments({ status: 'active' }).exec(),
  ]);
  return categoryCount + productCount + dealCount;
}

// =============================================================================
// SECTION 4 — Cached wrappers (use cache + catalog tags)
// =============================================================================

/**
 * Cached list of active sitemap entries. Tagged with the catalog collection
 * tags so a category/product/deal mutation invalidates the sitemap on demand
 * (Req 25.8); otherwise refreshed on the `hours` cache-life window.
 */
export async function getActiveSitemapEntries(): Promise<SitemapEntry[]> {
  'use cache';
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.products, CACHE_TAGS.deals);
  cacheLife('hours');
  return loadActiveSitemapEntries();
}

/** Cached count of active sitemap URLs (same tags/lifetime as the entries loader). */
export async function getActiveSitemapUrlCount(): Promise<number> {
  'use cache';
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.products, CACHE_TAGS.deals);
  cacheLife('hours');
  return countActiveSitemapUrls();
}
