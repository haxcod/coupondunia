/**
 * `GET /api/admin/events` — recent click-event feed for the admin dashboard
 * (Task 15.5, Req 14.6, 13.8, 19.11).
 *
 * Guarded by {@link requireAdminSession}: a missing/invalid session yields HTTP
 * 401 and reads nothing (Req 13.8). Returns the `?limit` (default 50, capped)
 * most recent click events ordered by descending timestamp, each resolved to a
 * PII-free row `{ id, createdAt, clickType, deviceType, itemName, slug }`
 * (Req 14.6, 19.11).
 *
 * Route Handlers that read request-specific data and query the database run at
 * request time and are never prerendered.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import { loadRecentEvents, RECENT_EVENTS_LIMIT } from '@/lib/analytics';

export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }

  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsed = limitParam !== null ? Number(limitParam) : RECENT_EVENTS_LIMIT;
  const limit = Number.isFinite(parsed) ? parsed : RECENT_EVENTS_LIMIT;

  const events = await loadRecentEvents(limit);
  return NextResponse.json({ events }, { status: 200 });
}
