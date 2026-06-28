"use client";

/**
 * Admin analytics (client) — Task 15.10, Req 19.1–19.11, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10): this component owns the
 * date-range selector (Req 19.1) and fetches the analytics report from the
 * session-guarded `GET /api/admin/analytics` whenever the range changes.
 *
 *   - Presets `today | 7d | 30d | 3months` map to `?preset=…`; the custom range
 *     maps to `?start=&end=` and is validated client-side with `dateRangeSchema`
 *     (start ≤ end, span ≤ 366 days). An invalid custom range surfaces a
 *     validation message, retains the previous range, and does not recompute
 *     (Req 19.3).
 *   - Renders overview cards (total/today/most-clicked product+deal, Req 19.4),
 *     the daily line chart plus clicks-by-type/device/category charts (Req
 *     19.5), the top products/deals tables and search-query tables (Req
 *     19.7/19.8), each with an empty state when the period has no data
 *     (Req 19.6).
 *   - The CSV export button hits the same range with `&format=csv`, downloads
 *     the attachment, and cancels with an error indication if it fails or runs
 *     past 10 seconds (Req 19.9/19.10).
 *
 * The charts are reused from the dashboard (Task 15.5) rather than duplicated.
 */
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";

import { dateRangeSchema, validate } from "@/lib/validation";
import { HBarChart, LineChart, type BarDatum } from "../dashboard/charts";

// --- JSON-shaped view of the analytics report (Dates arrive as strings) ----

interface DailyPointView {
  date: string;
  clicks: number;
}
interface CategoryClicksView {
  categoryId: string;
  categoryName: string;
  clicks: number;
}
interface TopEntityView {
  id: string;
  label: string;
  slug: string;
  periodClicks: number;
  allTimeClicks: number;
}
interface QueryStatView {
  query: string;
  count: number;
}
type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

interface AnalyticsReportView {
  range: { start: string; end: string };
  totalClicks: number;
  clicksToday: number;
  dailySeries: DailyPointView[];
  clicksByType: { product: number; deal: number };
  clicksByDevice: Record<DeviceType, number>;
  clicksByCategory: CategoryClicksView[];
  topProducts: TopEntityView[];
  topDeals: TopEntityView[];
  topQueries: QueryStatView[];
  zeroResultQueries: QueryStatView[];
  mostClickedProduct: TopEntityView | null;
  mostClickedDeal: TopEntityView | null;
}

type Preset = "today" | "7d" | "30d" | "3months" | "custom";

const PRESETS: ReadonlyArray<{ value: Preset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3months", label: "3 months" },
  { value: "custom", label: "Custom" },
];

const DEVICE_ORDER: ReadonlyArray<DeviceType> = [
  "mobile",
  "tablet",
  "desktop",
  "unknown",
];
const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
  unknown: "Unknown",
};

/** CSV export is cancelled if it does not finish within 10 seconds (Req 19.10). */
const EXPORT_TIMEOUT_MS = 10_000;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: AnalyticsReportView };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}.`);
  }
  return (await res.json()) as T;
}

/** Build the analytics query string for the active range (no `format`). */
function buildRangeQuery(
  preset: Preset,
  custom: { start: string; end: string } | null,
): string {
  if (preset !== "custom" || !custom) {
    return `preset=${preset}`;
  }
  // `type="date"` inputs yield `YYYY-MM-DD`; cover the full inclusive end day.
  const start = `${custom.start}T00:00:00`;
  const end = `${custom.end}T23:59:59.999`;
  return `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
}

/** Today's date as `YYYY-MM-DD`, used as the default custom-range bounds. */
function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AnalyticsClient() {
  const [preset, setPreset] = useState<Preset>("30d");
  // The applied custom range (drives fetches); null until a valid custom apply.
  const [customRange, setCustomRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const rangeQuery = useMemo(
    () => buildRangeQuery(preset, customRange),
    [preset, customRange],
  );

  // Fetch the report whenever the active range changes.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const report = await getJson<AnalyticsReportView>(
          `/api/admin/analytics?${rangeQuery}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setState({ status: "ready", report });
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "We could not load analytics. Please try again.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [rangeQuery]);

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-secondary">
            Click and search engagement for the selected period. No personal
            data is collected.
          </p>
        </div>
        <ExportButton rangeQuery={rangeQuery} disabled={state.status !== "ready"} />
      </div>

      <RangeSelector
        preset={preset}
        customRange={customRange}
        onApplyPreset={(value) => {
          setPreset(value);
        }}
        onApplyCustom={(range) => {
          setCustomRange(range);
          setPreset("custom");
        }}
      />

      <div className="mt-6">
        {state.status === "loading" && <AnalyticsSkeleton />}

        {state.status === "error" && (
          <div
            role="alert"
            className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            {state.message}
          </div>
        )}

        {state.status === "ready" && <AnalyticsBody report={state.report} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date-range selector (Req 19.1, 19.3)
// ---------------------------------------------------------------------------

interface RangeSelectorProps {
  preset: Preset;
  customRange: { start: string; end: string } | null;
  onApplyPreset: (preset: Exclude<Preset, "custom">) => void;
  onApplyCustom: (range: { start: string; end: string }) => void;
}

function RangeSelector({
  preset,
  customRange,
  onApplyPreset,
  onApplyCustom,
}: RangeSelectorProps) {
  const baseId = useId();
  const startId = `${baseId}-start`;
  const endId = `${baseId}-end`;
  const errorId = `${baseId}-range-error`;

  const [draft, setDraft] = useState<{ start: string; end: string }>(() => ({
    start: customRange?.start ?? todayInputValue(),
    end: customRange?.end ?? todayInputValue(),
  }));
  const [error, setError] = useState<string | null>(null);

  const showCustom = preset === "custom";

  function handlePresetClick(value: Preset) {
    if (value === "custom") {
      // Reveal the custom inputs but don't recompute until applied.
      onApplyCustom(
        customRange ?? { start: draft.start, end: draft.end },
      );
      return;
    }
    setError(null);
    onApplyPreset(value);
  }

  function handleApplyCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Mirror the server rule: start ≤ end and span ≤ 366 days (Req 19.3).
    const result = validate(dateRangeSchema, {
      start: `${draft.start}T00:00:00`,
      end: `${draft.end}T23:59:59.999`,
    });
    if (!result.success) {
      // Retain the previous range and do not recompute (Req 19.3).
      setError(result.error.message);
      return;
    }
    setError(null);
    onApplyCustom({ start: draft.start, end: draft.end });
  }

  return (
    <section
      aria-label="Date range"
      className="rounded-card border border-border bg-card p-4"
    >
      <div
        role="group"
        aria-label="Date range presets"
        className="flex flex-wrap gap-2"
      >
        {PRESETS.map((p) => {
          const active = preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={active}
              onClick={() => handlePresetClick(p.value)}
              className={`cursor-pointer rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "bg-accent text-white"
                  : "border border-border bg-card text-foreground hover:bg-border/40"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <form
          noValidate
          onSubmit={handleApplyCustom}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1.5">
            <label
              htmlFor={startId}
              className="block text-sm font-medium text-foreground"
            >
              Start date
            </label>
            <input
              id={startId}
              type="date"
              value={draft.start}
              max={draft.end || undefined}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, start: e.target.value }))
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor={endId}
              className="block text-sm font-medium text-foreground"
            >
              End date
            </label>
            <input
              id={endId}
              type="date"
              value={draft.end}
              min={draft.start || undefined}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, end: e.target.value }))
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
          <button
            type="submit"
            className="cursor-pointer rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Apply
          </button>
          {error && (
            <p id={errorId} role="alert" className="w-full text-sm text-error">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CSV export (Req 19.9/19.10)
// ---------------------------------------------------------------------------

function ExportButton({
  rangeQuery,
  disabled,
}: {
  rangeQuery: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<"idle" | "exporting" | "error">("idle");

  async function handleExport() {
    setState("exporting");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/admin/analytics?${rangeQuery}&format=csv`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}.`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "analytics.csv";

      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setState("idle");
    } catch {
      // Cancelled (timeout) or failed → render an error indication (Req 19.10).
      setState("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled || state === "exporting"}
        className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {state === "exporting" ? "Exporting…" : "Export CSV"}
      </button>
      {state === "error" && (
        <p role="alert" className="text-xs text-error">
          Export failed. Please try again.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report body (Req 19.4–19.8)
// ---------------------------------------------------------------------------

function AnalyticsBody({ report }: { report: AnalyticsReportView }) {
  const hasClicks = report.totalClicks > 0;

  const dailySeries = useMemo(
    () =>
      hasClicks
        ? report.dailySeries.map((p) => ({ date: p.date, value: p.clicks }))
        : [],
    [hasClicks, report.dailySeries],
  );

  const typeBars = useMemo<BarDatum[]>(
    () =>
      hasClicks
        ? [
            {
              key: "product",
              label: "Products",
              value: report.clicksByType.product,
            },
            { key: "deal", label: "Deals", value: report.clicksByType.deal },
          ]
        : [],
    [hasClicks, report.clicksByType],
  );

  const deviceBars = useMemo<BarDatum[]>(
    () =>
      hasClicks
        ? DEVICE_ORDER.map((device) => ({
            key: device,
            label: DEVICE_LABELS[device],
            value: report.clicksByDevice[device] ?? 0,
          }))
        : [],
    [hasClicks, report.clicksByDevice],
  );

  const categoryBars = useMemo<BarDatum[]>(
    () =>
      report.clicksByCategory.map((c) => ({
        key: c.categoryId,
        label: c.categoryName,
        value: c.clicks,
      })),
    [report.clicksByCategory],
  );

  return (
    <div className="space-y-6">
      {/* Overview cards (Req 19.4) */}
      <section aria-label="Overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Total clicks (period)" value={report.totalClicks} />
        <OverviewCard label="Clicks today" value={report.clicksToday} />
        <EntityCard
          label="Most-clicked product"
          entity={report.mostClickedProduct}
          hrefBase="/product"
        />
        <EntityCard
          label="Most-clicked deal"
          entity={report.mostClickedDeal}
          hrefBase="/deal"
        />
      </section>

      {/* Daily clicks line chart (Req 19.5) */}
      <Panel title="Daily clicks" description="Total product and deal clicks per day.">
        <LineChart
          data={dailySeries}
          caption="Total clicks per day for the selected period"
          emptyMessage="No clicks recorded in this period yet."
        />
      </Panel>

      {/* Clicks by type / device (Req 19.5) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Clicks by type" description="Products vs. deals.">
          <HBarChart
            data={typeBars}
            caption="Clicks split by entity type for the selected period"
            emptyMessage="No clicks recorded in this period yet."
          />
        </Panel>
        <Panel title="Clicks by device" description="Device category of each click.">
          <HBarChart
            data={deviceBars}
            caption="Clicks grouped by device for the selected period"
            emptyMessage="No clicks recorded in this period yet."
          />
        </Panel>
      </div>

      {/* Clicks by category (Req 19.5) */}
      <Panel title="Clicks by category" description="Ranked by clicks in the selected period.">
        <HBarChart
          data={categoryBars}
          caption="Clicks grouped by category for the selected period"
          emptyMessage="No category clicks recorded in this period yet."
        />
      </Panel>

      {/* Top products / deals tables (Req 19.7) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Top products" description="At most 20, by period clicks.">
          <TopEntityTable rows={report.topProducts} hrefBase="/product" noun="product" />
        </Panel>
        <Panel title="Top deals" description="At most 20, by period clicks.">
          <TopEntityTable rows={report.topDeals} hrefBase="/deal" noun="deal" />
        </Panel>
      </div>

      {/* Search-query tables (Req 19.8) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Top search queries" description="Most frequent queries, up to 20.">
          <QueryTable
            rows={report.topQueries}
            emptyMessage="No search queries logged in this period yet."
          />
        </Panel>
        <Panel
          title="Zero-result queries"
          description="Queries that returned nothing, up to 20."
        >
          <QueryTable
            rows={report.zeroResultQueries}
            emptyMessage="No zero-result queries in this period."
          />
        </Panel>
      </div>
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-card p-5">
      <span className="text-sm font-medium text-secondary">{label}</span>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function EntityCard({
  label,
  entity,
  hrefBase,
}: {
  label: string;
  entity: TopEntityView | null;
  hrefBase: string;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-5">
      <span className="text-sm font-medium text-secondary">{label}</span>
      {entity ? (
        <>
          <Link
            href={`${hrefBase}/${entity.slug}`}
            className="mt-2 block truncate text-base font-semibold text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            title={entity.label}
          >
            {entity.label}
          </Link>
          <p className="mt-1 text-sm text-secondary tabular-nums">
            {entity.periodClicks.toLocaleString()} clicks this period
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">No clicks yet.</p>
      )}
    </div>
  );
}

function TopEntityTable({
  rows,
  hrefBase,
  noun,
}: {
  rows: readonly TopEntityView[];
  hrefBase: string;
  noun: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-secondary">No {noun} clicks recorded in this period yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              {noun === "product" ? "Product" : "Deal"}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Period
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              All-time
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-4">
                <Link
                  href={`${hrefBase}/${row.slug}`}
                  className="text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  title={row.label}
                >
                  {row.label}
                </Link>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                {row.periodClicks.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums text-secondary">
                {row.allTimeClicks.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueryTable({
  rows,
  emptyMessage,
}: {
  rows: readonly QueryStatView[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-secondary">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Query
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.query} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-4 text-foreground">
                <span title={row.query}>{row.query}</span>
              </td>
              <td className="py-2 text-right tabular-nums text-secondary">
                {row.count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-secondary">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-card border border-border bg-card"
          />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-card border border-border bg-card" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-card border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-card border border-border bg-card" />
      </div>
    </div>
  );
}
