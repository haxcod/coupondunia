/**
 * Proxy (Next.js 16's renamed Middleware) — runs before routes are rendered.
 *
 * Two lightweight, edge-safe responsibilities only:
 *
 *  1. HTTPS enforcement (Req 27.5/27.6): redirect any request received over
 *     HTTP to the equivalent HTTPS URL so page content is never served over
 *     plaintext. Behind a TLS-terminating proxy/CDN the original scheme is
 *     carried by `x-forwarded-proto`, which is honored here.
 *
 *  2. Optimistic admin gate (Req 13.1): for `/admin/*` paths other than
 *     `/admin/login`, redirect to `/admin/login` when the session cookie is
 *     absent. This is a presence-only check — it does NOT verify the JWT.
 *     Per the Next.js docs, Proxy is not a full auth solution, so the
 *     authoritative `verifySession` check lives in the admin layout/route
 *     handlers (task 14.2) and `/api/admin/*` returns 401 without a valid
 *     session. Keeping the proxy free of bcrypt/jose/Mongoose keeps it light.
 *
 * See `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

const ADMIN_LOGIN_PATH = '/admin/login';

/**
 * Resolve the effective request scheme, preferring `x-forwarded-proto` (set by
 * a TLS-terminating proxy/CDN) over the URL's own protocol. Only the first
 * value is used when the header carries a comma-separated list.
 */
function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto) {
    return forwardedProto === 'https';
  }

  return request.nextUrl.protocol === 'https:';
}

export function proxy(request: NextRequest): NextResponse {
  const { nextUrl } = request;

  // 1. HTTPS enforcement (Req 27.5/27.6). Only enforced in production: `next
  //    dev` serves plaintext HTTP with no `x-forwarded-proto`, so redirecting
  //    there would loop. In production (and preview), a request that is not
  //    already HTTPS — and is not reported as HTTPS by a TLS-terminating
  //    proxy/CDN via `x-forwarded-proto` — is redirected to the HTTPS URL so
  //    page content is never served over plaintext.
  if (process.env.NODE_ENV === 'production' && !isSecureRequest(request)) {
    const httpsUrl = nextUrl.clone();
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl);
  }

  // 2. Optimistic `/admin/*` gate (Req 13.1) — cookie presence only.
  const { pathname } = nextUrl;
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isLoginPath =
    pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`);

  if (isAdminPath && !isLoginPath) {
    const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
    if (!hasSessionCookie) {
      const loginUrl = nextUrl.clone();
      loginUrl.pathname = ADMIN_LOGIN_PATH;
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Run on all request paths except Next.js internals and static assets so the
   * HTTPS redirect and admin gate never block CSS, JS, images, or metadata
   * files. API routes are included so `/admin/*` data paths stay covered; the
   * authoritative auth checks for `/api/admin/*` live in the handlers.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
