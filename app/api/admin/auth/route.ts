/**
 * `POST /api/admin/auth` — administrator login and logout (Task 14.2, Req 13).
 *
 * A single `POST` handles BOTH actions, discriminated by an `action` field in
 * the JSON body (documented contract):
 *
 *   - `{ action: 'login', email, password }`
 *       · 200 `{ ok: true }`                     — credentials matched; the
 *                                                  httpOnly session cookie is set
 *                                                  via `createSession` (Req 13.2).
 *       · 400 `{ error: { field, message } }`    — empty email/password; `field`
 *                                                  identifies the missing input
 *                                                  (Req 13.4).
 *       · 401 `{ error: { message } }`           — "Invalid email or password";
 *                                                  no cookie established (Req 13.3).
 *       · 423 `{ error: { message, lockedUntil } }` — account temporarily locked
 *                                                  after 5 failures in 15 min;
 *                                                  `lockedUntil` is an ISO string
 *                                                  (Req 13.5).
 *   - `{ action: 'logout' }`
 *       · 200 `{ ok: true }`                     — session cookie invalidated
 *                                                  (Req 13.7).
 *
 * Malformed JSON or an unknown/absent `action` yields 400 with the standard
 * `{ error: { field?, message } }` envelope. The route handler owns cookie I/O
 * (`createSession`/`logout`); the credential + lockout logic lives in
 * Auth_Service so it stays request-agnostic and unit-testable.
 *
 * Route Handlers are not cached for non-GET methods and this handler reads the
 * request body, so it always runs dynamically.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createSession, login, logout } from '@/lib/auth';
import type { ErrorEnvelope } from '@/lib/validation/errors';

/** Build the standard `{ error: { field?, message } }` envelope. */
function errorEnvelope(message: string, field?: string): ErrorEnvelope {
  return { error: field === undefined ? { message } : { field, message } };
}

/**
 * Body shape only — credential *correctness*, empty-field detection, and the
 * lockout window are Auth_Service concerns (Req 13.3-13.5). We deliberately do
 * NOT enforce the 8–128 password policy here: a too-short password at login is
 * an invalid credential, not a validation error.
 */
const loginSchema = z.object({
  action: z.literal('login'),
  email: z.string(),
  password: z.string(),
});

const logoutSchema = z.object({
  action: z.literal('logout'),
});

const requestSchema = z.discriminatedUnion('action', [
  loginSchema,
  logoutSchema,
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse the JSON body. A malformed/empty body is a 400.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      errorEnvelope('The request body must be valid JSON.'),
      { status: 400 },
    );
  }

  // 2. Validate the body shape + action discriminator.
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorEnvelope('A valid "action" of "login" or "logout" is required.'),
      { status: 400 },
    );
  }

  // 3. Logout: invalidate the session cookie and confirm (Req 13.7).
  if (parsed.data.action === 'logout') {
    await logout();
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 4. Login: delegate credential + lockout evaluation to Auth_Service.
  const { email, password } = parsed.data;
  const result = await login(email, password);

  if (!result.ok) {
    switch (result.error.code) {
      case 'missing_field':
        // Empty email/password → 400 identifying the missing field (Req 13.4).
        return NextResponse.json(
          errorEnvelope(result.error.message, result.error.field),
          { status: 400 },
        );
      case 'locked':
        // Account temporarily locked → 423 with the unlock time (Req 13.5).
        return NextResponse.json(
          {
            error: {
              message: result.error.message,
              lockedUntil: result.error.lockedUntil?.toISOString(),
            },
          },
          { status: 423 },
        );
      case 'invalid_credentials':
      default:
        // Wrong credentials → 401, no cookie established (Req 13.3).
        return NextResponse.json(errorEnvelope(result.error.message), {
          status: 401,
        });
    }
  }

  // 5. Success: establish the httpOnly session cookie and confirm (Req 13.2).
  await createSession(result.session.adminId);
  return NextResponse.json({ ok: true }, { status: 200 });
}
