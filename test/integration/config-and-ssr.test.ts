/**
 * Integration / smoke tests — rendering model + image/ISR configuration
 * (Task 16.2; Req 25.6, 25.7, 25.10, 25.11, 25.8).
 *
 * ## Scope and the in-test limitation
 *
 * Some of these acceptance criteria are framework/runtime guarantees that can
 * only be *observed* against a live Next.js server (e.g. the `Content-Type` of
 * an optimized image, or the `x-nextjs-cache: STALE→HIT` transition over the
 * 300s/600s windows). The vitest harness has no running server, so for those we
 * assert the *configuration/contract that produces* the behaviour and document
 * the limitation here:
 *
 *  - 25.6/25.7 (WebP + raster fallback): the `next/image` pipeline performs
 *    content-negotiated format selection (WebP when `Accept` allows it, an
 *    alternative raster format otherwise) automatically. We assert the image
 *    pipeline is configured (remote patterns present, https permitted) and that
 *    Cache Components is enabled; the live format negotiation is a framework
 *    guarantee not reproducible without a server.
 *  - 25.8 (300s/600s ISR windows): the loaders' `cacheLife` profiles are the
 *    source of those windows; we assert them statically. The live serve-last-
 *    good / `x-nextjs-cache` flip is covered in spirit by `revalidation.test.ts`
 *    (mutation → revalidateTag → fresh read) plus this config assertion.
 *  - 25.10 (Admin renders on the client) and 25.11 (search results page is SSR):
 *    asserted by inspecting the component directives + a live search route call.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import nextConfig from '@/next.config';
import { GET as searchRoute } from '@/app/api/public/search/route';
import { Store, Category, Product } from '@/lib/models';
import { setupMemoryMongo, clearDatabase } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const ROOT = process.cwd();

function readSource(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8');
}

describe('Admin pages render on the client (Req 25.10)', () => {
  it('admin dashboard and login UIs are Client Components', () => {
    const dashboard = readSource(
      'app',
      '(admin)',
      'admin',
      'dashboard',
      'DashboardClient.tsx',
    );
    const login = readSource('app', '(auth)', 'admin', 'login', 'LoginForm.tsx');

    expect(dashboard).toMatch(/^['"]use client['"]/);
    expect(login).toMatch(/^['"]use client['"]/);
  });
});

describe('Search results page is server-side rendered (Req 25.11)', () => {
  it('the /search page is a Server Component (no "use client" directive)', () => {
    const page = readSource('app', 'search', 'page.tsx');
    // A Server Component must NOT opt into the client with a leading directive.
    expect(page).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('the search route handler returns results JSON for a valid query', async () => {
    await clearDatabase();
    const store = await Store.create({ name: 'Acme', slug: 'acme' });
    const category = await Category.create({ name: 'Gadgets', slug: 'gadgets' });
    await Product.create({
      title: 'Mega Sale Widget',
      slug: 'mega-sale-widget',
      storeId: store._id,
      categoryId: category._id,
      currentPrice: 999,
      primaryImageUrl: 'https://cdn.example.test/img.png',
      affiliateUrl: 'https://example.test/aff',
      status: 'active',
    });

    const res = await searchRoute(
      new NextRequest('https://example.test/api/public/search?q=sale&type=product'),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('products');
    expect(body).toHaveProperty('deals');
    expect(body.productCount).toBe(1);
    expect(body.products[0].title).toBe('Mega Sale Widget');
    // Affiliate URL must never leak through the SSR payload (Req 7.9).
    expect(body.products[0]).not.toHaveProperty('affiliateUrl');
  });
});

describe('Image pipeline configuration (Req 25.6, 25.7)', () => {
  it('configures next/image remote patterns and permits https', () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(patterns.length).toBeGreaterThan(0);
    // The pipeline must be able to optimize https-served content images; the
    // WebP-or-raster format negotiation is then performed by Next automatically.
    expect(patterns.some((p) => p.protocol === 'https')).toBe(true);
  });

  it('enables Cache Components so the static shell + ISR model is active', () => {
    expect(nextConfig.cacheComponents).toBe(true);
  });
});

describe('ISR revalidation windows (Req 25.8)', () => {
  it('declares 300s windows for listings and a 600s window for product pages', () => {
    const catalog = readSource('lib', 'catalog.ts');
    // Homepage / category / deal listings → 300s revalidate.
    expect(catalog).toMatch(/revalidate:\s*300/);
    // Product pages → 600s revalidate.
    expect(catalog).toMatch(/revalidate:\s*600/);
  });
});
