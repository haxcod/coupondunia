"use client";

/**
 * Admin deals list (client) — Task 15.8, Req 17.1–17.12, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10): this component fetches the
 * paginated/searchable/filterable/sortable deal list from
 * `GET /api/admin/deals` and renders the management table (Req 17.1). It also
 * drives every list-level mutation against the session-guarded admin deal APIs:
 *
 *   - inline featured / active toggles via the single-deal endpoint (`GET` to
 *     load the full deal, then `PUT` with the one field flipped);
 *   - single delete via `DELETE /api/admin/deals/[id]` behind a confirm;
 *   - bulk activate / deactivate / delete via `POST /api/admin/deals/bulk`, with
 *     a no-selection guard (Req 17.12) and a delete confirmation prompt
 *     (Req 17.11), reporting the count affected (Req 17.10/17.11).
 *
 * Create / edit happen on dedicated routes (`/admin/deals/new`,
 * `/admin/deals/[id]/edit`) rendered by {@link DealForm}.
 *
 * Expiry dates are colour-coded (Req 17.2): past = error, within 7 days =
 * warning, otherwise the normal/active colour.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { StoreLogo } from "@/components/StoreLogo";
import type { DealType, EntityStatus } from "@/lib/models";

const PAGE_SIZE = 25;
const HEADLINE_MAX = 60;

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  coupon_code: "Coupon code",
  direct_deal: "Direct deal",
  bank_card: "Bank-card offer",
  cashback: "Cashback deal",
};

interface DealRowView {
  id: string;
  headline: string;
  slug: string;
  storeId: string;
  storeName: string;
  storeLogoUrl: string | null;
  dealType: DealType;
  couponCode: string | null;
  discountValue: string | null;
  categoryId: string;
  categoryName: string;
  validUntil: string | null;
  featured: boolean;
  status: EntityStatus;
  clickCount: number;
  updatedAt: string;
}

interface DealsPage {
  rows: DealRowView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Editable deal projection returned by `GET /api/admin/deals/[id]` (paise caps). */
interface AdminDealDetail {
  headline: string;
  store: string;
  categoryId: string;
  dealType: DealType;
  couponCode: string | null;
  destinationUrl: string;
  discountValue: string | null;
  buttonLabel: string | null;
  terms: string | null;
  howToUseSteps: string[];
  validFrom: string | null;
  validUntil: string | null;
  minOrderValue: number | null;
  maxDiscountCap: number | null;
  applicableFor: string | null;
  featured: boolean;
  status: EntityStatus;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface Filters {
  search: string;
  categoryId: string;
  status: "" | EntityStatus;
  dealType: "" | DealType;
  sort: "newest" | "oldest" | "clicks";
  page: number;
}

const INITIAL_FILTERS: Filters = {
  search: "",
  categoryId: "",
  status: "",
  dealType: "",
  sort: "newest",
  page: 1,
};

type ExpiryState = "none" | "expired" | "soon" | "active";

/** Classify a deal's expiry for colour coding (Req 17.2). */
function expiryState(validUntil: string | null): ExpiryState {
  if (!validUntil) return "none";
  const until = new Date(validUntil);
  if (Number.isNaN(until.getTime())) return "none";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const untilDay = new Date(
    until.getFullYear(),
    until.getMonth(),
    until.getDate(),
  ).getTime();

  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round((untilDay - startOfToday) / dayMs);

  if (daysUntil < 0) return "expired";
  if (daysUntil <= 7) return "soon";
  return "active";
}

function formatDate(iso: string | null): string {
  if (!iso) return "No expiry";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "—";
  return when.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}.`);
  }
  return (await res.json()) as T;
}

export default function DealsClient() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState<DealsPage | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  // Monotonic request token so a slow earlier fetch can't overwrite a newer one.
  const requestRef = useRef(0);

  // Debounce the free-text search into the active filter (resets to page 1).
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((prev) =>
        prev.search === searchInput.trim()
          ? prev
          : { ...prev, search: searchInput.trim(), page: 1 },
      );
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const loadDeals = useCallback(async () => {
    const token = ++requestRef.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(filters.page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("sort", filters.sort);
    if (filters.search) params.set("search", filters.search);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.status) params.set("status", filters.status);
    if (filters.dealType) params.set("dealType", filters.dealType);

    try {
      const data = await getJson<DealsPage>(
        `/api/admin/deals?${params.toString()}`,
      );
      if (token !== requestRef.current) return;
      setPage(data);
      setSelected(new Set());
    } catch (err) {
      if (token !== requestRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "We could not load deals. Please try again.",
      );
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getJson<{ categories: CategoryOption[] }>(
          "/api/admin/categories",
        );
        if (!cancelled) setCategories(data.categories ?? []);
      } catch {
        // The category filter simply stays empty if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = page?.rows ?? [];
  const allOnPageSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (rows.length > 0 && rows.every((row) => prev.has(row.id))) {
        return new Set();
      }
      return new Set(rows.map((row) => row.id));
    });
  }

  function toggleSelectOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function markPending(id: string, on: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Re-submit a full deal with a single field overridden (toggle helper). */
  async function patchDeal(
    id: string,
    override: Partial<{ featured: boolean; status: EntityStatus }>,
  ) {
    markPending(id, true);
    setNotice(null);
    try {
      const { deal } = await getJson<{ deal: AdminDealDetail }>(
        `/api/admin/deals/${id}`,
      );
      const payload = {
        headline: deal.headline,
        store: deal.store,
        categoryId: deal.categoryId,
        dealType: deal.dealType,
        couponCode: deal.couponCode,
        destinationUrl: deal.destinationUrl,
        discountValue: deal.discountValue,
        buttonLabel: deal.buttonLabel,
        terms: deal.terms,
        howToUseSteps: deal.howToUseSteps,
        validFrom: deal.validFrom,
        validUntil: deal.validUntil,
        minOrderValue:
          deal.minOrderValue === null ? null : deal.minOrderValue / 100,
        maxDiscountCap:
          deal.maxDiscountCap === null ? null : deal.maxDiscountCap / 100,
        applicableFor: deal.applicableFor,
        featured: deal.featured,
        status: deal.status,
        ...override,
      };
      const res = await fetch(`/api/admin/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status}).`);
      await loadDeals();
    } catch {
      setError("We could not update the deal. Please try again.");
    } finally {
      markPending(id, false);
    }
  }

  async function handleDelete(row: DealRowView) {
    const confirmed = window.confirm(
      `Delete the deal "${truncate(row.headline, 60)}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    markPending(row.id, true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/deals/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status}).`);
      setNotice("Deal deleted.");
      await loadDeals();
    } catch {
      setError("We could not delete the deal. Please try again.");
    } finally {
      markPending(row.id, false);
    }
  }

  async function runBulk(action: "activate" | "deactivate" | "delete") {
    setBulkMessage(null);
    setNotice(null);

    // No-selection guard (Req 17.12): show a message, modify nothing.
    if (selected.size === 0) {
      setBulkMessage("No deals are selected.");
      return;
    }

    // Delete confirmation prompt (Req 17.11).
    if (action === "delete") {
      const confirmed = window.confirm(
        `Delete ${selected.size} selected deal${selected.size === 1 ? "" : "s"}? This cannot be undone.`,
      );
      if (!confirmed) return;
    }

    setBulkRunning(true);
    try {
      const res = await fetch("/api/admin/deals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      const body = (await res.json().catch(() => null)) as
        | { affected?: number; error?: { message?: string } }
        | null;
      if (!res.ok) {
        throw new Error(
          body?.error?.message ?? `Bulk action failed (${res.status}).`,
        );
      }
      const count = body?.affected ?? 0;
      const verb =
        action === "delete"
          ? "deleted"
          : action === "activate"
            ? "activated"
            : "deactivated";
      setNotice(`${count} deal${count === 1 ? "" : "s"} ${verb}.`);
      await loadDeals();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The bulk action failed. Please try again.",
      );
    } finally {
      setBulkRunning(false);
    }
  }

  const hasActiveFilters =
    filters.search !== "" ||
    filters.categoryId !== "" ||
    filters.status !== "" ||
    filters.dealType !== "";

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Deals</h1>
          <p className="mt-1 text-sm text-secondary">
            Create, edit, and manage deals and coupons.
          </p>
        </div>
        <Link
          href="/admin/deals/new"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <PlusIcon />
          Add deal
        </Link>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-card border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
            className="cursor-pointer rounded-control p-1 text-success transition-colors duration-200 hover:bg-success/10"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-card border border-error/30 bg-error/10 p-3 text-sm text-error"
        >
          {error}
        </div>
      )}

      {/* Toolbar: search + filters + sort */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-2">
          <label htmlFor="deal-search" className="sr-only">
            Search deals
          </label>
          <input
            id="deal-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by headline, coupon, or store…"
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>

        <select
          aria-label="Filter by category"
          value={filters.categoryId}
          onChange={(e) =>
            setFilters((p) => ({ ...p, categoryId: e.target.value, page: 1 }))
          }
          className="cursor-pointer rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by deal type"
          value={filters.dealType}
          onChange={(e) =>
            setFilters((p) => ({
              ...p,
              dealType: e.target.value as Filters["dealType"],
              page: 1,
            }))
          }
          className="cursor-pointer rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <option value="">All types</option>
          {(Object.keys(DEAL_TYPE_LABELS) as DealType[]).map((type) => (
            <option key={type} value={type}>
              {DEAL_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <div className="flex gap-3">
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) =>
              setFilters((p) => ({
                ...p,
                status: e.target.value as Filters["status"],
                page: 1,
              }))
            }
            className="w-full cursor-pointer rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            aria-label="Sort deals"
            value={filters.sort}
            onChange={(e) =>
              setFilters((p) => ({
                ...p,
                sort: e.target.value as Filters["sort"],
                page: 1,
              }))
            }
            className="w-full cursor-pointer rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="clicks">Most clicks</option>
          </select>
        </div>
      </div>

      {/* Bulk-action bar */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-3 py-2">
        <span className="text-sm text-secondary">
          {selected.size > 0
            ? `${selected.size} selected`
            : "Select deals for bulk actions"}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runBulk("activate")}
            disabled={bulkRunning}
            className="cursor-pointer rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Activate
          </button>
          <button
            type="button"
            onClick={() => runBulk("deactivate")}
            disabled={bulkRunning}
            className="cursor-pointer rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Deactivate
          </button>
          <button
            type="button"
            onClick={() => runBulk("delete")}
            disabled={bulkRunning}
            className="cursor-pointer rounded-control border border-error/40 px-3 py-1.5 text-sm font-medium text-error transition-colors duration-200 hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete
          </button>
        </div>
        {bulkMessage && (
          <span role="alert" className="text-sm font-medium text-warning">
            {bulkMessage}
          </span>
        )}
      </div>

      {/* Table */}
      {loading && !page ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all deals on this page"
                    className="h-4 w-4 cursor-pointer rounded border-border text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Deal
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Coupon
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Discount
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Category
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Expires
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Clicks
                </th>
                <th scope="col" className="px-3 py-3 text-center font-medium">
                  Featured
                </th>
                <th scope="col" className="px-3 py-3 text-center font-medium">
                  Active
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <DealRow
                  key={row.id}
                  row={row}
                  selected={selected.has(row.id)}
                  pending={pending.has(row.id)}
                  onSelect={() => toggleSelectOne(row.id)}
                  onToggleFeatured={() =>
                    patchDeal(row.id, { featured: !row.featured })
                  }
                  onToggleActive={() =>
                    patchDeal(row.id, {
                      status: row.status === "active" ? "inactive" : "active",
                    })
                  }
                  onDelete={() => handleDelete(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {page && page.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-secondary">
            Page {page.page} of {page.totalPages} · {page.total} deals
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page.page <= 1 || loading}
              onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
              className="cursor-pointer rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page.page >= page.totalPages || loading}
              onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              className="cursor-pointer rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DealRow({
  row,
  selected,
  pending,
  onSelect,
  onToggleFeatured,
  onToggleActive,
  onDelete,
}: {
  row: DealRowView;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  onToggleFeatured: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const state = expiryState(row.validUntil);
  const expiryClass =
    state === "expired"
      ? "text-error"
      : state === "soon"
        ? "text-warning"
        : state === "active"
          ? "text-success"
          : "text-muted";

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-3 align-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select deal ${row.headline}`}
          className="h-4 w-4 cursor-pointer rounded border-border text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-start gap-3">
          <StoreLogo name={row.storeName} logoUrl={row.storeLogoUrl} size={36} />
          <div className="min-w-0">
            <p className="font-medium text-foreground" title={row.headline}>
              {truncate(row.headline, HEADLINE_MAX)}
            </p>
            <p className="text-xs text-secondary">
              {row.storeName} · {DEAL_TYPE_LABELS[row.dealType]}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {row.couponCode ? (
          <span className="inline-block rounded-badge border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground">
            {row.couponCode}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {row.discountValue ? (
          <span className="inline-block rounded-badge bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
            {row.discountValue}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-secondary">{row.categoryName || "—"}</td>
      <td className={`whitespace-nowrap px-3 py-3 font-medium ${expiryClass}`}>
        {formatDate(row.validUntil)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-secondary">
        {row.clickCount.toLocaleString()}
      </td>
      <td className="px-3 py-3 text-center">
        <ToggleSwitch
          on={row.featured}
          disabled={pending}
          label={`Toggle featured for ${row.headline}`}
          onChange={onToggleFeatured}
        />
      </td>
      <td className="px-3 py-3 text-center">
        <ToggleSwitch
          on={row.status === "active"}
          disabled={pending}
          label={`Toggle active for ${row.headline}`}
          onChange={onToggleActive}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/admin/deals/${row.id}/edit`}
            aria-label={`Edit ${row.headline}`}
            className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <EditIcon />
          </Link>
          <a
            href={`/deal/${row.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${row.headline} (opens in a new tab)`}
            className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ViewIcon />
          </a>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label={`Delete ${row.headline}`}
            className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-error/10 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <DeleteIcon />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ToggleSwitch({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm font-medium text-foreground">
        {hasFilters ? "No deals match your filters." : "No deals yet."}
      </p>
      <p className="mt-1 text-sm text-secondary">
        {hasFilters
          ? "Try adjusting or clearing the filters above."
          : "Create your first deal to get started."}
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading deals">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-card border border-border bg-card"
        />
      ))}
    </div>
  );
}

/* --- Icons (consistent 24×24 stroke set, ui-ux-pro-max) --- */

function IconBase({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <IconBase>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </IconBase>
  );
}

function CloseIcon() {
  return (
    <IconBase>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconBase>
  );
}

function EditIcon() {
  return (
    <IconBase>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </IconBase>
  );
}

function ViewIcon() {
  return (
    <IconBase>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

function DeleteIcon() {
  return (
    <IconBase>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </IconBase>
  );
}
