/**
 * `/api/admin/deals` — admin deal collection endpoint (Task 15.1).
 *
 *   GET  → paginated/searchable/filterable/sortable deal list (Req 17.1)
 *   POST → create a deal from a validated body (Req 17.3–17.9)
 *
 * Both methods are guarded by `requireAdminSession()` (Req 13.8). The create
 * body is validated with the shared `dealSchema`, which enforces the http(s)
 * destination URL (Req 17.3/17.4), the coupon-code requirement for coupon-code
 * deals (Req 17.7), and the valid-from ≤ valid-until ordering (Req 17.9). The
 * catalog mutation auto-creates the store and revalidates the affected tags.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import {
  ADMIN_DEAL_SORTS,
  createDeal,
  listAdminDeals,
  type AdminDealQuery,
} from '@/lib/catalog';
import { DEAL_TYPES, ENTITY_STATUSES } from '@/lib/models';
import { dealSchema, validate } from '@/lib/validation';

/** Coerce/validate the list query params (Req 17.1). Unknown/invalid → 400. */
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().trim().min(1).optional(),
  storeId: z.string().trim().min(1).optional(),
  status: z.enum(ENTITY_STATUSES as readonly [string, ...string[]]).optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  dealType: z.enum(DEAL_TYPES as readonly [string, ...string[]]).optional(),
  sort: z.enum(ADMIN_DEAL_SORTS).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const candidate: Record<string, string> = {};
  for (const key of [
    'page',
    'pageSize',
    'search',
    'categoryId',
    'storeId',
    'status',
    'featured',
    'dealType',
    'sort',
  ]) {
    const value = params.get(key);
    if (value !== null) candidate[key] = value;
  }

  const parsed = listQuerySchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse(
      issue?.message ?? 'Invalid query parameter.',
      400,
      issue?.path.join('.') || undefined,
    );
  }

  try {
    const page = await listAdminDeals(parsed.data as AdminDealQuery);
    return NextResponse.json(page, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = validate(dealSchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const deal = await createDeal(result.data);
    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
