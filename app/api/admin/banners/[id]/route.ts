/**
 * `/api/admin/banners/[id]` — admin single-banner endpoint (Task 15.1).
 *
 *   PUT / PATCH → update a banner from a validated body (Req 18.3/18.4, 18.6)
 *   DELETE      → delete a banner (Req 18.1)
 *
 * All methods are guarded by `requireAdminSession()` (Req 13.8). Updating a
 * banner's display order persists the reordered value (Req 18.6). Updating a
 * missing id maps to HTTP 404; a malformed id maps to HTTP 400.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { deleteBanner, updateBanner } from '@/lib/catalog';
import { bannerSchema, validate } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

async function update(request: NextRequest, context: Context): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = validate(bannerSchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const banner = await updateBanner(id, result.data);
    return NextResponse.json({ banner }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}

export async function PUT(request: NextRequest, context: Context): Promise<Response> {
  return update(request, context);
}

export async function PATCH(request: NextRequest, context: Context): Promise<Response> {
  return update(request, context);
}

export async function DELETE(
  _request: NextRequest,
  context: Context,
): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  try {
    await deleteBanner(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
