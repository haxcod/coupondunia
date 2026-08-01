/**
 * Analytics aggregation (Task 15.3).
 *
 * Implements the admin analytics computation contract (Req 14.1, 14.3, 14.5,
 * 19.2, 19.4, 19.5, 19.7, 19.8, 19.9, 19.11):
 *
 * - **Period totals** — the count of `ClickEvent`s whose `createdAt` falls
 *   within the *inclusive* `[start, end]` instant range (Req 19.2).
 * - **Zero-filled per-day series** — one entry per calendar day in the range
 *   (in the admin time zone), days with no events reported as 0, and the series
 *   always sums to the period total (Req 19.4/19.5, Property 21).
 * - **Clicks by type / device / category**, **top products / deals** by period
 *   clicks, and **search-query stats** (top queries + zero-result queries)
 *   (Req 14.5, 19.7, 19.8).
 * - **CSV export** — RFC-4180 serialization of the aggregates (Req 19.9/19.10).
 *
 * **PII-free (Req 19.11).** `ClickEvent` stores no personally identifiable
 * information (see `lib/models/ClickEvent.ts`), and every output below is built
 * only from non-PII fields (click type, device type, timestamps, entity ids
 * and their public labels). No referrer/user-agent value is ever emitted.
 *
 * ## Pure vs. DB-backed
 *
 * The day-bucketing, reduction, and CSV logic are **pure** functions (they take
 * plain arrays + a range and return values with no I/O) so they can be unit- and
 * property-tested without a database (Property 21, Task 15.4). The DB-backed
 * loaders at the bottom of this file only fetch + normalize documents and then
 * delegate to those pure helpers.
 */
import { connectToDatabase } from '@/lib/db';
import { ClickEvent, Product, Deal, Category, SearchLog } from '@/lib/models';
import {
  DEVICE_TYPES,
  type ClickType,
  type DeviceType,
} from '@/lib/models/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/**
 * Default admin time-zone offset in **minutes east of UTC**. DealSpark targets
 * the Indian market, so the admin day boundaries default to IST (UTC+05:30 =
 * 330 minutes). Loaders accept an explicit offset to override this (Req 19.2).
 */
export const DEFAULT_TZ_OFFSET_MINUTES = 330;

/** Top products/deals tables show at most 20 rows (Req 19.7). */
export const TOP_ENTITY_LIMIT = 20;

/** Top queries / zero-result queries show at most 20 rows each (Req 19.8). */
export const TOP_QUERY_LIMIT = 20;

/** RFC-4180 line terminator used by the CSV serializer. */
export const CSV_NEWLINE = '\r\n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An inclusive `[start, end]` instant range (Req 19.2). */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * The minimal, PII-free shape the pure aggregators operate on. Loaders resolve
 * each event's owning `categoryId` (from its product/deal) before aggregating.
 */
export interface AggregationEvent {
  clickType: ClickType;
  productId: string | null;
  dealId: string | null;
  deviceType: DeviceType;
  /** Resolved category of the clicked product/deal, or null when unknown. */
  categoryId: string | null;
  createdAt: Date;
}

/** One point in the zero-filled per-day series (Req 19.4). */
export interface DailyPoint {
  /** `YYYY-MM-DD` calendar day in the admin time zone. */
  date: string;
  clicks: number;
}

/** Clicks split by entity type (Req 19.5 clicks-by-type chart). */
export interface ClicksByType {
  product: number;
  deal: number;
}

/** Per-category click totals, ranked descending (Req 19.5 clicks-by-category). */
export interface CategoryClicks {
  categoryId: string;
  categoryName: string;
  clicks: number;
}

/** A row in the top-products / top-deals tables (Req 19.7). */
export interface TopEntityRow {
  id: string;
  /** Product title or deal headline. */
  label: string;
  slug: string;
  /** Clicks within the selected period. */
  periodClicks: number;
  /** Lifetime clicks (the stored counter). */
  allTimeClicks: number;
}

/** A search-query statistic row (Req 19.8). */
export interface QueryStat {
  query: string;
  count: number;
}

/** Public metadata for a clickable entity, used to build top-N table rows. */
export interface EntityMeta {
  id: string;
  label: string;
  slug: string;
  allTimeClicks: number;
  createdAt: Date;
}

/** The full analytics report rendered by the admin analytics page. */
export interface AnalyticsReport {
  range: DateRange;
  totalClicks: number;
  clicksToday: number;
  dailySeries: DailyPoint[];
  clicksByType: ClicksByType;
  clicksByDevice: Record<DeviceType, number>;
  clicksByCategory: CategoryClicks[];
  topProducts: TopEntityRow[];
  topDeals: TopEntityRow[];
  topQueries: QueryStat[];
  zeroResultQueries: QueryStat[];
  mostClickedProduct: TopEntityRow | null;
  mostClickedDeal: TopEntityRow | null;
}

// ===========================================================================
// Pure helpers — day bucketing (Req 19.4/19.5, Property 21)
// ===========================================================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * The integer "local day number" of an instant: the number of whole days since
 * the Unix epoch when viewed in a time zone `offsetMinutes` east of UTC. Pure
 * and monotonic in `date`, so ordering of events is preserved across the shift.
 */
export function localDayNumber(
  date: Date,
  offsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): number {
  return Math.floor((date.getTime() + offsetMinutes * 60_000) / MS_PER_DAY);
}

/** Format a local day number as a `YYYY-MM-DD` key. */
export function dayNumberToKey(dayNumber: number): string {
  const d = new Date(dayNumber * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * The `YYYY-MM-DD` calendar day of `date` in the admin time zone (Req 19.2).
 */
export function dayKey(
  date: Date,
  offsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): string {
  return dayNumberToKey(localDayNumber(date, offsetMinutes));
}

/** True when `date` lies within the inclusive `[start, end]` range. */
export function isWithinRange(date: Date, range: DateRange): boolean {
  const t = date.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/**
 * Enumerate every calendar-day key from the range's start day through its end
 * day, inclusive, in the admin time zone. Returns at least one entry whenever
 * `start <= end`.
 */
export function enumerateDayKeys(
  range: DateRange,
  offsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): string[] {
  const startDay = localDayNumber(range.start, offsetMinutes);
  const endDay = localDayNumber(range.end, offsetMinutes);
  const keys: string[] = [];
  for (let day = startDay; day <= endDay; day += 1) {
    keys.push(dayNumberToKey(day));
  }
  return keys;
}

/**
 * Build the **zero-filled per-day series** for `events` over `range` (Req
 * 19.4/19.5). Every calendar day in the range appears exactly once; days with
 * no in-range events report 0. Only events inside the inclusive instant range
 * are counted, so the series always sums to {@link periodTotal} (Property 21).
 */
export function buildDailySeries(
  events: readonly AggregationEvent[],
  range: DateRange,
  offsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!isWithinRange(event.createdAt, range)) continue;
    const key = dayKey(event.createdAt, offsetMinutes);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return enumerateDayKeys(range, offsetMinutes).map((date) => ({
    date,
    clicks: counts.get(date) ?? 0,
  }));
}

/** The number of events whose timestamp falls within the inclusive range. */
export function periodTotal(
  events: readonly AggregationEvent[],
  range: DateRange,
): number {
  let total = 0;
  for (const event of events) {
    if (isWithinRange(event.createdAt, range)) total += 1;
  }
  return total;
}

// ===========================================================================
// Pure helpers — reducers (Req 19.5, 19.7, 19.8)
// ===========================================================================

/** Count in-range events split into product vs. deal clicks (Req 19.5). */
export function aggregateClicksByType(
  events: readonly AggregationEvent[],
): ClicksByType {
  const result: ClicksByType = { product: 0, deal: 0 };
  for (const event of events) {
    if (event.clickType === 'product') result.product += 1;
    else if (event.clickType === 'deal') result.deal += 1;
  }
  return result;
}

/**
 * Count in-range events by device type, zero-filling every known device type so
 * the clicks-by-device chart always has a complete, stable set of buckets
 * (Req 19.5).
 */
export function aggregateClicksByDevice(
  events: readonly AggregationEvent[],
): Record<DeviceType, number> {
  const result = Object.fromEntries(
    DEVICE_TYPES.map((d) => [d, 0]),
  ) as Record<DeviceType, number>;
  for (const event of events) {
    const device: DeviceType = DEVICE_TYPES.includes(event.deviceType)
      ? event.deviceType
      : 'unknown';
    result[device] += 1;
  }
  return result;
}

/**
 * Count in-range events by owning category, ranked by descending clicks with a
 * category-name tiebreak (Req 19.5). Events whose category is unknown (null)
 * are omitted. `categoryNames` maps category id → display name.
 */
export function aggregateClicksByCategory(
  events: readonly AggregationEvent[],
  categoryNames: ReadonlyMap<string, string>,
): CategoryClicks[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.categoryId) continue;
    counts.set(event.categoryId, (counts.get(event.categoryId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([categoryId, clicks]) => ({
      categoryId,
      categoryName: categoryNames.get(categoryId) ?? categoryId,
      clicks,
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks || a.categoryName.localeCompare(b.categoryName),
    );
}

/**
 * Build the top-N table rows for a given click type (Req 19.7). Period clicks
 * are counted per entity from `events`; rows are enriched with public metadata
 * (label, slug, all-time clicks) and ordered by descending period clicks,
 * breaking ties by most recent creation timestamp, then label. Entities with no
 * metadata (e.g. deleted records) are omitted, since each row links to a public
 * page.
 */
export function aggregateTopEntities(
  events: readonly AggregationEvent[],
  kind: ClickType,
  metaById: ReadonlyMap<string, EntityMeta>,
  limit: number = TOP_ENTITY_LIMIT,
): TopEntityRow[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.clickType !== kind) continue;
    const id = kind === 'product' ? event.productId : event.dealId;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const rows: Array<TopEntityRow & { createdAt: number }> = [];
  for (const [id, periodClicks] of counts.entries()) {
    const meta = metaById.get(id);
    if (!meta) continue;
    rows.push({
      id,
      label: meta.label,
      slug: meta.slug,
      periodClicks,
      allTimeClicks: meta.allTimeClicks,
      createdAt: meta.createdAt.getTime(),
    });
  }

  rows.sort(
    (a, b) =>
      b.periodClicks - a.periodClicks ||
      b.createdAt - a.createdAt ||
      a.label.localeCompare(b.label),
  );

  const cap = Math.max(0, Math.trunc(limit));
  return rows.slice(0, cap).map(({ createdAt: _createdAt, ...row }) => row);
}

/**
 * Aggregate logged search queries into the top queries by frequency (Req 19.8).
 * Queries are compared case-insensitively after trimming; the most frequently
 * used original spelling is reported. Ties break alphabetically.
 */
export function aggregateTopQueries(
  logs: ReadonlyArray<{ query: string }>,
  limit: number = TOP_QUERY_LIMIT,
): QueryStat[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const { query } of logs) {
    const trimmed = query.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { display: trimmed, count: 1 });
  }
  const cap = Math.max(0, Math.trunc(limit));
  return [...counts.values()]
    .map(({ display, count }) => ({ query: display, count }))
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, cap);
}

/**
 * Aggregate logged search queries that returned zero results (Req 19.8). A
 * query is counted as zero-result only when **every** logged occurrence (under
 * case-insensitive comparison) returned zero results, so a query that sometimes
 * matched is not flagged. Ranked by descending occurrence count.
 */
export function aggregateZeroResultQueries(
  logs: ReadonlyArray<{ query: string; resultCount: number }>,
  limit: number = TOP_QUERY_LIMIT,
): QueryStat[] {
  const stats = new Map<
    string,
    { display: string; count: number; everMatched: boolean }
  >();
  for (const { query, resultCount } of logs) {
    const trimmed = query.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    const existing = stats.get(key);
    if (existing) {
      existing.count += 1;
      if (resultCount > 0) existing.everMatched = true;
    } else {
      stats.set(key, {
        display: trimmed,
        count: 1,
        everMatched: resultCount > 0,
      });
    }
  }
  const cap = Math.max(0, Math.trunc(limit));
  return [...stats.values()]
    .filter((s) => !s.everMatched)
    .map(({ display, count }) => ({ query: display, count }))
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, cap);
}

// ===========================================================================
// Pure helpers — CSV serialization (Req 19.9/19.10)
// ===========================================================================

/** Escape a single CSV field per RFC 4180 (quote when it contains `,"\r\n`). */
export function escapeCsvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize a header row plus data rows into an RFC-4180 CSV string. */
export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvField).join(','),
  );
  return lines.join(CSV_NEWLINE);
}

/**
 * Serialize a full {@link AnalyticsReport} into a multi-section CSV (Req
 * 19.9/19.10). Sections are separated by a blank line, each with its own header
 * row. The output contains only non-PII analytics data (Req 19.11).
 */
export function analyticsReportToCsv(report: AnalyticsReport): string {
  const sections: string[] = [];

  sections.push(
    toCsv(
      ['Metric', 'Value'],
      [
        ['Range start', report.range.start.toISOString()],
        ['Range end', report.range.end.toISOString()],
        ['Total clicks', report.totalClicks],
        ['Clicks today', report.clicksToday],
        ['Product clicks', report.clicksByType.product],
        ['Deal clicks', report.clicksByType.deal],
        [
          'Most-clicked product',
          report.mostClickedProduct ? report.mostClickedProduct.label : '',
        ],
        [
          'Most-clicked deal',
          report.mostClickedDeal ? report.mostClickedDeal.label : '',
        ],
      ],
    ),
  );

  sections.push(
    toCsv(
      ['Date', 'Clicks'],
      report.dailySeries.map((p) => [p.date, p.clicks]),
    ),
  );

  sections.push(
    toCsv(
      ['Device', 'Clicks'],
      DEVICE_TYPES.map((d) => [d, report.clicksByDevice[d]]),
    ),
  );

  sections.push(
    toCsv(
      ['Category', 'Clicks'],
      report.clicksByCategory.map((c) => [c.categoryName, c.clicks]),
    ),
  );

  sections.push(
    toCsv(
      ['Top product', 'Slug', 'Period clicks', 'All-time clicks'],
      report.topProducts.map((r) => [
        r.label,
        r.slug,
        r.periodClicks,
        r.allTimeClicks,
      ]),
    ),
  );

  sections.push(
    toCsv(
      ['Top deal', 'Slug', 'Period clicks', 'All-time clicks'],
      report.topDeals.map((r) => [
        r.label,
        r.slug,
        r.periodClicks,
        r.allTimeClicks,
      ]),
    ),
  );

  sections.push(
    toCsv(
      ['Top query', 'Count'],
      report.topQueries.map((q) => [q.query, q.count]),
    ),
  );

  sections.push(
    toCsv(
      ['Zero-result query', 'Count'],
      report.zeroResultQueries.map((q) => [q.query, q.count]),
    ),
  );

  return sections.join(CSV_NEWLINE + CSV_NEWLINE);
}

// ===========================================================================
// DB-backed loaders
// ===========================================================================

/** Lean ClickEvent shape projected for analytics (no PII fields selected). */
interface LeanClickEvent {
  clickType: ClickType;
  productId: { toString(): string } | null;
  dealId: { toString(): string } | null;
  deviceType: DeviceType;
  createdAt: Date;
}

interface LeanProductMeta {
  _id: { toString(): string };
  title: string;
  slug: string;
  categoryId: { toString(): string } | null;
  clickCount: number;
  createdAt: Date;
}

interface LeanDealMeta {
  _id: { toString(): string };
  headline: string;
  slug: string;
  categoryId: { toString(): string } | null;
  clickCount: number;
  createdAt: Date;
}

interface LeanCategory {
  _id: { toString(): string };
  name: string;
}

/** Options accepted by the DB-backed analytics loaders. */
export interface LoadAnalyticsOptions {
  /** Admin time-zone offset in minutes east of UTC (defaults to IST, 330). */
  offsetMinutes?: number;
  /** Injectable "now" used for the clicks-today metric (defaults to `new Date()`). */
  now?: Date;
}

/**
 * Count `ClickEvent`s whose `createdAt` falls on the current calendar day in
 * the admin time zone (Req 14.1 "clicks today"). Pure-ish: time zone + now are
 * injectable for tests.
 */
export async function countClicksToday(
  options: LoadAnalyticsOptions = {},
): Promise<number> {
  const offsetMinutes = options.offsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES;
  const now = options.now ?? new Date();
  const today = localDayNumber(now, offsetMinutes);
  const offsetMs = offsetMinutes * 60_000;
  const startMs = today * MS_PER_DAY - offsetMs;
  const start = new Date(startMs);
  const end = new Date(startMs + MS_PER_DAY - 1);

  await connectToDatabase();
  return ClickEvent.countDocuments({
    createdAt: { $gte: start, $lte: end },
  });
}

/**
 * Load and aggregate the full analytics report for `range` (Req 14.1/14.3/14.5,
 * 19.2/19.4/19.5/19.7/19.8). Fetches the in-range click events, resolves each
 * clicked product/deal's category and public metadata, then delegates to the
 * pure aggregators above. The result is entirely PII-free (Req 19.11).
 */
export async function loadAnalytics(
  range: DateRange,
  options: LoadAnalyticsOptions = {},
): Promise<AnalyticsReport> {
  const offsetMinutes = options.offsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES;
  await connectToDatabase();

  // 1. Fetch in-range click events (PII-free projection).
  const rawEvents = await ClickEvent.find({
    createdAt: { $gte: range.start, $lte: range.end },
  })
    .select('clickType productId dealId deviceType createdAt')
    .lean<LeanClickEvent[]>();

  // 2. Resolve metadata for the clicked products and deals.
  const productIds = new Set<string>();
  const dealIds = new Set<string>();
  for (const event of rawEvents) {
    if (event.clickType === 'product' && event.productId) {
      productIds.add(event.productId.toString());
    } else if (event.clickType === 'deal' && event.dealId) {
      dealIds.add(event.dealId.toString());
    }
  }

  const [productMetas, dealMetas] = await Promise.all([
    productIds.size > 0
      ? Product.find({ _id: { $in: [...productIds] } })
          .select('title slug categoryId clickCount createdAt')
          .lean<LeanProductMeta[]>()
      : Promise.resolve([] as LeanProductMeta[]),
    dealIds.size > 0
      ? Deal.find({ _id: { $in: [...dealIds] } })
          .select('headline slug categoryId clickCount createdAt')
          .lean<LeanDealMeta[]>()
      : Promise.resolve([] as LeanDealMeta[]),
  ]);

  const productMetaById = new Map<string, EntityMeta>();
  const productCategory = new Map<string, string | null>();
  for (const p of productMetas) {
    const id = p._id.toString();
    productMetaById.set(id, {
      id,
      label: p.title,
      slug: p.slug,
      allTimeClicks: p.clickCount,
      createdAt: p.createdAt,
    });
    productCategory.set(id, p.categoryId ? p.categoryId.toString() : null);
  }

  const dealMetaById = new Map<string, EntityMeta>();
  const dealCategory = new Map<string, string | null>();
  for (const d of dealMetas) {
    const id = d._id.toString();
    dealMetaById.set(id, {
      id,
      label: d.headline,
      slug: d.slug,
      allTimeClicks: d.clickCount,
      createdAt: d.createdAt,
    });
    dealCategory.set(id, d.categoryId ? d.categoryId.toString() : null);
  }

  // 3. Normalize events into the PII-free aggregation shape, resolving the
  //    owning category of each clicked product/deal.
  const events: AggregationEvent[] = rawEvents.map((event) => {
    const productId =
      event.clickType === 'product' && event.productId
        ? event.productId.toString()
        : null;
    const dealId =
      event.clickType === 'deal' && event.dealId
        ? event.dealId.toString()
        : null;
    const categoryId = productId
      ? productCategory.get(productId) ?? null
      : dealId
        ? dealCategory.get(dealId) ?? null
        : null;
    return {
      clickType: event.clickType,
      productId,
      dealId,
      deviceType: event.deviceType,
      categoryId,
      createdAt: event.createdAt,
    };
  });

  // 4. Resolve category display names for the clicks-by-category chart.
  const categoryIds = new Set<string>();
  for (const event of events) {
    if (event.categoryId) categoryIds.add(event.categoryId);
  }
  const categoryDocs =
    categoryIds.size > 0
      ? await Category.find({ _id: { $in: [...categoryIds] } })
          .select('name')
          .lean<LeanCategory[]>()
      : [];
  const categoryNames = new Map<string, string>();
  for (const c of categoryDocs) {
    categoryNames.set(c._id.toString(), c.name);
  }

  // 5. Fetch in-range search logs for query stats (Req 19.8).
  const searchLogs = await SearchLog.find({
    createdAt: { $gte: range.start, $lte: range.end },
  })
    .select('query resultCount')
    .lean<Array<{ query: string; resultCount: number }>>();

  // 6. Aggregate via the pure helpers.
  const topProducts = aggregateTopEntities(events, 'product', productMetaById);
  const topDeals = aggregateTopEntities(events, 'deal', dealMetaById);
  const clicksToday = await countClicksToday({ offsetMinutes, now: options.now });

  return {
    range,
    totalClicks: periodTotal(events, range),
    clicksToday,
    dailySeries: buildDailySeries(events, range, offsetMinutes),
    clicksByType: aggregateClicksByType(events),
    clicksByDevice: aggregateClicksByDevice(events),
    clicksByCategory: aggregateClicksByCategory(events, categoryNames),
    topProducts,
    topDeals,
    topQueries: aggregateTopQueries(searchLogs),
    zeroResultQueries: aggregateZeroResultQueries(searchLogs),
    mostClickedProduct: topProducts[0] ?? null,
    mostClickedDeal: topDeals[0] ?? null,
  };
}

/**
 * Convenience: load the analytics report for `range` and serialize it to CSV
 * (Req 19.9). Time zone is honored for the day series via `options`.
 */
export async function exportAnalyticsCsv(
  range: DateRange,
  options: LoadAnalyticsOptions = {},
): Promise<string> {
  const report = await loadAnalytics(range, options);
  return analyticsReportToCsv(report);
}

// ===========================================================================
// Recent click-event feed (Req 14.6)
// ===========================================================================

/** Default number of rows in the dashboard's recent-events table (Req 14.6). */
export const RECENT_EVENTS_LIMIT = 50;

/** Hard ceiling so a hostile `?limit=` cannot request an unbounded scan. */
const RECENT_EVENTS_MAX = 200;

/**
 * One row of the dashboard's "most recent click events" table (Req 14.6).
 * PII-free: only the click type, device type, timestamp, and the clicked
 * item's public label/slug are exposed — never referrer/user-agent (Req 19.11).
 */
export interface RecentEventRow {
  id: string;
  /** ISO-8601 instant the click was recorded. */
  createdAt: string;
  clickType: ClickType;
  deviceType: DeviceType;
  /** Product title / deal headline, or `''` when the item no longer exists. */
  itemName: string;
  /** Public slug for linking, or `null` when the item no longer exists. */
  slug: string | null;
}

interface LeanRecentClick {
  _id: { toString(): string };
  clickType: ClickType;
  productId: { toString(): string } | null;
  dealId: { toString(): string } | null;
  deviceType: DeviceType;
  createdAt: Date;
}

interface LeanNamedProduct {
  _id: { toString(): string };
  title: string;
  slug: string;
}

interface LeanNamedDeal {
  _id: { toString(): string };
  headline: string;
  slug: string;
}

/**
 * Load the `limit` most recent click events ordered by descending timestamp
 * (Req 14.6), resolving each event's clicked product/deal to a public label and
 * slug. The result is PII-free (Req 19.11): no referrer or user-agent value is
 * read or returned. Events whose item has since been deleted keep an empty
 * label so the table still renders gracefully (Req 14.7).
 */
export async function loadRecentEvents(
  limit: number = RECENT_EVENTS_LIMIT,
): Promise<RecentEventRow[]> {
  const cap = Number.isFinite(limit)
    ? Math.min(Math.max(1, Math.trunc(limit)), RECENT_EVENTS_MAX)
    : RECENT_EVENTS_LIMIT;

  await connectToDatabase();
  const docs = await ClickEvent.find({})
    .sort({ createdAt: -1, _id: -1 })
    .limit(cap)
    .select('clickType productId dealId deviceType createdAt')
    .lean<LeanRecentClick[]>();

  const productIds = new Set<string>();
  const dealIds = new Set<string>();
  for (const d of docs) {
    if (d.clickType === 'product' && d.productId) {
      productIds.add(d.productId.toString());
    } else if (d.clickType === 'deal' && d.dealId) {
      dealIds.add(d.dealId.toString());
    }
  }

  const [products, deals] = await Promise.all([
    productIds.size > 0
      ? Product.find({ _id: { $in: [...productIds] } })
          .select('title slug')
          .lean<LeanNamedProduct[]>()
      : Promise.resolve([] as LeanNamedProduct[]),
    dealIds.size > 0
      ? Deal.find({ _id: { $in: [...dealIds] } })
          .select('headline slug')
          .lean<LeanNamedDeal[]>()
      : Promise.resolve([] as LeanNamedDeal[]),
  ]);

  const productById = new Map<string, { name: string; slug: string }>();
  for (const p of products) {
    productById.set(p._id.toString(), { name: p.title, slug: p.slug });
  }
  const dealById = new Map<string, { name: string; slug: string }>();
  for (const d of deals) {
    dealById.set(d._id.toString(), { name: d.headline, slug: d.slug });
  }

  return docs.map((d) => {
    let itemName = '';
    let slug: string | null = null;
    if (d.clickType === 'product' && d.productId) {
      const meta = productById.get(d.productId.toString());
      if (meta) {
        itemName = meta.name;
        slug = meta.slug;
      }
    } else if (d.clickType === 'deal' && d.dealId) {
      const meta = dealById.get(d.dealId.toString());
      if (meta) {
        itemName = meta.name;
        slug = meta.slug;
      }
    }
    return {
      id: d._id.toString(),
      createdAt: d.createdAt.toISOString(),
      clickType: d.clickType,
      deviceType: d.deviceType,
      itemName,
      slug,
    };
  });
}
