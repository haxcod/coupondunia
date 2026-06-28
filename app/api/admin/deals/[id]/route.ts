/**
 * `/api/admin/deals/[id]` — admin single-deal endpoint (Task 15.1, 15.8).
 *
 *   GET         → full editable deal detail for the edit form (Req 17.3–17.9)
 *   PUT / PATCH → update a deal from a validated body (Req 17.3–17.9)
 *   DELETE      → delete a deal (Req 17.1)
 *
 * All methods are guarded by `requireAdminSession()` (Req 13.8). Updating a
 * missing id maps to HTTP 404; a malformed id maps to HTTP 400. The GET
 * projection includes the destination URL because it is only ever returned over
 * this session-guarded admin API, never embedded in public HTML (Req 7.9/24.1).
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { deleteDeal, getAdminDeal, updateDeal } from '@/lib/catalog';
import { dealSchema, validate } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  context: Context,
): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  try {
    const deal = await getAdminDeal(id);
    if (!deal) {
      return errorResponse('The requested record was not found.', 404);
    }
    return NextResponse.json({ deal }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}

async function update(request: NextRequest, context: Context): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = validate(dealSchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const deal = await updateDeal(id, result.data);
    return NextResponse.json({ deal }, { status: 200 });
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
    await deleteDeal(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
