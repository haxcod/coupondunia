import { describe, it, expect } from 'vitest';
import {
  CACHE_TAGS,
  MAX_CACHE_TAG_LENGTH,
  productTag,
  dealTag,
  categoryTag,
  productRevalidationTags,
  dealRevalidationTags,
  categoryRevalidationTags,
  bannerRevalidationTags,
  settingsRevalidationTags,
} from './cache-tags';

describe('collection cache tags', () => {
  it('exposes the stable collection tag literals from the design', () => {
    expect(CACHE_TAGS).toEqual({
      products: 'products',
      deals: 'deals',
      categories: 'categories',
      banners: 'banners',
      homepage: 'homepage',
      settings: 'settings',
    });
  });
});

describe('entity tag builders', () => {
  it('namespaces each entity tag as "{prefix}:{slug}"', () => {
    expect(productTag('nike-air-max')).toBe('product:nike-air-max');
    expect(dealTag('flipkart-big-billion')).toBe('deal:flipkart-big-billion');
    expect(categoryTag('electronics')).toBe('category:electronics');
  });

  it('trims surrounding whitespace from the slug', () => {
    expect(productTag('  shoes  ')).toBe('product:shoes');
  });

  it('rejects empty or whitespace-only slugs', () => {
    expect(() => productTag('')).toThrow();
    expect(() => dealTag('   ')).toThrow();
    expect(() => categoryTag('\t')).toThrow();
  });

  it('rejects slugs that would exceed the 256-character tag limit', () => {
    const tooLong = 'a'.repeat(MAX_CACHE_TAG_LENGTH);
    expect(() => productTag(tooLong)).toThrow();
  });

  it('accepts a slug that fits exactly within the tag limit', () => {
    // "product:" prefix is 8 chars, so the slug can be MAX - 8 chars.
    const slug = 'a'.repeat(MAX_CACHE_TAG_LENGTH - 'product:'.length);
    const tag = productTag(slug);
    expect(tag.length).toBe(MAX_CACHE_TAG_LENGTH);
  });
});

describe('revalidation tag groupings', () => {
  it('includes the entity, collection, and homepage tags for products', () => {
    expect(productRevalidationTags('nike-air-max')).toEqual([
      'product:nike-air-max',
      CACHE_TAGS.products,
      CACHE_TAGS.homepage,
    ]);
  });

  it('includes the entity, collection, and homepage tags for deals', () => {
    expect(dealRevalidationTags('flipkart-big-billion')).toEqual([
      'deal:flipkart-big-billion',
      CACHE_TAGS.deals,
      CACHE_TAGS.homepage,
    ]);
  });

  it('includes the entity, collection, and homepage tags for categories', () => {
    expect(categoryRevalidationTags('electronics')).toEqual([
      'category:electronics',
      CACHE_TAGS.categories,
      CACHE_TAGS.homepage,
    ]);
  });

  it('invalidates banners and the homepage carousel after a banner mutation', () => {
    expect(bannerRevalidationTags()).toEqual([
      CACHE_TAGS.banners,
      CACHE_TAGS.homepage,
    ]);
  });

  it('invalidates settings and the homepage after a settings mutation', () => {
    expect(settingsRevalidationTags()).toEqual([
      CACHE_TAGS.settings,
      CACHE_TAGS.homepage,
    ]);
  });
});
