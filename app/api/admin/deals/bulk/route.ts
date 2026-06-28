/**
 * `POST /api/admin/deals/bulk` — bulk deal actions (Task 15.1, Req 17.10–17.12).
 *
 * Body: `{ action: 'activate' | 'deactivate' | 'delete', ids: string[] }`.
 *   - `activate` / `deactivate` set the status of every selected deal (Req 17.10);
 *   - `delete` removes every selected deal (the confirmation prompt is a client
 *     concern, Req 17.11).
 *
 * Guarded by `requireAdminSession()` (Req 13.8). An empty selection is rejected
 * with HTTP 400 indicating no deals are selected and mutates nothing (Req 17.12).
 * The response reports the count affected.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { bulkDeleteDeals, bulkSetDealStatus } from '@/lib/catalog';

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

  // No-selection guard: reject with 400 and modify nothing (Req 17.12).
  if (body.data.ids.length === 0) {
    return errorResponse('No deals are selected.', 400, 'ids');
  }

  try {
    const { action, ids } = body.data;
    const result =
      action === 'delete'
        ? await bulkDeleteDeals(ids)
        : await bulkSetDealStatus(
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
