/**
 * `POST /api/public/click` route handler (Task 9.2).
 *
 * Bridges the public surface to the {@link handleClick} Click_Service. The
 * request body carries only `{ type, id }`; the privacy-sensitive event
 * metadata (`referrer`, `userAgent`, and the derived `deviceType`) is read
 * SERVER-SIDE from the request headers so the browser never has to supply —
 * and therefore cannot spoof — it (Req 7.2, 9.1, 27.1/27.2).
 *
 * Response contract (design "HTTP API Contracts" / Req 7.5, 7.10, 9.4-9.6,
 * 21.3/21.4):
 *   - 200 `{ url }`                       — the resolved destination Affiliate_URL
 *   - 400 `{ error: { field?, message } }` — missing/oversized/invalid field
 *   - 404 `{ error: { message } }`         — identifier matches no active record
 *   - 500 `{ error: { message } }`         — transaction failed and rolled back
 *
 * Route Handlers are never cached for non-GET methods, and reading the request
 * body/headers is request-time data, so this handler always runs dynamically.
 */
import { NextResponse, type NextRequest } from 'next/server';

import {
  ClickError,
  ClickServerError,
  ClickValidationError,
  deriveDeviceType,
  handleClick,
  type ClickType,
} from '@/lib/click-service';
import type { ErrorEnvelope } from '@/lib/validation/errors';

/** Build the standard `{ error: { field?, message } }` envelope. */
function errorEnvelope(message: string, field?: string): ErrorEnvelope {
  return { error: field === undefined ? { message } : { field, message } };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse the JSON body. A malformed/empty body is a 400 (no field): it
  //    carries neither a valid `type` nor `id` (Req 21.7).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      errorEnvelope('The request body must be valid JSON.'),
      { status: 400 },
    );
  }

  // The body must be a plain object carrying `type` and `id`. Anything else
  // (array, string, null) cannot satisfy the schema — let the service surface
  // the precise field error.
  const payload =
    typeof body === 'object' && body !== null
      ? (body as { type?: unknown; id?: unknown })
      : {};

  // 2. Derive the event metadata SERVER-SIDE from the request headers. The
  //    Referer header is the (intentionally misspelled) HTTP standard name.
  const referrer = request.headers.get('referer') ?? undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;
  const deviceType = deriveDeviceType(userAgent);

  // 3. Delegate to the Click_Service, which validates, resolves the active
  //    record, and atomically logs the event + increments the count.
  try {
    const { affiliateUrl } = await handleClick({
      type: payload.type as ClickType,
      id: String(payload.id ?? ''),
      referrer,
      userAgent,
      deviceType,
    });

    // 200: the non-empty destination URL the browser opens in a new tab.
    return NextResponse.json({ url: affiliateUrl }, { status: 200 });
  } catch (err) {
    // Map the service's typed errors to their HTTP status + envelope.
    if (err instanceof ClickValidationError) {
      return NextResponse.json(
        errorEnvelope(err.message, err.field),
        { status: 400 },
      );
    }
    if (err instanceof ClickError) {
      // ClickNotFoundError (404) and ClickServerError (500) both expose `status`.
      return NextResponse.json(errorEnvelope(err.message), {
        status: err.status,
      });
    }
    // Defensive fallback: an unexpected error is a server error (Req 9.3).
    return NextResponse.json(
      errorEnvelope(new ClickServerError().message),
      { status: 500 },
    );
  }
}
