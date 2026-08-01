/**
 * `/api/admin/settings` — administrator settings read + per-section update
 * (Task 15.2, Req 20.1–20.4, 20.6–20.10, 13.8).
 *
 * Every method is guarded by {@link requireAdminSession}: a missing/invalid
 * session yields HTTP 401 and mutates nothing (Req 13.8). The authoritative
 * server-side session check lives here (Proxy only performs an optimistic
 * cookie-presence redirect for the admin pages).
 *
 * Contract:
 *
 *   - `GET /api/admin/settings`
 *       → `200 SettingsDTO` — the current settings singleton (or schema
 *         defaults when none has been persisted yet). The admin panel reads the
 *         uncached {@link loadSettings} so an editor always sees authoritative,
 *         freshly-written values.
 *
 *   - `PUT /api/admin/settings` (alias: `PATCH`)
 *       Per-section update discriminated by a required `section` field in the
 *       JSON body (chosen over sub-routes so the whole settings surface lives
 *       behind one handler). The remaining body fields are validated by that
 *       section's Zod schema and persisted via the matching `update*` mutation,
 *       which also revalidates the dependent cache tags.
 *
 *         · `{ section: 'site',      ... }` → siteSettingsSchema      → updateSiteSettings      (Req 20.1)
 *         · `{ section: 'seo',       ... }` → seoSettingsSchema       → updateSeoSettings       (Req 20.3)
 *         · `{ section: 'social',    ... }` → socialLinksSchema       → updateSocialLinks       (Req 20.4/20.6)
 *         · `{ section: 'affiliate', ... }` → affiliateSettingsSchema → updateAffiliateSettings (Req 20.7)
 *         · `{ section: 'password',  ... }` → passwordChangeSchema    → changePassword          (Req 20.8–20.10)
 *
 *       A validation failure returns `400 { error: { field?, message } }`
 *       identifying the offending field (Req 20.2/20.6). The site/seo/social/
 *       affiliate sections return `200 SettingsDTO`; the password section
 *       returns `200 { ok: true }` on success (Req 20.8), `400 { error: { field:
 *       'currentPassword', ... } }` when the current password is wrong (Req
 *       20.9), and `400 { error: { field: 'newPassword', ... } }` when the new
 *       password violates the length policy (Req 20.10).
 *
 * Route Handlers are uncached for non-GET methods and these read the request
 * body / session cookie, so the handler always runs dynamically.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { changePassword } from '@/lib/auth';
import {
  loadSettings,
  updateAffiliateSettings,
  updateSeoSettings,
  updateSiteSettings,
  updateSocialLinks,
} from '@/lib/settings';
import {
  affiliateSettingsSchema,
  passwordChangeSchema,
  seoSettingsSchema,
  siteSettingsSchema,
  socialLinksSchema,
  validate,
} from '@/lib/validation';
import type { ErrorEnvelope } from '@/lib/validation/errors';

/** Build the standard `{ error: { field?, message } }` envelope. */
function errorEnvelope(message: string, field?: string): ErrorEnvelope {
  return { error: field === undefined ? { message } : { field, message } };
}

/** The settings sections that can be updated independently. */
const SETTINGS_SECTIONS = [
  'site',
  'seo',
  'social',
  'affiliate',
  'password',
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

function isSettingsSection(value: unknown): value is SettingsSection {
  return (
    typeof value === 'string' &&
    (SETTINGS_SECTIONS as readonly string[]).includes(value)
  );
}

/**
 * `GET /api/admin/settings` — return the current settings singleton (or schema
 * defaults). Reads the uncached loader so admins see authoritative values.
 */
export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }

  const settings = await loadSettings();
  return NextResponse.json(settings, { status: 200 });
}

/**
 * Apply a single settings-form update, discriminated by `body.section`.
 * Shared by `PUT` and `PATCH`.
 */
async function applyUpdate(
  request: NextRequest,
  adminId: string,
): Promise<NextResponse> {
  // Parse the JSON body. A malformed/empty body is a 400.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      errorEnvelope('The request body must be valid JSON.'),
      { status: 400 },
    );
  }

  const section = (body as { section?: unknown })?.section;
  if (!isSettingsSection(section)) {
    return NextResponse.json(
      errorEnvelope(
        'A valid "section" of "site", "seo", "social", "affiliate", or "password" is required.',
        'section',
      ),
      { status: 400 },
    );
  }

  switch (section) {
    case 'site': {
      const result = validate(siteSettingsSchema, body);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const dto = await updateSiteSettings(result.data);
      return NextResponse.json(dto, { status: 200 });
    }
    case 'seo': {
      const result = validate(seoSettingsSchema, body);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const dto = await updateSeoSettings(result.data);
      return NextResponse.json(dto, { status: 200 });
    }
    case 'social': {
      const result = validate(socialLinksSchema, body);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const dto = await updateSocialLinks(result.data);
      return NextResponse.json(dto, { status: 200 });
    }
    case 'affiliate': {
      const result = validate(affiliateSettingsSchema, body);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const dto = await updateAffiliateSettings(result.data);
      return NextResponse.json(dto, { status: 200 });
    }
    case 'password': {
      // Shape/length validation first (Req 20.10 new-password policy is also
      // enforced server-side by changePassword, but failing fast here yields
      // the per-field envelope the form expects).
      const result = validate(passwordChangeSchema, body);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const outcome = await changePassword(
        adminId,
        result.data.currentPassword,
        result.data.newPassword,
      );
      if (outcome.ok) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      switch (outcome.error.code) {
        case 'invalid_current_password':
          // Wrong current password → 400 identifying the field (Req 20.9).
          return NextResponse.json(
            errorEnvelope(outcome.error.message, outcome.error.field),
            { status: 400 },
          );
        case 'weak_password':
          // New password violates the policy → 400 (Req 20.10).
          return NextResponse.json(
            errorEnvelope(outcome.error.message, outcome.error.field),
            { status: 400 },
          );
        case 'not_found':
        default:
          // The session's admin no longer exists — treat as unauthorized.
          return NextResponse.json(
            errorEnvelope('Administrator account not found.'),
            { status: 404 },
          );
      }
    }
  }
}

/** `PUT /api/admin/settings` — per-section settings update (see module docs). */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }
  return applyUpdate(request, guard.session.adminId);
}

/** `PATCH /api/admin/settings` — alias for {@link PUT}. */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }
  return applyUpdate(request, guard.session.adminId);
}
