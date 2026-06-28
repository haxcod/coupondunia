/**
 * Integration tests — image upload contract (Task 16.2; Req 22.1, 22.2).
 *
 * Covers the building blocks that back `POST /api/admin/upload`:
 *
 *  - `validateUpload` accepts the supported image types within the size bounds
 *    and rejects unsupported/oversize/missing files (Req 22.1, 22.3–22.5).
 *  - `storeUpload` persists bytes to object storage and returns a *resolvable*
 *    public URL (Req 22.1). The S3 client's `send` is mocked so no network call
 *    is made, but the URL-construction contract is asserted for real.
 *  - The route handler returns HTTP 401 and stores nothing when the request
 *    carries no administrator session (Req 22.2). `next/headers` `cookies()` is
 *    mocked to an empty cookie jar so `verifySession()` resolves to `null`,
 *    exactly as it would for an unauthenticated request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A spy stands in for the S3 client's network `send`, hoisted so it is defined
// before the (hoisted) `vi.mock` factory runs.
const { s3Send } = vi.hoisted(() => ({ s3Send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => ({
  // `new S3Client(...)` is called in lib/upload, so the mock must be constructable.
  S3Client: class {
    send = s3Send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

// An empty cookie jar → no session cookie → `verifySession()` returns null.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    has: () => false,
  }),
}));

import { NextRequest } from 'next/server';

import {
  MAX_UPLOAD_BYTES,
  storeUpload,
  validateUpload,
} from '@/lib/upload';
import { POST as uploadRoute } from '@/app/api/admin/upload/route';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  s3Send.mockReset();
  s3Send.mockResolvedValue({});
  // Minimal object-storage config so `storeUpload` can build a URL.
  process.env.S3_BUCKET = 'dealspark-media';
  process.env.S3_REGION = 'ap-south-1';
  process.env.S3_ACCESS_KEY_ID = 'test-access-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_PUBLIC_BASE_URL;
  delete process.env.S3_FORCE_PATH_STYLE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('validateUpload (Req 22.1, 22.3–22.5)', () => {
  it('accepts each supported image type within the size bounds', () => {
    for (const contentType of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ] as const) {
      const result = validateUpload({ contentType, size: 1024 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.contentType).toBe(contentType);
      }
    }
  });

  it('rejects an unsupported type, an oversize file, and a missing file', () => {
    expect(validateUpload({ contentType: 'application/pdf', size: 1024 })).toMatchObject({
      ok: false,
      error: 'unsupported_type',
    });
    expect(
      validateUpload({ contentType: 'image/png', size: MAX_UPLOAD_BYTES + 1 }),
    ).toMatchObject({ ok: false, error: 'file_too_large' });
    expect(validateUpload({ contentType: null, size: null })).toMatchObject({
      ok: false,
      error: 'missing_file',
    });
  });
});

describe('storeUpload (Req 22.1)', () => {
  it('stores the bytes and returns a resolvable public URL', async () => {
    const stored = await storeUpload({
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: 'image/webp',
    });

    // A single PutObject was issued to object storage.
    expect(s3Send).toHaveBeenCalledTimes(1);

    // The returned URL is absolute, https, and resolves to the stored object
    // under the configured bucket/region with the correct extension.
    const url = new URL(stored.url);
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('dealspark-media.s3.ap-south-1.amazonaws.com');
    expect(url.pathname).toBe(`/${stored.key}`);
    expect(stored.key).toMatch(/^uploads\/[0-9a-f-]+\.webp$/);
  });
});

describe('POST /api/admin/upload without a session (Req 22.2)', () => {
  it('returns 401 and stores nothing when no session cookie is present', async () => {
    const request = new NextRequest('https://example.test/api/admin/upload', {
      method: 'POST',
    });

    const res = await uploadRoute(request);

    expect(res.status).toBe(401);
    // Nothing was written to object storage.
    expect(s3Send).not.toHaveBeenCalled();
  });
});
