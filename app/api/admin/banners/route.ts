/**
 * `/api/admin/banners` — admin banner collection endpoint (Task 15.1).
 *
 *   GET  → list every banner (active + inactive), ordered by display order (Req 18.1)
 *   POST → create a banner from a validated body (Req 18.3/18.4)
 *
 * Both methods are guarded by `requireAdminSession()` (Req 13.8). The create
 * body is validated with the shared `bannerSchema` (internal name, banner image
 * URL, and an http(s) link URL all required, Req 18.4). The catalog mutation
 * revalidates the banners + homepage cache tags so the hero carousel refreshes.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { errorResponse, mutationErrorResponse, readJsonBody } from '@/lib/admin-api';
import { createBanner, listAdminBanners } from '@/lib/catalog';
import { bannerSchema, validate } from '@/lib/validation';

export async function GET(): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  try {
    const banners = await listAdminBanners();
    return NextResponse.json({ banners }, { status: 200 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = validate(bannerSchema, parsed.body);
  if (!result.success) {
    return errorResponse(result.error.message, 400, result.error.field);
  }

  try {
    const banner = await createBanner(result.data);
    return NextResponse.json({ banner }, { status: 201 });
  } catch (err) {
    return mutationErrorResponse(err);
  }
}
