/**
 * `POST /api/admin/products/bulk` — bulk product actions (Task 15.1, Req 16.15).
 *
 * Body: `{ action: 'activate' | 'deactivate' | 'delete', ids: string[] }`.
 *   - `activate` / `deactivate` set the status of every selected product;
 *   - `delete` removes every selected product (the confirmation prompt is a
 *     client concern, Req 16.15).
 *
 * Guarded by `requireAdminSession()` (Req 13.8). An empty selection is rejected
 * with HTTP 400 and mutates nothing. The response reports the count affected so
 * the panel can confirm the outcome (Req 16.15).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { bulkDeleteProducts, bulkSetProductStatus } from '@/lib/catalog';

const bulkSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete']),
  ids: z.array(z.string().trim().min(1)),
});

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = bulkSchema.safeParse(parsed.body);
  if (!body.success) {
    const issue = body.error.issues[0];
    return errorResponse(
      issue?.message ?? 'A valid bulk action and id list are required.',
      400,
      issue?.path.join('.') || undefined,
    );
  }

  // No-selection guard: reject with 400 and modify nothing (Req 16.15 / 17.12).
  if (body.data.ids.length === 0) {
    return errorResponse('No products are selected.', 400, 'ids');
  }

  try {
    const { action, ids } = body.data;
    const result =
      action === 'delete'
        ? await bulkDeleteProducts(ids)
        : await bulkSetProductStatus(
            ids,
            action === 'activate' ? 'active' : 'inactive',
          );
    return NextResponse.json(
      { action, affected: result.affected },
      { status: 200 },
    );
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
