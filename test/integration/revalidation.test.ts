/**
 * Integration tests — admin mutation → `revalidateTag` → public read reflects
 * the change (Task 16.2; Req 25.8, 25.9).
 *
 * ## What this exercises (and why this shape)
 *
 * A faithful end-to-end ISR assertion ("observe `x-nextjs-cache` flip from
 * STALE→HIT for the 300s/600s windows, and serve-last-good on regeneration
 * failure") requires a running Next.js server with the route cache live. The
 * vitest harness has no HTTP server — it drives the building blocks directly
 * against an in-memory MongoDB replica set — so a live `x-nextjs-cache`
 * observation is not feasible here. Instead we assert the *contract that
 * guarantees* the behaviour:
 *
 *   1. An admin mutation (create/update via `lib/catalog`) commits to the DB.
 *   2. The public, case-sensitive resolver reads the change back (Req 25.9 — the
 *      regenerated page reflects the new content). The resolvers are uncached
 *      data reads, so this is the exact data the regenerated RSC payload uses.
 *   3. The mutation invalidates the correct cache tags via `revalidateTag(...)`
 *      (Req 25.8 — on-demand revalidation by tag), which is what makes the
 *      public page refresh *immediately* rather than only after the time window.
 *
 * `next/cache` only has meaning inside the Next runtime, so its primitives are
 * mocked to spies (mirroring `lib/settings.test.ts`); the DB behaviour is real.
 *
 * The live 300s/600s window + serve-last-good guarantees themselves are
 * documented and config-asserted in `config-and-ssr.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheTag = vi.fn();
const cacheLife = vi.fn();
const revalidateTag = vi.fn();

vi.mock('next/cache', () => ({
  cacheTag: (...args: unknown[]) => cacheTag(...args),
  cacheLife: (...args: unknown[]) => cacheLife(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}));

import { Types } from 'mongoose';

import {
  createCategory,
  createDeal,
  createProduct,
  updateCategory,
  updateDeal,
  updateProduct,
  resolveActiveCategory,
  resolveActiveDeal,
  resolveActiveProduct,
} from '@/lib/catalog';
import { categorySchema, dealSchema, productSchema } from '@/lib/validation';
import {
  CACHE_TAGS,
  categoryTag,
  dealTag,
  productTag,
} from '@/lib/cache-tags';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  revalidateTag.mockClear();
});

/** The tag names passed to every `revalidateTag` call so far. */
function revalidatedTags(): string[] {
  return revalidateTag.mock.calls.map((call) => String(call[0]));
}

describe('Category mutation → revalidate → public reflects change (Req 25.8, 25.9)', () => {
  it('creates a category, reads it back publicly, and revalidates its tags', async () => {
    const created = await createCategory(
      categorySchema.parse({ name: 'Electronics', status: 'active' }),
    );

    // Public read reflects the newly created entity.
    const publicRead = await resolveActiveCategory(created.slug);
    expect(publicRead).not.toBeNull();
    expect(publicRead?.name).toBe('Electronics');

    // On-demand revalidation purged the entity + collection + homepage tags.
    const tags = revalidatedTags();
    expect(tags).toContain(categoryTag(created.slug));
    expect(tags).toContain(CACHE_TAGS.categories);
    expect(tags).toContain(CACHE_TAGS.homepage);
  });

  it('updates a category and the public read reflects the new name', async () => {
    const created = await createCategory(
      categorySchema.parse({ name: 'Gadgets', status: 'active' }),
    );
    revalidateTag.mockClear();

    const updated = await updateCategory(
      created.id,
      categorySchema.parse({ name: 'Cool Gadgets', status: 'active' }),
    );

    const publicRead = await resolveActiveCategory(updated.slug);
    expect(publicRead?.name).toBe('Cool Gadgets');

    // The updated slug's tag is revalidated so the public page refreshes now.
    expect(revalidatedTags()).toContain(categoryTag(updated.slug));
    expect(revalidatedTags()).toContain(CACHE_TAGS.categories);
  });
});

describe('Product mutation → revalidate → public reflects change (Req 25.8, 25.9)', () => {
  it('creates a product, reads it back publicly, and revalidates its tags', async () => {
    const categoryId = new Types.ObjectId().toString();
    const created = await createProduct(
      productSchema.parse({
        title: 'Noise Buds',
        store: 'Acme',
        categoryId,
        currentPrice: 199.0,
        primaryImageUrl: 'https://cdn.example.test/p.jpg',
        affiliateUrl: 'https://example.test/go',
        status: 'active',
      }),
    );

    const publicRead = await resolveActiveProduct(created.slug);
    expect(publicRead).not.toBeNull();
    expect(publicRead?.title).toBe('Noise Buds');
    // currentPrice is stored in integer paise (199.00 → 19900).
    expect(publicRead?.currentPrice).toBe(19_900);

    const tags = revalidatedTags();
    expect(tags).toContain(productTag(created.slug));
    expect(tags).toContain(CACHE_TAGS.products);
    expect(tags).toContain(CACHE_TAGS.homepage);
  });

  it('updates a product price and the public read reflects the change', async () => {
    const categoryId = new Types.ObjectId().toString();
    const created = await createProduct(
      productSchema.parse({
        title: 'Smart Watch',
        store: 'Acme',
        categoryId,
        currentPrice: 999.0,
        primaryImageUrl: 'https://cdn.example.test/w.jpg',
        affiliateUrl: 'https://example.test/go',
        status: 'active',
      }),
    );
    revalidateTag.mockClear();

    const updated = await updateProduct(
      created.id,
      productSchema.parse({
        title: 'Smart Watch',
        store: 'Acme',
        categoryId,
        currentPrice: 799.0,
        primaryImageUrl: 'https://cdn.example.test/w.jpg',
        affiliateUrl: 'https://example.test/go',
        status: 'active',
      }),
    );

    const publicRead = await resolveActiveProduct(updated.slug);
    expect(publicRead?.currentPrice).toBe(79_900);

    expect(revalidatedTags()).toContain(productTag(updated.slug));
    expect(revalidatedTags()).toContain(CACHE_TAGS.products);
  });
});

describe('Deal mutation → revalidate → public reflects change (Req 25.8, 25.9)', () => {
  it('creates a deal, reads it back publicly, and revalidates its tags', async () => {
    const categoryId = new Types.ObjectId().toString();
    const created = await createDeal(
      dealSchema.parse({
        headline: 'Flat 50% Off',
        store: 'Acme',
        categoryId,
        dealType: 'direct_deal',
        destinationUrl: 'https://example.test/deal',
        status: 'active',
      }),
    );

    const publicRead = await resolveActiveDeal(created.slug);
    expect(publicRead).not.toBeNull();
    expect(publicRead?.headline).toBe('Flat 50% Off');

    const tags = revalidatedTags();
    expect(tags).toContain(dealTag(created.slug));
    expect(tags).toContain(CACHE_TAGS.deals);
    expect(tags).toContain(CACHE_TAGS.homepage);
  });

  it('updates a deal headline and the public read reflects the change', async () => {
    const categoryId = new Types.ObjectId().toString();
    const created = await createDeal(
      dealSchema.parse({
        headline: 'Old Headline',
        store: 'Acme',
        categoryId,
        dealType: 'direct_deal',
        destinationUrl: 'https://example.test/deal',
        status: 'active',
      }),
    );
    revalidateTag.mockClear();

    const updated = await updateDeal(
      created.id,
      dealSchema.parse({
        headline: 'New Headline',
        store: 'Acme',
        categoryId,
        dealType: 'direct_deal',
        destinationUrl: 'https://example.test/deal',
        status: 'active',
      }),
    );

    const publicRead = await resolveActiveDeal(updated.slug);
    expect(publicRead?.headline).toBe('New Headline');

    expect(revalidatedTags()).toContain(dealTag(updated.slug));
    expect(revalidatedTags()).toContain(CACHE_TAGS.deals);
  });
});
