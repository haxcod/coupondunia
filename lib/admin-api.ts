/**
 * Shared helpers for the session-guarded admin catalog API route handlers
 * (Task 15.1, Req 13.8, 15–18).
 *
 * Every admin catalog handler under `/api/admin/{categories,products,deals,
 * banners}` follows the same shape:
 *   1. guard with `requireAdminSession()` → 401 when unauthenticated (Req 13.8);
 *   2. parse the JSON body (malformed JSON → 400);
 *   3. validate it with the shared Zod schema → 400 `{ error: { field?, message } }`;
 *   4. call the catalog mutation and return the created/updated DTO; and
 *   5. translate domain errors to the right status (404 not-found, 409
 *      category-has-dependents, 400 bad id, 500 otherwise).
 *
 * These helpers centralise steps 2 and 5 so the handlers stay small and respond
 * identically.
 */
import { NextResponse } from 'next/server';

import { CategoryHasDependentsError } from '@/lib/models';
import type { ErrorEnvelope } from '@/lib/validation';

/** Build the standard `{ error: { field?, message } }` envelope response. */
export function errorResponse(
  message: string,
  status: number,
  field?: string,
): NextResponse<ErrorEnvelope> {
  const error = field === undefined ? { message } : { field, message };
  return NextResponse.json<ErrorEnvelope>({ error }, { status });
}

/** The result of reading a JSON request body. */
export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse<ErrorEnvelope> };

/**
 * Parse the request's JSON body, returning a ready-to-send 400 envelope when
 * the body is not valid JSON.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: errorResponse('The request body must be valid JSON.', 400),
    };
  }
}

/** True when an error looks like a Mongoose/BSON id-cast failure (bad id). */
function isBadIdError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'CastError' ||
    err.name === 'BSONError' ||
    err.name === 'BSONTypeError' ||
    /must be a single string of 12 bytes|hex string|ObjectId/i.test(err.message)
  );
}

/** True when a mutation threw because the addressed record does not exist. */
function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && /not found/i.test(err.message);
}

/**
 * Map a thrown mutation error to the appropriate HTTP envelope response:
 *   - {@link CategoryHasDependentsError} → 409 Conflict (Req 15.10);
 *   - "… not found." (from update on a missing id) → 404;
 *   - a malformed id (Cast/BSON error) → 400;
 *   - anything else → 500.
 */
export function mutationErrorResponse(
  err: unknown,
): NextResponse<ErrorEnvelope> {
  if (err instanceof CategoryHasDependentsError) {
    return errorResponse(
      'This category cannot be deleted while it has associated products or child categories.',
      409,
    );
  }
  if (isNotFoundError(err)) {
    return errorResponse('The requested record was not found.', 404);
  }
  if (isBadIdError(err)) {
    return errorResponse('The provided identifier is not valid.', 400, 'id');
  }
  console.error('[admin-api] unexpected mutation error', err);
  return errorResponse('An unexpected error occurred. Please try again.', 500);
}
