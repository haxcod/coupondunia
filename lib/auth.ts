/**
 * Auth_Service — administrator authentication, session management, and the
 * password-change flow for DealSpark.
 *
 * Responsibilities (Req 13.2–13.7, 20.8–20.10):
 *  - Hash and verify passwords with bcrypt (Req 13.6, 20.8).
 *  - `login` with rate limiting: 5 consecutive failed attempts within a
 *    15-minute window lock the account for 15 minutes from the 5th failure
 *    (Req 13.5), tracked via the `LoginAttempt` collection.
 *  - `createSession` / `verifySession` / `logout` backed by a signed, httpOnly,
 *    `Secure`, `SameSite=Lax` cookie with a 24-hour expiry, using `jose`
 *    (Req 13.2, 13.7).
 *  - `changePassword` verifies the current password and enforces the 8–128
 *    character policy before persisting a new bcrypt hash (Req 20.8–20.10).
 *
 * Design notes:
 *  - This module performs no cookie I/O during `login`; the route handler calls
 *    `createSession` after a successful `login`. Keeping credential/lockout
 *    logic free of request-scoped APIs makes it directly testable and matches
 *    the service split in the design.
 *  - Per the Next.js authentication guide, the session token carries only the
 *    minimum identifying data (the admin id as the JWT subject) — never PII
 *    such as the email address.
 *  - `cookies()` is async in this Next.js version and must be awaited.
 */
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { connectToDatabase } from '@/lib/db';
import { AdminUser, LoginAttempt } from '@/lib/models';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

// --- Constants ------------------------------------------------------------

/**
 * Name of the httpOnly session cookie. Re-exported from the edge/proxy-safe
 * {@link module:lib/session-cookie} module so `proxy.ts` can share the constant
 * without importing this module's node-only dependencies (bcrypt/jose/Mongoose).
 */
export { SESSION_COOKIE_NAME };

/** Session lifetime: 24 hours (Req 13.2). */
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/** bcrypt cost factor for password hashes (Req 13.6). */
const BCRYPT_COST = 12;

/** Lockout policy (Req 13.5). */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // failures must cluster within 15 min
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // lock duration from the 5th failure

/** Password policy bounds (Req 20.8 / 20.10). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const JWT_ALG = 'HS256';

// --- Types ----------------------------------------------------------------

export interface Session {
  /** AdminUser id (the JWT subject). */
  adminId: string;
  /** Absolute expiry of the session. */
  expiresAt: Date;
}

export interface SessionCookie {
  name: string;
  value: string;
  expiresAt: Date;
}

export type AuthErrorCode = 'missing_field' | 'invalid_credentials' | 'locked';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  /** The offending field, when applicable (Req 13.4). */
  field?: 'email' | 'password';
  /** When `code === 'locked'`, the time the lock lifts (Req 13.5). */
  lockedUntil?: Date;
}

export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; error: AuthError };

export type ChangePasswordErrorCode =
  | 'not_found'
  | 'invalid_current_password'
  | 'weak_password';

export interface ChangePasswordError {
  code: ChangePasswordErrorCode;
  message: string;
  field?: 'currentPassword' | 'newPassword';
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: ChangePasswordError };

// --- Password hashing (Req 13.6, 20.8) ------------------------------------

/** Hash a plaintext password with bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Verify a plaintext password against a stored bcrypt hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    // A malformed/empty hash cannot match any password.
    return false;
  }
}

/** Whether a candidate password satisfies the length policy (Req 20.8/20.10). */
export function isValidPasswordPolicy(password: string): boolean {
  return (
    typeof password === 'string' &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

// A lazily-computed bcrypt hash used to equalize timing when the supplied email
// matches no admin, mitigating user-enumeration via response timing.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('dealspark-nonexistent-account', BCRYPT_COST);
  }
  return dummyHashPromise;
}

// --- Session cookie (jose) ------------------------------------------------

function getEncodedKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. Provide a strong random value for signing admin session cookies.',
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session token for `adminId`, set it as an httpOnly/`Secure`/
 * `SameSite=Lax` cookie with a 24-hour expiry, and return the cookie metadata
 * (Req 13.2). Must run in a request scope (route handler / server action),
 * because `cookies()` is request-bound.
 */
export async function createSession(adminId: string): Promise<SessionCookie> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getEncodedKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return { name: SESSION_COOKIE_NAME, value: token, expiresAt };
}

/**
 * Verify a session token and return the {@link Session} it represents, or
 * `null` when it is missing, malformed, tampered, or expired. When `token` is
 * omitted, the value is read from the request's session cookie.
 *
 * `jwtVerify` rejects expired tokens, which enforces the 24-hour expiry
 * (Req 13.2) on the authoritative server-side check.
 */
export async function verifySession(token?: string): Promise<Session | null> {
  let value = token;
  if (value === undefined) {
    const cookieStore = await cookies();
    value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  }
  if (!value) return null;

  try {
    const { payload } = await jwtVerify(value, getEncodedKey(), {
      algorithms: [JWT_ALG],
    });
    const adminId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!adminId) return null;
    const expiresAt =
      typeof payload.exp === 'number'
        ? new Date(payload.exp * 1000)
        : new Date(Date.now() + SESSION_DURATION_MS);
    return { adminId, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Invalidate the current session by deleting the session cookie (Req 13.7).
 * With stateless JWT sessions there is no server-side record to revoke.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// --- Login with lockout (Req 13.3, 13.4, 13.5) ----------------------------

/**
 * Evaluate the lockout state for `email` at time `now`.
 *
 * Walks the most recent attempts (newest first) accumulating the current
 * consecutive-failure streak (a successful attempt ends the streak). When the
 * streak reaches {@link MAX_FAILED_ATTEMPTS} failures that all fall within a
 * {@link LOCKOUT_WINDOW_MS} window, the account is locked until the 5th
 * (most-recent qualifying) failure plus {@link LOCKOUT_DURATION_MS}.
 */
async function evaluateLockout(
  email: string,
  now: Date,
): Promise<{ locked: boolean; lockedUntil?: Date }> {
  const recent = await LoginAttempt.find({ email })
    .sort({ createdAt: -1 })
    .limit(MAX_FAILED_ATTEMPTS + 10)
    .lean();

  const failureTimes: Date[] = [];
  for (const attempt of recent) {
    if (attempt.successful) break; // streak ends at the most recent success
    failureTimes.push(new Date(attempt.createdAt));
  }

  if (failureTimes.length < MAX_FAILED_ATTEMPTS) return { locked: false };

  // failureTimes is newest-first; take the 5 most recent failures.
  const newest = failureTimes[0];
  const fifthMostRecent = failureTimes[MAX_FAILED_ATTEMPTS - 1];

  // The 5 failures must cluster within the 15-minute window (Req 13.5).
  if (newest.getTime() - fifthMostRecent.getTime() > LOCKOUT_WINDOW_MS) {
    return { locked: false };
  }

  const lockedUntil = new Date(newest.getTime() + LOCKOUT_DURATION_MS);
  if (now.getTime() < lockedUntil.getTime()) {
    return { locked: true, lockedUntil };
  }
  return { locked: false };
}

/**
 * Authenticate an administrator by email + password.
 *
 *  - Empty email/password → `missing_field` (Req 13.4).
 *  - Account locked → `locked` with `lockedUntil`; the attempt is NOT recorded,
 *    so the lock window stays anchored to the 5th failure (Req 13.5).
 *  - Wrong credentials → records a failed attempt and returns
 *    `invalid_credentials` (Req 13.3).
 *  - Correct credentials → records a successful attempt and returns the
 *    {@link Session}. The caller is responsible for calling {@link createSession}.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  await connectToDatabase();

  const normalizedEmail = email?.trim().toLowerCase() ?? '';
  if (!normalizedEmail) {
    return {
      ok: false,
      error: { code: 'missing_field', field: 'email', message: 'Email is required' },
    };
  }
  if (!password) {
    return {
      ok: false,
      error: {
        code: 'missing_field',
        field: 'password',
        message: 'Password is required',
      },
    };
  }

  const now = new Date();
  const lock = await evaluateLockout(normalizedEmail, now);
  if (lock.locked) {
    return {
      ok: false,
      error: {
        code: 'locked',
        message: 'Account temporarily locked due to repeated failed attempts',
        lockedUntil: lock.lockedUntil,
      },
    };
  }

  const admin = await AdminUser.findOne({ email: normalizedEmail });
  const hash = admin?.passwordHash ?? (await getDummyHash());
  const passwordMatches = await verifyPassword(password, hash);
  const success = admin !== null && passwordMatches;

  await LoginAttempt.create({ email: normalizedEmail, successful: success });

  if (!success) {
    return {
      ok: false,
      error: { code: 'invalid_credentials', message: 'Invalid email or password' },
    };
  }

  return {
    ok: true,
    session: {
      adminId: admin._id.toString(),
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    },
  };
}

// --- Password change (Req 20.8, 20.9, 20.10) ------------------------------

/**
 * Change an administrator's password.
 *
 *  - Unknown admin → `not_found`.
 *  - Wrong current password → `invalid_current_password`; the stored password
 *    is left unchanged (Req 20.9).
 *  - New password outside the 8–128 policy → `weak_password`; unchanged
 *    (Req 20.10).
 *  - Otherwise persists the new bcrypt hash (Req 20.8).
 */
export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  await connectToDatabase();

  const admin = await AdminUser.findById(adminId);
  if (!admin) {
    return {
      ok: false,
      error: { code: 'not_found', message: 'Administrator not found' },
    };
  }

  const currentMatches = await verifyPassword(currentPassword, admin.passwordHash);
  if (!currentMatches) {
    return {
      ok: false,
      error: {
        code: 'invalid_current_password',
        field: 'currentPassword',
        message: 'Current password is incorrect',
      },
    };
  }

  if (!isValidPasswordPolicy(newPassword)) {
    return {
      ok: false,
      error: {
        code: 'weak_password',
        field: 'newPassword',
        message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
      },
    };
  }

  admin.passwordHash = await hashPassword(newPassword);
  await admin.save();

  return { ok: true };
}
