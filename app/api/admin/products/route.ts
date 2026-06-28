/**
 * `/api/admin/products` — admin product collection endpoint (Task 15.1).
 *
 *   GET  → paginated/searchable/filterable/sortable product list (Req 16.1/16.2)
 *   POST → create a product from a validated body (Req 16.4–16.8)
 *
 * Both methods are guarded by `requireAdminSession()` (Req 13.8). The list
 * query is validated and coerced; the create body is validated with the shared
 * `productSchema` (which enforces the original > current price rule, Req 16.7).
 * The catalog mutation auto-creates the store by case-insensitive name match
 * (Req 16.8), computes the discount percent (Req 16.6), derives the slug, and
 * revalidates the affected cache tags.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import {
  ADMIN_PRODUCT_SORTS,
  createProduct,
  listAdminProducts,
  type AdminProductQuery,
} from '@/lib/catalog';
import { ENTITY_STATUSES } from '@/lib/models';
import { productSchema, validate } from '@/lib/validation';

/** Coerce/validate the list query params (Req 16.2). Unknown/invalid → 400. */
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
  sort: z.enum(ADMIN_PRODUCT_SORTS).optional(),
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
    const page = await listAdminProducts(parsed.data as AdminProductQuery);
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

  const result = validate(productSchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const product = await createProduct(result.data);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
