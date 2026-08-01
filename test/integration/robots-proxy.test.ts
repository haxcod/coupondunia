/**
 * Integration / smoke tests — `robots.txt` and the Proxy (Middleware) gate
 * (Task 16.2; Req 24.5, 27.5, 27.6, 13.1).
 *
 * These run against the building blocks directly (no HTTP server needed):
 *  - `app/robots.ts` default export → disallow `/admin` + `/api`, reference the
 *    sitemap (Req 24.5).
 *  - `proxy.ts` → the optimistic `/admin/*` cookie gate (Req 13.1) and the
 *    HTTPS-enforcement behaviour (Req 27.5/27.6 — see the note in that block).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import robots from '@/app/robots';
import { proxy } from '@/proxy';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

/** Build a NextRequest for `url`, optionally carrying a session cookie. */
function makeRequest(url: string, withSession = false): NextRequest {
  const headers = withSession
    ? { cookie: `${SESSION_COOKIE_NAME}=fake-token` }
    : undefined;
  return new NextRequest(url, headers ? { headers } : undefined);
}

/** Whether a proxy response is a redirect to a given pathname. */
function redirectsTo(res: Response, pathname: string): boolean {
  if (res.status < 300 || res.status >= 400) return false;
  const location = res.headers.get('location');
  if (!location) return false;
  return new URL(location).pathname === pathname;
}

/** Whether a proxy response passes the request through (`NextResponse.next()`). */
function passesThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

describe('robots.txt (Req 24.5)', () => {
  it('disallows /admin and /api and references the sitemap', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    const disallow = rules.flatMap((rule) => {
      const value = rule.disallow ?? [];
      return Array.isArray(value) ? value : [value];
    });

    expect(disallow).toContain('/admin');
    expect(disallow).toContain('/api');

    // A sitemap reference is always emitted so crawlers can discover URLs.
    expect(result.sitemap).toBeDefined();
    expect(String(result.sitemap)).toMatch(/sitemap\.xml$/);
  });

  it('allows crawling the public site root', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const allow = rules.flatMap((rule) => {
      const value = rule.allow ?? [];
      return Array.isArray(value) ? value : [value];
    });
    expect(allow).toContain('/');
  });
});

describe('Proxy optimistic /admin gate (Req 13.1)', () => {
  it('redirects an unauthenticated /admin/* request to /admin/login', () => {
    const res = proxy(makeRequest('https://dealspark.test/admin/dashboard'));
    expect(redirectsTo(res, '/admin/login')).toBe(true);
  });

  it('lets the /admin/login page through without a session cookie', () => {
    const res = proxy(makeRequest('https://dealspark.test/admin/login'));
    expect(passesThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets an /admin/* request through when a session cookie is present', () => {
    const res = proxy(
      makeRequest('https://dealspark.test/admin/dashboard', true),
    );
    expect(passesThrough(res)).toBe(true);
  });

  it('does not gate public (non-admin) paths', () => {
    const res = proxy(makeRequest('https://dealspark.test/category/electronics'));
    expect(passesThrough(res)).toBe(true);
  });
});

describe('Proxy HTTPS behaviour (Req 27.5, 27.6)', () => {
  /*
   * HTTPS enforcement is production-only: `next dev` serves plaintext http with
   * no `x-forwarded-proto`, so an unconditional redirect would loop. The proxy
   * therefore redirects http→https only when `NODE_ENV === 'production'` (and
   * the request is not already reported as secure by a TLS-terminating
   * proxy/CDN). These tests pin both branches.
   */
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    setNodeEnv(ORIGINAL_NODE_ENV ?? 'test');
  });

  function setNodeEnv(value: string): void {
    (process.env as Record<string, string>).NODE_ENV = value;
  }

  it('in production, redirects an http public request to https (Req 27.5/27.6)', () => {
    setNodeEnv('production');
    const res = proxy(makeRequest('http://dealspark.test/category/electronics'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location as string).protocol).toBe('https:');
  });

  it('in production, treats x-forwarded-proto=https (behind a CDN) as already secure', () => {
    setNodeEnv('production');
    const res = proxy(
      new NextRequest('http://dealspark.test/category/electronics', {
        headers: { 'x-forwarded-proto': 'https' },
      }),
    );
    expect(passesThrough(res)).toBe(true);
  });

  it('outside production, passes an http public request through (no dev redirect loop)', () => {
    setNodeEnv('development');
    const res = proxy(makeRequest('http://dealspark.test/category/electronics'));
    expect(passesThrough(res)).toBe(true);
  });

  it('still applies the admin gate on http requests (scheme-independent)', () => {
    const res = proxy(makeRequest('http://dealspark.test/admin/dashboard'));
    expect(redirectsTo(res, '/admin/login')).toBe(true);
  });
});
