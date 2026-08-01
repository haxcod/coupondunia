/**
 * Unit tests for `GET /api/public/search` (Task 9.1).
 *
 * Covers the route handler's own responsibilities:
 *  - parameter validation → `400 { error: { field?, message } }` (Req 21.7, 11.10)
 *  - delegating valid requests to the Search_Service and returning its JSON
 *    payload with a `200` (Req 21.1, 21.2)
 *
 * The Search_Service's matching/ranking semantics are exercised separately in
 * `lib/search-service.test.ts`; here we assert the HTTP contract.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { setupMemoryMongo, clearDatabase } from '@/test/harness/mongo-memory';
import { Store, Category, Product } from '@/lib/models';
import { GET } from './route';

setupMemoryMongo();

function request(query: string): NextRequest {
  return new NextRequest(`https://example.test/api/public/search${query}`);
}

describe('GET /api/public/search', () => {
  it('returns 400 with the offending field when q is missing (Req 21.7)', async () => {
    const res = await GET(request(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.field).toBe('q');
    expect(typeof body.error.message).toBe('string');
  });

  it('returns 400 when q exceeds 100 characters (Req 21.1, 11.10)', async () => {
    const res = await GET(request(`?q=${'a'.repeat(101)}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.field).toBe('q');
  });

  it('returns 400 when type is present but not a recognized value (Req 21.7)', async () => {
    const res = await GET(request('?q=sale&type=banana'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.field).toBe('type');
  });

  it('returns 200 with empty collections when nothing matches (Req 21.2)', async () => {
    await clearDatabase();
    const res = await GET(request('?q=xyzzy'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ products: [], productCount: 0, deals: [], dealCount: 0 });
  });

  it('returns 200 with matching products for a valid query (Req 21.1)', async () => {
    await clearDatabase();
    const store = await Store.create({ name: 'Acme', slug: 'acme' });
    const category = await Category.create({ name: 'Gadgets', slug: 'gadgets' });
    await Product.create({
      title: 'Mega Sale Widget',
      slug: 'mega-sale-widget',
      storeId: store._id,
      categoryId: category._id,
      currentPrice: 999,
      primaryImageUrl: 'https://example.test/img.png',
      affiliateUrl: 'https://example.test/aff',
      status: 'active',
    });

    const res = await GET(request('?q=sale&type=product'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.productCount).toBe(1);
    expect(body.products).toHaveLength(1);
    expect(body.products[0].title).toBe('Mega Sale Widget');
    // Affiliate URL must never leak through the public summary (Req 7.9).
    expect(body.products[0]).not.toHaveProperty('affiliateUrl');
    // type=product means deals are not searched.
    expect(body.dealCount).toBe(0);
  });

  it('defaults type to "all" when omitted', async () => {
    await clearDatabase();
    const res = await GET(request('?q=sale'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('products');
    expect(body).toHaveProperty('deals');
  });
});
