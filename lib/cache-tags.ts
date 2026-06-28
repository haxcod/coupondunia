/**
 * Cache-tag constants and helpers for DealSpark.
 *
 * These tags are attached to `use cache` data loaders via `cacheTag(...)` and
 * invalidated by admin mutations via `revalidateTag(...)` (Next.js 16 Cache
 * Components, `cacheComponents: true`). Centralising the tag vocabulary here
 * keeps the names that loaders apply and the names that mutations purge
 * provably in sync.
 *
 * Requirements: 25.8 (300s/600s ISR windows + on-demand revalidation by tag).
 *
 * Tag conventions (aligned with `next/cache` `cacheTag` limits — each tag must
 * be at most 256 characters):
 *   - Collection tags are stable string literals: `products`, `deals`,
 *     `categories`, `banners`, `homepage`, `settings`.
 *   - Entity tags are namespaced `"{collection-singular}:{slug}"`, e.g.
 *     `product:nike-air-max`, `deal:flipkart-big-billion`,
 *     `category:electronics`.
 */

/** Maximum length of a single cache tag accepted by `next/cache`. */
export const MAX_CACHE_TAG_LENGTH = 256;

/**
 * Stable, collection-level cache tags. A loader that reads a whole collection
 * (e.g. the homepage product grid) tags itself with the collection tag so a
 * mutation to any member can invalidate it.
 */
export const CACHE_TAGS = {
  products: 'products',
  deals: 'deals',
  categories: 'categories',
  banners: 'banners',
  homepage: 'homepage',
  settings: 'settings',
} as const;

/** Union of the stable collection tag string literals. */
export type CollectionCacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Namespace prefixes used to build per-entity tags. */
const ENTITY_TAG_PREFIX = {
  product: 'product',
  deal: 'deal',
  category: 'category',
} as const;

/**
 * Build a per-entity cache tag of the form `"{prefix}:{slug}"`, throwing if the
 * slug is empty or the resulting tag would exceed the 256-character limit.
 */
function buildEntityTag(prefix: string, slug: string): string {
  const trimmed = slug.trim();
  if (trimmed.length === 0) {
    throw new Error(`Cannot build a "${prefix}" cache tag from an empty slug.`);
  }
  const tag = `${prefix}:${trimmed}`;
  if (tag.length > MAX_CACHE_TAG_LENGTH) {
    throw new Error(
      `Cache tag "${tag}" exceeds the ${MAX_CACHE_TAG_LENGTH}-character limit.`,
    );
  }
  return tag;
}

/** Tag for a single product page, e.g. `product:nike-air-max`. */
export function productTag(slug: string): string {
  return buildEntityTag(ENTITY_TAG_PREFIX.product, slug);
}

/** Tag for a single deal page, e.g. `deal:flipkart-big-billion`. */
export function dealTag(slug: string): string {
  return buildEntityTag(ENTITY_TAG_PREFIX.deal, slug);
}

/** Tag for a single category page, e.g. `category:electronics`. */
export function categoryTag(slug: string): string {
  return buildEntityTag(ENTITY_TAG_PREFIX.category, slug);
}

/**
 * Tags to revalidate after a product mutation: the specific product page, the
 * products collection, and the homepage (which surfaces featured/category-wise
 * products).
 */
export function productRevalidationTags(slug: string): string[] {
  return [productTag(slug), CACHE_TAGS.products, CACHE_TAGS.homepage];
}

/**
 * Tags to revalidate after a deal mutation: the specific deal page, the deals
 * collection, and the homepage ("Today's Best Coupons").
 */
export function dealRevalidationTags(slug: string): string[] {
  return [dealTag(slug), CACHE_TAGS.deals, CACHE_TAGS.homepage];
}

/**
 * Tags to revalidate after a category mutation: the specific category page, the
 * categories collection, and the homepage (category pill row / sections).
 */
export function categoryRevalidationTags(slug: string): string[] {
  return [categoryTag(slug), CACHE_TAGS.categories, CACHE_TAGS.homepage];
}

/** Tags to revalidate after a banner mutation: the banners collection and the homepage carousel. */
export function bannerRevalidationTags(): string[] {
  return [CACHE_TAGS.banners, CACHE_TAGS.homepage];
}

/** Tags to revalidate after a settings mutation: settings plus the homepage that reflects them. */
export function settingsRevalidationTags(): string[] {
  return [CACHE_TAGS.settings, CACHE_TAGS.homepage];
}
