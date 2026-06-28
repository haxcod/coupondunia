/**
 * `/api/admin/categories` — admin category collection endpoint (Task 15.1).
 *
 *   GET  → list every category (active + inactive) for the admin table (Req 15.1)
 *   POST → create a category from a validated body (Req 15.3–15.6)
 *
 * Both methods are guarded by `requireAdminSession()`; an unauthenticated
 * request receives HTTP 401 and mutates nothing (Req 13.8). The body is
 * validated with the shared `categorySchema`; on failure the per-field error
 * envelope is returned with 400 (Req 15.4). The catalog mutation derives the
 * slug (Req 15.5), rejects duplicate slugs via the unique index, defaults the
 * meta title (Req 15.9), and revalidates the affected cache tags.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { createCategory, listAdminCategories } from '@/lib/catalog';
import { categorySchema, validate } from '@/lib/validation';

export async function GET(): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  try {
    const categories = await listAdminCategories();
    return NextResponse.json({ categories }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = validate(categorySchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const category = await createCategory(result.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
