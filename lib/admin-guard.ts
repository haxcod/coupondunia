/**
 * Authoritative admin-session guard for `/api/admin/*` route handlers
 * (Req 13.8, 22.2).
 *
 * `proxy.ts` performs only an *optimistic* cookie-presence redirect for
 * `/admin/*` pages; per the Next.js docs, Proxy is not a full auth solution.
 * The authoritative check is a `verifySession()` call inside each admin route
 * handler and the admin layout. This helper centralises that check so every
 * admin API responds identically — HTTP 401 with the standard
 * `{ error: { message } }` envelope — when the session cookie is missing,
 * malformed, tampered with, or expired.
 *
 * Usage in a route handler:
 *
 * ```ts
 * const guard = await requireAdminSession();
 * if (!guard.ok) return guard.response;
 * const { session } = guard; // session.adminId is safe to use
 * ```
 */
import { NextResponse } from 'next/server';

import { verifySession, type Session } from '@/lib/auth';
import type { ErrorEnvelope } from '@/lib/validation/errors';

/** The result of an admin-session guard check. */
export type AdminGuardResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

/** Build the canonical 401 response for an unauthenticated admin request. */
export function unauthorizedResponse(
  message = 'Unauthorized.',
): NextResponse<ErrorEnvelope> {
  return NextResponse.json({ error: { message } }, { status: 401 });
}

/**
 * Verify the request carries a valid administrator session.
 *
 * Returns `{ ok: true, session }` when the session cookie verifies, or
 * `{ ok: false, response }` carrying a ready-to-return HTTP 401 otherwise
 * (Req 13.8). Performs no I/O beyond reading + verifying the session cookie.
 */
export async function requireAdminSession(): Promise<AdminGuardResult> {
  const session = await verifySession();
  if (!session) {
    return { ok: false, response: unauthorizedResponse() };
  }
  return { ok: true, session };
}
