/**
 * `/api/admin/categories/[id]` — admin single-category endpoint (Task 15.1, 15.6).
 *
 *   GET         → load a single category with all editable fields for the edit
 *                 form (Req 15.3, 15.7)
 *   PUT / PATCH → update a category from a validated body (Req 15.3–15.6)
 *   DELETE      → delete a category, enforcing the dependency guard (Req 15.10)
 *
 * All methods are guarded by `requireAdminSession()` (Req 13.8). A delete that
 * is blocked because the category still has products or child categories throws
 * `CategoryHasDependentsError`, which is mapped to HTTP 409 Conflict (Req 15.10).
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { deleteCategory, getAdminCategoryById, updateCategory } from '@/lib/catalog';
import { categorySchema, validate } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

/**
 * GET → load a single category with all administrator-editable fields for the
 * edit form (Req 15.3, 15.7). Returns 404 when the id matches no category and
 * 400 when the id is malformed.
 */
export async function GET(
  _request: NextRequest,
  context: Context,
): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  try {
    const category = await getAdminCategoryById(id);
    if (!category) {
      return errorResponse('The requested record was not found.', 404);
    }
    return NextResponse.json({ category }, { status: 200 });
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

  const result = validate(categorySchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const category = await updateCategory(id, result.data);
    return NextResponse.json({ category }, { status: 200 });
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
    await deleteCategory(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
