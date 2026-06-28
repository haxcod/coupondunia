// Feature: dealspark — Task 9.6: integration tests for the public click endpoint.
//
// Exercises the `POST /api/public/click` route handler end-to-end against a
// *real* MongoDB (the in-memory single-node replica set from
// `@/test/harness/mongo-memory`, which runs genuine multi-document
// transactions). We drive the handler exactly as Next.js would — by
// constructing `NextRequest` objects with JSON bodies and Referer/User-Agent
// headers — and assert on both the HTTP response and the resulting database
// state.
//
// Coverage:
//   - Concurrent POSTs against one active record increment clickCount with no
//     lost updates and persist exactly one ClickEvent each (Req 7.4, 9.2).
//   - A forced transaction failure (ClickEvent.create throws) yields 500 and
//     rolls back completely — no event, unchanged count (Req 9.3).
//   - An unknown identifier yields 404; a malformed body yields 400 (Req 9.5,
//     9.6) — neither mutates state.
//
// _Requirements: 7.4, 9.2, 9.3_

import { Types } from 'mongoose';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/public/click/route';
import { ClickEvent, Product } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

afterEach(() => {
  vi.restoreAllMocks();
});

const AFFILIATE_URL = 'https://example.com/go';

/** Build a `NextRequest` carrying a JSON body and the privacy-derived headers. */
function clickRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/public/click', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer: 'https://referrer.example.com/page',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A `NextRequest` whose body is deliberately not valid JSON. */
function rawClickRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/public/click', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });
}

/** Seed a single active Product with a non-empty affiliate URL and given count. */
async function seedActiveProduct(initialClickCount = 0): Promise<Types.ObjectId> {
  const product = await new Product({
    title: 'Integration Product',
    slug: `integration-product-${new Types.ObjectId().toString()}`,
    storeId: new Types.ObjectId(),
    categoryId: new Types.ObjectId(),
    currentPrice: 100,
    primaryImageUrl: 'https://example.com/p.jpg',
    affiliateUrl: AFFILIATE_URL,
    clickCount: initialClickCount,
  }).save();
  return product._id;
}

describe('POST /api/public/click (integration, real MongoDB)', () => {
  it('records concurrent clicks atomically with no lost updates and one event each', async () => {
    const productId = await seedActiveProduct(0);
    const id = productId.toString();

    const CONCURRENCY = 12;
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        POST(clickRequest({ type: 'product', id })),
      ),
    );

    // Every concurrent click succeeds and returns the resolved destination URL.
    for (const res of responses) {
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ url: AFFILIATE_URL });
    }

    // No lost updates: the count equals the number of concurrent clicks.
    const refreshed = await Product.findById(productId).lean();
    expect(refreshed?.clickCount).toBe(CONCURRENCY);

    // Exactly one ClickEvent is persisted per click.
    const events = await ClickEvent.countDocuments({ productId });
    expect(events).toBe(CONCURRENCY);
  });

  it('derives the event metadata server-side from request headers', async () => {
    const productId = await seedActiveProduct(0);

    const res = await POST(
      clickRequest(
        { type: 'product', id: productId.toString() },
        {
          referer: 'https://news.example.com/article',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
        },
      ),
    );
    expect(res.status).toBe(200);

    const event = await ClickEvent.findOne({ productId }).lean();
    expect(event).not.toBeNull();
    expect(event?.referrer).toBe('https://news.example.com/article');
    expect(event?.deviceType).toBe('mobile');
    expect(event?.clickType).toBe('product');
  });

  it('rolls back completely and returns 500 when the transaction fails', async () => {
    const productId = await seedActiveProduct(5);

    // Force a failure INSIDE the transaction at the ClickEvent insert.
    vi.spyOn(ClickEvent, 'create').mockImplementation(() => {
      throw new Error('injected event-insert failure');
    });

    const res = await POST(clickRequest({ type: 'product', id: productId.toString() }));

    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBeTruthy();

    // Post-state equals pre-state: no event persisted, count unchanged.
    await expect(ClickEvent.countDocuments({ productId })).resolves.toBe(0);
    const refreshed = await Product.findById(productId).lean();
    expect(refreshed?.clickCount).toBe(5);
  });

  it('returns 404 for an unknown identifier without mutating state', async () => {
    const unknownId = new Types.ObjectId().toString();

    const res = await POST(clickRequest({ type: 'product', id: unknownId }));

    expect(res.status).toBe(404);
    await expect(ClickEvent.countDocuments({})).resolves.toBe(0);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await POST(rawClickRequest('this is not json{'));

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBeTruthy();
    await expect(ClickEvent.countDocuments({})).resolves.toBe(0);
  });

  it('returns 400 with the offending field for a payload missing the identifier', async () => {
    const res = await POST(clickRequest({ type: 'product' }));

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: { field?: string; message: string } };
    expect(data.error.field).toBe('id');
    await expect(ClickEvent.countDocuments({})).resolves.toBe(0);
  });
});
