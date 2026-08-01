"use client";

/**
 * Admin dashboard (client) — Task 15.5, Req 14.1–14.7, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10): this component fetches all
 * dashboard data on mount from the session-guarded admin APIs and renders it.
 *
 *   - `GET /api/admin/analytics` (default 30-day window) → metric "clicks today",
 *     the 30-day daily series (Req 14.3), clicks-by-category (Req 14.5), and the
 *     top products/deals used for the bar charts (Req 14.4).
 *   - `GET /api/admin/products|deals` (pageSize 1) → total counts (Req 14.1).
 *   - `GET /api/admin/categories` → category list (count + zero-fill the
 *     clicks-by-category chart so every category appears, Req 14.1/14.5).
 *   - `GET /api/admin/events?limit=50` → the 50 most recent click events
 *     (Req 14.6).
 *
 * Every metric defaults to 0 and every chart/table renders an empty state when
 * there is no data (Req 14.1/14.7).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { HBarChart, LineChart, type BarDatum } from "./charts";

const TOP_LIMIT = 10;

/** Window covered by the dashboard's line chart (Req 14.3). */
const TRAILING_DAYS = 30;

// --- JSON-shaped views of the analytics report (Dates arrive as strings) ---

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
interface AnalyticsView {
  clicksToday: number;
  dailySeries: DailyPointView[];
  clicksByCategory: CategoryClicksView[];
  topProducts: TopEntityView[];
  topDeals: TopEntityView[];
}
interface CategoryRowView {
  id: string;
  name: string;
}
interface RecentEventView {
  id: string;
  createdAt: string;
  clickType: "product" | "deal";
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  itemName: string;
  slug: string | null;
}

interface DashboardData {
  analytics: AnalyticsView;
  categories: CategoryRowView[];
  productTotal: number;
  dealTotal: number;
  events: RecentEventView[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}.`);
  }
  return (await res.json()) as T;
}

function formatTimestamp(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DEVICE_LABELS: Record<RecentEventView["deviceType"], string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
  unknown: "Unknown",
};

export default function DashboardClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [analytics, productsPage, dealsPage, categoriesRes, eventsRes] =
          await Promise.all([
            getJson<AnalyticsView>("/api/admin/analytics?preset=30d"),
            getJson<{ total: number }>("/api/admin/products?pageSize=1"),
            getJson<{ total: number }>("/api/admin/deals?pageSize=1"),
            getJson<{ categories: CategoryRowView[] }>("/api/admin/categories"),
            getJson<{ events: RecentEventView[] }>(
              "/api/admin/events?limit=50",
            ),
          ]);

        if (cancelled) return;
        setState({
          status: "ready",
          data: {
            analytics,
            categories: categoriesRes.categories ?? [],
            productTotal: productsPage.total ?? 0,
            dealTotal: dealsPage.total ?? 0,
            events: eventsRes.events ?? [],
          },
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "We could not load the dashboard. Please try again.",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-secondary">
            Catalog size and engagement at a glance.
          </p>
        </div>
        <QuickActions />
      </div>

      {state.status === "loading" && <DashboardSkeleton />}

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
        >
          {state.message}
        </div>
      )}

      {state.status === "ready" && <DashboardBody data={state.data} />}
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const { analytics, categories, productTotal, dealTotal, events } = data;

  const dailySeries = useMemo(
    () =>
      analytics.dailySeries
        .slice(-TRAILING_DAYS)
        .map((p) => ({ date: p.date, value: p.clicks })),
    [analytics.dailySeries],
  );

  const topProducts = useMemo<BarDatum[]>(
    () =>
      analytics.topProducts.slice(0, TOP_LIMIT).map((p) => ({
        key: p.id,
        label: p.label,
        sublabel: p.slug,
        value: p.periodClicks,
      })),
    [analytics.topProducts],
  );

  const topDeals = useMemo<BarDatum[]>(
    () =>
      analytics.topDeals.slice(0, TOP_LIMIT).map((d) => ({
        key: d.id,
        label: d.label,
        sublabel: d.slug,
        value: d.periodClicks,
      })),
    [analytics.topDeals],
  );

  // Merge clicks-by-category over the FULL category list so every category
  // appears, defaulting to 0 clicks (Req 14.5).
  const categoryBars = useMemo<BarDatum[]>(() => {
    const clicksById = new Map(
      analytics.clicksByCategory.map((c) => [c.categoryId, c.clicks]),
    );
    return categories
      .map((c) => ({
        key: c.id,
        label: c.name,
        value: clicksById.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [analytics.clicksByCategory, categories]);

  return (
    <div className="space-y-6">
      {/* Metric cards (Req 14.1) */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Products"
            value={productTotal}
            icon={
              <MetricIcon>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </MetricIcon>
            }
          />
          <MetricCard
            label="Deals"
            value={dealTotal}
            icon={
              <MetricIcon>
                <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </MetricIcon>
            }
          />
          <MetricCard
            label="Categories"
            value={categories.length}
            icon={
              <MetricIcon>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </MetricIcon>
            }
          />
          <MetricCard
            label="Clicks today"
            value={analytics.clicksToday}
            icon={
              <MetricIcon>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74" />
                <path d="M14 10.5a2.5 2.5 0 0 1 5 0v1.5a8 8 0 0 1-8 8 7 7 0 0 1-7-7c0-1 .3-1.5 1-2l3-3" />
              </MetricIcon>
            }
          />
        </div>
      </section>

      {/* 30-day clicks line chart (Req 14.3) */}
      <Panel
        title="Clicks — last 30 days"
        description="Total product and deal clicks per day."
      >
        <LineChart data={dailySeries} caption="Total clicks per day, last 30 days" />
      </Panel>

      {/* Top products / deals (Req 14.4) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Top 10 products" description="By clicks in the last 30 days.">
          <HBarChart
            data={topProducts}
            caption="Top products by clicks in the last 30 days"
            emptyMessage="No product clicks recorded yet."
          />
        </Panel>
        <Panel title="Top 10 deals" description="By clicks in the last 30 days.">
          <HBarChart
            data={topDeals}
            caption="Top deals by clicks in the last 30 days"
            emptyMessage="No deal clicks recorded yet."
          />
        </Panel>
      </div>

      {/* Clicks by category (Req 14.5) */}
      <Panel
        title="Clicks by category"
        description="Includes every category, last 30 days."
      >
        <HBarChart
          data={categoryBars}
          caption="Clicks grouped by category, last 30 days"
          emptyMessage="No categories yet."
        />
      </Panel>

      {/* Recent events table (Req 14.6) */}
      <Panel
        title="Recent click events"
        description="The 50 most recent clicks, newest first."
      >
        <RecentEventsTable events={events} />
      </Panel>
    </div>
  );
}

function RecentEventsTable({ events }: { events: readonly RecentEventView[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-secondary">No click events recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Time
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Item
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Type
            </th>
            <th scope="col" className="py-2 font-medium">
              Device
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap py-2 pr-4 text-secondary tabular-nums">
                {formatTimestamp(event.createdAt)}
              </td>
              <td className="py-2 pr-4 text-foreground">
                {event.itemName ? (
                  <span title={event.itemName}>{event.itemName}</span>
                ) : (
                  <span className="text-muted">(removed item)</span>
                )}
              </td>
              <td className="py-2 pr-4">
                <span className="inline-flex items-center rounded-badge bg-border px-2 py-0.5 text-xs font-medium capitalize text-foreground">
                  {event.clickType}
                </span>
              </td>
              <td className="py-2 text-secondary">
                {DEVICE_LABELS[event.deviceType]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Quick-action controls to add a Product, Deal, or Category (Req 14.7). */
function QuickActions() {
  const actions = [
    { href: "/admin/products/new", label: "Add product" },
    { href: "/admin/deals/new", label: "Add deal" },
    { href: "/admin/categories/new", label: "Add category" },
    { href: "/admin/banners/new", label: "Add banner" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function MetricIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {children}
    </svg>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-secondary">{label}</span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-accent/10 text-accent">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </p>
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
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
