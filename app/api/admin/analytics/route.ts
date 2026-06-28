/**
 * `GET /api/admin/analytics` — administrator analytics report + CSV export
 * (Task 15.2, Req 19.1–19.4, 19.9, 19.10, 13.8).
 *
 * Guarded by {@link requireAdminSession}: a missing/invalid session yields HTTP
 * 401 and computes nothing (Req 13.8).
 *
 * Date range (Req 19.1/19.2/19.3) is resolved from query parameters:
 *
 *   - `?preset=today|7d|30d|3months` — a rolling window ending "now", computed
 *     in the administrator's time zone (IST by default). `today` covers the
 *     current calendar day from its local start through now.
 *   - `?preset=custom&start=<ISO>&end=<ISO>` — or simply `?start=&end=` — a
 *     custom range validated by {@link dateRangeSchema}: start ≤ end and a span
 *     of at most 366 days (Req 19.3). A malformed/over-long range → `400`.
 *   - When neither a preset nor an explicit range is supplied, the handler
 *     defaults to the `30d` preset.
 *
 * Output format:
 *
 *   - default → `200 application/json` with the full {@link AnalyticsReport}.
 *   - `?format=csv` → `200 text/csv` with a `Content-Disposition: attachment`
 *     filename, serialized via {@link exportAnalyticsCsv} (Req 19.9/19.10). The
 *     CSV (like the JSON) contains only non-PII analytics data (Req 19.11).
 *
 * Route Handlers that read request-specific data (`searchParams`) and query the
 * database run at request time and are never prerendered.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { requireAdminSession } from '@/lib/admin-guard';
import {
  DEFAULT_TZ_OFFSET_MINUTES,
  exportAnalyticsCsv,
  loadAnalytics,
  type DateRange,
} from '@/lib/analytics';
import {
  analyticsPresetSchema,
  dateRangeSchema,
  validate,
  type AnalyticsPreset,
} from '@/lib/validation';
import type { ErrorEnvelope } from '@/lib/validation/errors';

const MS_PER_DAY = 86_400_000;

/** Build the standard `{ error: { field?, message } }` envelope. */
function errorEnvelope(message: string, field?: string): ErrorEnvelope {
  return { error: field === undefined ? { message } : { field, message } };
}

/** The instant marking the start of `now`'s calendar day in the admin time zone. */
function startOfAdminDay(now: Date): Date {
  const offsetMs = DEFAULT_TZ_OFFSET_MINUTES * 60_000;
  const dayNumber = Math.floor((now.getTime() + offsetMs) / MS_PER_DAY);
  return new Date(dayNumber * MS_PER_DAY - offsetMs);
}

/**
 * Translate a non-custom preset into a concrete inclusive `[start, end]` range
 * ending at `now` (Req 19.1). All produced ranges have a span well within the
 * 366-day cap (Req 19.3).
 */
function presetRange(preset: Exclude<AnalyticsPreset, 'custom'>, now: Date): DateRange {
  switch (preset) {
    case 'today':
      return { start: startOfAdminDay(now), end: now };
    case '7d':
      return { start: new Date(now.getTime() - 7 * MS_PER_DAY), end: now };
    case '30d':
      return { start: new Date(now.getTime() - 30 * MS_PER_DAY), end: now };
    case '3months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return { start, end: now };
    }
  }
}

type RangeResolution =
  | { ok: true; range: DateRange }
  | { ok: false; response: NextResponse };

/**
 * Resolve the analytics date range from the request's query parameters,
 * returning either the range or a ready-to-send `400` for a malformed input.
 */
function resolveRange(params: URLSearchParams, now: Date): RangeResolution {
  const presetParam = params.get('preset');
  const startParam = params.get('start');
  const endParam = params.get('end');

  // Explicit preset (today/7d/30d/3months/custom).
  if (presetParam !== null) {
    const parsedPreset = analyticsPresetSchema.safeParse(presetParam);
    if (!parsedPreset.success) {
      return {
        ok: false,
        response: NextResponse.json(
          errorEnvelope(
            'A valid "preset" of "today", "7d", "30d", "3months", or "custom" is required.',
            'preset',
          ),
          { status: 400 },
        ),
      };
    }
    if (parsedPreset.data !== 'custom') {
      return { ok: true, range: presetRange(parsedPreset.data, now) };
    }
    // 'custom' falls through to the start/end validation below.
  }

  // Custom range (explicit preset=custom, or a bare start/end pair).
  if (presetParam === 'custom' || startParam !== null || endParam !== null) {
    const result = validate(dateRangeSchema, {
      start: startParam ?? undefined,
      end: endParam ?? undefined,
    });
    if (!result.success) {
      return {
        ok: false,
        response: NextResponse.json({ error: result.error }, { status: 400 }),
      };
    }
    return { ok: true, range: { start: result.data.start, end: result.data.end } };
  }

  // Nothing supplied — default to the last 30 days.
  return { ok: true, range: presetRange('30d', now) };
}

/** `YYYY-MM-DD` UTC date key used to build the CSV download filename. */
function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest): Promise<Response> {
  // Authoritative session guard (Req 13.8): 401 and compute nothing.
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }

  const params = request.nextUrl.searchParams;
  const now = new Date();

  const resolved = resolveRange(params, now);
  if (!resolved.ok) {
    return resolved.response;
  }
  const { range } = resolved;

  // CSV export branch (Req 19.9/19.10): stream a text/csv attachment.
  if (params.get('format') === 'csv') {
    const csv = await exportAnalyticsCsv(range, { now });
    const filename = `analytics-${dateStamp(range.start)}-${dateStamp(range.end)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // Default: JSON analytics report.
  const report = await loadAnalytics(range, { now });
  return NextResponse.json(report, { status: 200 });
}
