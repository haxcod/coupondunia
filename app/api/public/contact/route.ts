/**
 * `POST /api/public/contact` — contact-form submission (Req 12.2–12.4, 12.6,
 * 21.5, 21.6).
 *
 * Flow:
 *   1. Parse the JSON body (malformed JSON → 400 with the `{ error }` envelope).
 *   2. Validate Name/Email/Subject/Message against the shared `contactSchema`
 *      (single source of truth, client + server). On failure return 400 and the
 *      per-field error envelope without persisting or emailing (Req 12.5).
 *   3. Persist the `ContactMessage` (Req 12.3). A persistence failure returns
 *      500 and prompts the visitor to retry (Req 12.6).
 *   4. Best-effort admin notification email via Nodemailer. The send is wrapped
 *      in try/catch and MUST NOT roll back the persisted message: if the email
 *      fails the `ContactMessage` is retained (Req 12.6 / 21.6) and the request
 *      still succeeds.
 *
 * The notification recipient is the admin `contactEmail` from Settings, falling
 * back to `CONTACT_NOTIFICATION_EMAIL` / `ADMIN_EMAIL` env vars.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { connectToDatabase } from '@/lib/db';
import { sendContactNotification } from '@/lib/mailer';
import { ContactMessage } from '@/lib/models';
import { getSettings } from '@/lib/settings';
import { contactSchema, validate, type ErrorEnvelope } from '@/lib/validation';

/** Build the standard `{ error: { field?, message } }` envelope response. */
function errorResponse(
  message: string,
  status: number,
  field?: string,
): NextResponse<ErrorEnvelope> {
  const error = field === undefined ? { message } : { field, message };
  return NextResponse.json<ErrorEnvelope>({ error }, { status });
}

/**
 * Resolve the admin notification recipient: prefer the configured Settings
 * `contactEmail`, then env fallbacks. Returns `null` when none is configured
 * (the caller then skips the email entirely).
 */
async function resolveRecipient(): Promise<string | null> {
  try {
    const settings = await getSettings();
    if (settings.contactEmail) return settings.contactEmail;
  } catch (err) {
    console.error('[contact] failed to read settings for recipient', err);
  }
  return (
    process.env.CONTACT_NOTIFICATION_EMAIL ?? process.env.ADMIN_EMAIL ?? null
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Parse the request body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  // 2. Validate against the shared contact schema (Req 12.2, 12.3, 12.5).
  const result = validate(contactSchema, body);
  if (!result.success) {
    return NextResponse.json<ErrorEnvelope>(
      { error: result.error },
      { status: 400 },
    );
  }

  const { name, email, subject, message } = result.data;

  // 3. Persist the ContactMessage (Req 12.3). Failure → 500 / retry (Req 12.6).
  try {
    await connectToDatabase();
    await ContactMessage.create({ name, email, subject, message });
  } catch (err) {
    console.error('[contact] failed to persist ContactMessage', err);
    return errorResponse(
      'We could not save your message. Please try again.',
      500,
    );
  }

  // 4. Best-effort admin notification. A send failure never discards the
  //    persisted message (Req 12.6 / 21.6).
  try {
    const recipient = await resolveRecipient();
    if (recipient) {
      await sendContactNotification({ recipient, name, email, subject, message });
    } else {
      console.warn(
        '[contact] no admin recipient configured; skipping notification email',
      );
    }
  } catch (err) {
    console.error(
      '[contact] admin notification email failed; message retained',
      err,
    );
  }

  // The message is captured (and retained) regardless of email outcome.
  return NextResponse.json({ success: true }, { status: 201 });
}
