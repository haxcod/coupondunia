/**
 * Click_Service (Task 5.1).
 *
 * Logs an anonymous Click_Event, atomically increments the matching Product or
 * Deal click count, and returns the (server-side-only) Affiliate_URL /
 * destination URL so the public surface can open it in a new tab.
 *
 * Contract (design "lib/click-service.ts"): `handleClick` resolves an active
 * record and persists the event + increment inside a *single* MongoDB
 * transaction, so concurrent clicks are never lost (Req 7.4, 9.2) and a failed
 * transaction leaves neither the event nor the increment behind (Req 9.3).
 *
 * Error mapping (design HTTP contract / Req 7.10, 9.4-9.6, 21.3/21.4):
 *   - unknown / inactive identifier   → {@link ClickNotFoundError}  (HTTP 404)
 *   - missing/oversized/invalid field → {@link ClickValidationError} (HTTP 400)
 *   - transaction failure (rolled back) → {@link ClickServerError}  (HTTP 500)
 *
 * Privacy (Req 27.1/27.2): the persisted event carries NO personally
 * identifiable information. We only ever write the fields the `ClickEvent`
 * schema declares (which has no PII field and uses `strict: 'throw'`), the
 * `referrer` is capped at 2048 chars, the `userAgent` at 1024 chars, and any
 * absent value defaults to an empty string (Req 7.2/7.3, 9.1).
 */
import { Types } from 'mongoose';

import { withTransaction } from '@/lib/db';
import { ClickEvent, Deal, Product } from '@/lib/models';
import {
  MAX_REFERRER_LENGTH,
  MAX_USER_AGENT_LENGTH,
  type ClickType,
  type DeviceType,
} from '@/lib/models/types';
import { clickPayloadSchema } from '@/lib/validation';

// Re-export the click-related types so consumers (route handlers, tests) can
// import them directly from the service module alongside `handleClick`.
export type { ClickType, DeviceType };

// --- Types ----------------------------------------------------------------

/**
 * Input to {@link handleClick}. `deviceType` is optional: when omitted it is
 * derived from `userAgent` via {@link deriveDeviceType}. The route handler
 * (Task 9.2) may pass an already-derived value.
 */
export interface ClickInput {
  type: ClickType;
  id: string;
  referrer?: string;
  userAgent?: string;
  deviceType?: DeviceType;
}

/** Successful click result: the non-empty destination URL to open (Req 7.5, 9.4). */
export interface ClickResult {
  affiliateUrl: string;
}

// --- Errors ---------------------------------------------------------------

/** Base class for Click_Service errors carrying the HTTP status to surface. */
export abstract class ClickError extends Error {
  abstract readonly status: 400 | 404 | 500;
}

/** Malformed payload: missing/oversized identifier or missing required field → 400. */
export class ClickValidationError extends ClickError {
  readonly status = 400 as const;
  /** The offending field, when a specific one can be identified (Req 9.6). */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ClickValidationError';
    this.field = field;
  }
}

/** Identifier matches no active Product/Deal → 404 (no event, no increment). */
export class ClickNotFoundError extends ClickError {
  readonly status = 404 as const;

  constructor(message = 'No active record matches the supplied identifier.') {
    super(message);
    this.name = 'ClickNotFoundError';
  }
}

/** Transaction failed and was rolled back → 500 (Req 9.3). */
export class ClickServerError extends ClickError {
  readonly status = 500 as const;

  constructor(message = 'The click could not be recorded.') {
    super(message);
    this.name = 'ClickServerError';
  }
}

// --- Device-type derivation ----------------------------------------------

// Order matters: tablets frequently also match the generic "mobile" token, so
// classify tablets first.
const TABLET_RE = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i;
const MOBILE_RE = /mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i;

/**
 * Derive a coarse {@link DeviceType} from a User-Agent string. Returns
 * `'unknown'` for an empty/absent UA so the event still records a defined value.
 */
export function deriveDeviceType(userAgent?: string): DeviceType {
  const ua = (userAgent ?? '').trim();
  if (ua === '') return 'unknown';
  if (TABLET_RE.test(ua)) return 'tablet';
  if (MOBILE_RE.test(ua)) return 'mobile';
  return 'desktop';
}

// --- Helpers --------------------------------------------------------------

/** Cap a possibly-undefined string to `max` chars, defaulting absent to ''. */
function capString(value: string | undefined, max: number): string {
  if (!value) return '';
  return value.length > max ? value.slice(0, max) : value;
}

// --- Service --------------------------------------------------------------

/**
 * Handle a click: validate, resolve the active record, then persist the event
 * and increment the click count atomically, returning the destination URL.
 *
 * @throws {ClickValidationError} malformed payload (400)
 * @throws {ClickNotFoundError}   unknown/inactive identifier (404)
 * @throws {ClickServerError}     transaction failure, rolled back (500)
 */
export async function handleClick(input: ClickInput): Promise<ClickResult> {
  // 1. Validate the payload shape (id present & ≤64 chars, valid type). A
  //    failure identifies the invalid field and yields a 400 (Req 9.6).
  const parsed = clickPayloadSchema.safeParse({
    type: input.type,
    id: input.id,
    referrer: input.referrer,
    userAgent: input.userAgent,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? String(issue.path[0]) : undefined;
    throw new ClickValidationError(
      issue?.message ?? 'The click payload is invalid.',
      field,
    );
  }

  const { type, id } = parsed.data;

  // A present-but-malformed identifier matches no active record: treat it as a
  // 404 (not a 400 — it is neither missing nor oversized), without any mutation.
  if (!Types.ObjectId.isValid(id)) {
    throw new ClickNotFoundError();
  }
  const recordId = new Types.ObjectId(id);

  // 2. Normalize the event metadata: derive device type, cap referrer/userAgent,
  //    default missing values to '' — and write ONLY these non-PII fields.
  const deviceType = input.deviceType ?? deriveDeviceType(input.userAgent);
  const referrer = capString(input.referrer, MAX_REFERRER_LENGTH);
  const userAgent = capString(input.userAgent, MAX_USER_AGENT_LENGTH);

  let result: ClickResult;
  try {
    result = await withTransaction(async (session) => {
      // 3. Resolve the active record inside the transaction. If it is missing or
      //    inactive, throw NotFound so the transaction aborts with no writes
      //    (Req 7.10, 9.5): no event persisted, no count modified.
      let url: string;
      if (type === 'product') {
        const product = await Product.findOne(
          { _id: recordId, status: 'active' },
          { affiliateUrl: 1 },
          { session },
        ).lean();
        if (!product) throw new ClickNotFoundError();
        url = product.affiliateUrl;
      } else {
        const deal = await Deal.findOne(
          { _id: recordId, status: 'active' },
          { destinationUrl: 1 },
          { session },
        ).lean();
        if (!deal) throw new ClickNotFoundError();
        url = deal.destinationUrl;
      }

      // The destination URL must be non-empty (Req 9.4); a blank one indicates
      // corrupt data and is treated as a server-side failure (rolled back).
      if (!url || url.trim() === '') {
        throw new ClickServerError('The resolved destination URL is empty.');
      }

      // 4a. Persist the anonymous Click_Event (array form is required so the
      //     write joins the session/transaction).
      await ClickEvent.create(
        [
          {
            clickType: type,
            productId: type === 'product' ? recordId : null,
            dealId: type === 'deal' ? recordId : null,
            deviceType,
            referrer,
            userAgent,
          },
        ],
        { session },
      );

      // 4b. Atomically increment the matching record's click count by exactly 1
      //     in the SAME transaction so concurrent clicks are never lost
      //     (Req 7.4, 9.2). `$inc` is applied server-side, avoiding read-modify-
      //     write races.
      const updateResult =
        type === 'product'
          ? await Product.updateOne(
              { _id: recordId, status: 'active' },
              { $inc: { clickCount: 1 } },
              { session },
            )
          : await Deal.updateOne(
              { _id: recordId, status: 'active' },
              { $inc: { clickCount: 1 } },
              { session },
            );
      if (updateResult.modifiedCount !== 1) {
        // The record disappeared/deactivated between the read and the update;
        // abort so nothing is half-applied.
        throw new ClickNotFoundError();
      }

      return { affiliateUrl: url };
    });
  } catch (err) {
    // Known, intentional outcomes propagate unchanged so the route handler can
    // map them to 404 / 400 / 500.
    if (err instanceof ClickError) throw err;
    // Any other failure means the transaction was rolled back (Req 9.3) → 500.
    throw new ClickServerError(
      err instanceof Error ? err.message : 'The click could not be recorded.',
    );
  }

  return result;
}
