// Feature: dealspark — Task 9.6: integration tests for the public contact endpoint.
//
// Exercises the `POST /api/public/contact` route handler end-to-end against a
// *real* MongoDB (the in-memory replica set from `@/test/harness/mongo-memory`).
// We drive the handler with `NextRequest` objects carrying JSON bodies and
// assert on the HTTP response and the persisted `ContactMessage`.
//
// The contact route reads `getSettings()` (a `use cache` boundary) to resolve
// the admin recipient and dispatches a best-effort notification email. Two
// pieces of the Next.js / infra runtime are stubbed so we test the route's own
// logic against a real database:
//   - `next/cache` (cacheTag/cacheLife/revalidateTag) is mocked to no-op so the
//     cached `getSettings` reader runs as a plain DB read in the test runtime.
//   - `@/lib/mailer` `sendContactNotification` is mocked so no real SMTP send
//     happens and we can drive the success / failure paths deterministically.
//
// Coverage:
//   - A valid POST persists a ContactMessage and returns success.
//   - When the mailer throws, the ContactMessage is STILL persisted and the
//     request STILL succeeds (Req 12.6, 21.6) — email is best-effort and never
//     rolls back the captured message.
//
// _Requirements: 12.6, 21.6_

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `getSettings` uses `cacheTag`/`cacheLife`; mock the cache primitives to no-op
// so the cached reader executes as a plain database read in the test runtime.
const cacheTag = vi.fn();
const cacheLife = vi.fn();
const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheTag: (...args: unknown[]) => cacheTag(...args),
  cacheLife: (...args: unknown[]) => cacheLife(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}));

// Mock the mailer so no real email is sent and we can drive both outcomes.
const sendContactNotification = vi.fn();
vi.mock('@/lib/mailer', () => ({
  sendContactNotification: (...args: unknown[]) => sendContactNotification(...args),
}));

import { POST } from '@/app/api/public/contact/route';
import { ContactMessage } from '@/lib/models';
import { writeSettings } from '@/lib/settings';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const ADMIN_EMAIL = 'admin@dealspark.in';

const VALID_BODY = {
  name: 'Aditi Sharma',
  email: 'aditi@example.com',
  subject: 'Question about a deal',
  message: 'Is this coupon still valid for new users?',
};

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  revalidateTag.mockClear();
  sendContactNotification.mockReset();
});

/** Build a `NextRequest` carrying a JSON contact body. */
function contactRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/public/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Configure an admin recipient via the persisted Settings singleton. */
async function seedRecipient(): Promise<void> {
  await writeSettings({ contactEmail: ADMIN_EMAIL });
}

describe('POST /api/public/contact (integration, real MongoDB)', () => {
  it('persists a ContactMessage and returns success for a valid submission', async () => {
    await seedRecipient();
    sendContactNotification.mockResolvedValue(undefined);

    const res = await POST(contactRequest(VALID_BODY));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ success: true });

    // The message is persisted with the submitted fields.
    const persisted = await ContactMessage.findOne({ email: VALID_BODY.email }).lean();
    expect(persisted).not.toBeNull();
    expect(persisted?.name).toBe(VALID_BODY.name);
    expect(persisted?.subject).toBe(VALID_BODY.subject);
    expect(persisted?.message).toBe(VALID_BODY.message);

    // The admin notification was dispatched to the configured recipient.
    expect(sendContactNotification).toHaveBeenCalledTimes(1);
    expect(sendContactNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: ADMIN_EMAIL, email: VALID_BODY.email }),
    );
  });

  it('still persists the message and succeeds when the notification email fails', async () => {
    await seedRecipient();
    // The mailer rejects — simulating an SMTP/network failure.
    sendContactNotification.mockRejectedValue(new Error('SMTP unavailable'));

    const res = await POST(contactRequest(VALID_BODY));

    // The request still succeeds despite the email failure (Req 12.6 / 21.6).
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ success: true });

    // The ContactMessage is retained — the email failure never rolls it back.
    const count = await ContactMessage.countDocuments({ email: VALID_BODY.email });
    expect(count).toBe(1);

    // The failing send was actually attempted.
    expect(sendContactNotification).toHaveBeenCalledTimes(1);
  });

  it('returns 400 and persists nothing for an invalid submission', async () => {
    await seedRecipient();

    const res = await POST(
      contactRequest({ ...VALID_BODY, email: 'not-an-email' }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: { field?: string; message: string } };
    expect(data.error.message).toBeTruthy();

    await expect(ContactMessage.countDocuments({})).resolves.toBe(0);
    expect(sendContactNotification).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await POST(contactRequest('not valid json{'));

    expect(res.status).toBe(400);
    await expect(ContactMessage.countDocuments({})).resolves.toBe(0);
    expect(sendContactNotification).not.toHaveBeenCalled();
  });
});
