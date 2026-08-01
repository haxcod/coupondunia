"use client";

/**
 * Admin products list (client) — Task 15.7, Req 16.1–16.3, 16.9, 16.15, 16.16,
 * 25.10.
 *
 * The admin panel is client-rendered (Req 25.10). This component owns the whole
 * products table experience:
 *
 *   - fetches a page of 25 products from `GET /api/admin/products` with the
 *     active search / category / status / featured filters and sort applied as
 *     query params (Req 16.1/16.2);
 *   - renders the table (image, 60-char title, category, store, current price,
 *     discount %, a featured toggle, an active toggle, total clicks, last
 *     updated, and edit/view/delete controls) or an empty state (Req 16.1/16.3);
 *   - toggles `featured`/`status` inline (the status toggle reuses the bulk
 *     endpoint for a single id; the featured toggle re-saves the product);
 *   - performs bulk activate/deactivate/delete on the selected rows behind a
 *     confirmation prompt and reports the count affected (Req 16.9/16.15); and
 *   - exports the full filtered list to a UTF-8 CSV (Req 16.16).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "./icons";

const PAGE_SIZE = 25;
const MAX_FETCH_PAGE_SIZE = 100;

type Sort = "newest" | "oldest" | "clicks" | "price";
type StatusFilter = "" | "active" | "inactive";
type FeaturedFilter = "" | "true" | "false";

interface ProductRow {
  id: string;
  title: string;
  slug: string;
  primaryImageUrl: string;
  categoryId: string;
  categoryName: string;
  storeId: string;
  storeName: string;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  featured: boolean;
  status: "active" | "inactive";
  clickCount: number;
  updatedAt: string;
}

interface ProductsPage {
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface Toast {
  kind: "success" | "error";
  message: string;
}

type BulkAction = "activate" | "deactivate" | "delete";

// --- formatting helpers ------------------------------------------------------

/** Render integer paise as an Indian-locale rupee string (e.g. ₹1,299.00). */
function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatDate(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "—";
  return when.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Quote a CSV cell, doubling embedded quotes (RFC 4180). */
function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ProductsClient() {
  // Applied query state (drives fetching).
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [featured, setFeatured] = useState<FeaturedFilter>("");
  const [sort, setSort] = useState<Sort>("newest");

  // Raw search box value (debounced into `search`).
  const [searchInput, setSearchInput] = useState("");

  const [data, setData] = useState<ProductsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<BulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reqId = useRef(0);

  // Debounce the search box → applied `search` (and reset to page 1).
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Load the category filter options once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/categories", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { categories?: CategoryOption[] };
        if (!cancelled) setCategories(body.categories ?? []);
      } catch {
        /* non-fatal: the category filter simply stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQuery = useCallback(
    (pageNumber: number, pageSize: number): string => {
      const params = new URLSearchParams();
      params.set("page", String(pageNumber));
      params.set("pageSize", String(pageSize));
      if (search) params.set("search", search);
      if (categoryId) params.set("categoryId", categoryId);
      if (status) params.set("status", status);
      if (featured) params.set("featured", featured);
      params.set("sort", sort);
      return params.toString();
    },
    [search, categoryId, status, featured, sort],
  );

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products?${buildQuery(page, PAGE_SIZE)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(await readError(res, "We could not load products."));
      }
      const body = (await res.json()) as ProductsPage;
      if (id === reqId.current) {
        setData(body);
        setSelected(new Set());
      }
    } catch (err) {
      if (id === reqId.current) {
        setError(
          err instanceof Error ? err.message : "We could not load products.",
        );
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [buildQuery, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(handle);
  }, [toast]);

  const rows = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- inline status toggle (reuses the bulk endpoint for a single id) -------
  async function toggleStatus(row: ProductRow) {
    const next = row.status === "active" ? "inactive" : "active";
    setPendingRow(row.id);
    // optimistic
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === row.id ? { ...r, status: next } : r,
            ),
          }
        : prev,
    );
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: next === "active" ? "activate" : "deactivate",
          ids: [row.id],
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Update failed."));
    } catch (err) {
      // revert
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === row.id ? { ...r, status: row.status } : r,
              ),
            }
          : prev,
      );
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Update failed.",
      });
    } finally {
      setPendingRow(null);
    }
  }

  // --- inline featured toggle (re-saves the product) -------------------------
  async function toggleFeatured(row: ProductRow) {
    const next = !row.featured;
    setPendingRow(row.id);
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === row.id ? { ...r, featured: next } : r,
            ),
          }
        : prev,
    );
    try {
      // Load the full record, flip the flag, and re-save (no partial update API).
      const getRes = await fetch(`/api/admin/products/${row.id}`, {
        headers: { Accept: "application/json" },
      });
      if (!getRes.ok) throw new Error(await readError(getRes, "Update failed."));
      const { product } = (await getRes.json()) as {
        product: {
          title: string;
          store: string;
          categoryId: string;
          currentPrice: number;
          originalPrice: number | null;
          primaryImageUrl: string;
          additionalImages: string[];
          description: string;
          keyFeatures: string[];
          affiliateUrl: string;
          buttonLabel: string;
          status: "active" | "inactive";
        };
      };
      const res = await fetch(`/api/admin/products/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: product.title,
          store: product.store,
          categoryId: product.categoryId,
          currentPrice: product.currentPrice / 100,
          originalPrice:
            product.originalPrice === null ? null : product.originalPrice / 100,
          primaryImageUrl: product.primaryImageUrl,
          additionalImages: product.additionalImages,
          description: product.description,
          keyFeatures: product.keyFeatures,
          affiliateUrl: product.affiliateUrl,
          buttonLabel: product.buttonLabel || undefined,
          status: product.status,
          featured: next,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Update failed."));
    } catch (err) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === row.id ? { ...r, featured: row.featured } : r,
              ),
            }
          : prev,
      );
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Update failed.",
      });
    } finally {
      setPendingRow(null);
    }
  }

  // --- single delete (with confirm) ------------------------------------------
  async function deleteRow(row: ProductRow) {
    if (
      !window.confirm(
        `Delete “${truncate(row.title, 60)}”? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setPendingRow(row.id);
    try {
      const res = await fetch(`/api/admin/products/${row.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(await readError(res, "Delete failed."));
      setToast({ kind: "success", message: "Product deleted." });
      await load();
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Delete failed.",
      });
    } finally {
      setPendingRow(null);
    }
  }

  // --- bulk actions ----------------------------------------------------------
  async function runBulk(action: BulkAction) {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Bulk action failed."));
      const body = (await res.json()) as { affected: number };
      const verb =
        action === "delete"
          ? "deleted"
          : action === "activate"
            ? "activated"
            : "deactivated";
      setToast({
        kind: "success",
        message: `${body.affected} product${body.affected === 1 ? "" : "s"} ${verb}.`,
      });
      setConfirm(null);
      await load();
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Bulk action failed.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  // --- CSV export (full filtered list) ---------------------------------------
  async function exportCsv() {
    setExporting(true);
    try {
      const collected: ProductRow[] = [];
      let pageNumber = 1;
      let pages = 1;
      do {
        const res = await fetch(
          `/api/admin/products?${buildQuery(pageNumber, MAX_FETCH_PAGE_SIZE)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(await readError(res, "Export failed."));
        const body = (await res.json()) as ProductsPage;
        collected.push(...body.rows);
        pages = body.totalPages;
        pageNumber += 1;
      } while (pageNumber <= pages);

      const header = [
        "Title",
        "Store",
        "Category",
        "Current Price",
        "Original Price",
        "Discount %",
        "Status",
        "Featured",
        "Total Clicks",
      ];
      const lines = [
        header.map(csvCell).join(","),
        ...collected.map((r) =>
          [
            csvCell(r.title),
            csvCell(r.storeName),
            csvCell(r.categoryName),
            csvCell((r.currentPrice / 100).toFixed(2)),
            csvCell(r.originalPrice === null ? "" : (r.originalPrice / 100).toFixed(2)),
            csvCell(r.discountPercent === null ? "" : r.discountPercent),
            csvCell(r.status),
            csvCell(r.featured ? "yes" : "no"),
            csvCell(r.clickCount),
          ].join(","),
        ),
      ];
      // Prepend a UTF-8 BOM so spreadsheet apps detect the encoding (Req 16.16).
      const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast({
        kind: "success",
        message: `Exported ${collected.length} product${collected.length === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Export failed.",
      });
    } finally {
      setExporting(false);
    }
  }

  const hasActiveFilters = useMemo(
    () => Boolean(search || categoryId || status || featured),
    [search, categoryId, status, featured],
  );

  return (
    <div className="mx-auto max-w-content">
      <Header
        total={total}
        onExport={exportCsv}
        exporting={exporting}
        disableExport={loading || total === 0}
      />

      <Filters
        searchInput={searchInput}
        onSearch={setSearchInput}
        categoryId={categoryId}
        onCategory={(v) => {
          setCategoryId(v);
          setPage(1);
        }}
        status={status}
        onStatus={(v) => {
          setStatus(v);
          setPage(1);
        }}
        featured={featured}
        onFeatured={(v) => {
          setFeatured(v);
          setPage(1);
        }}
        sort={sort}
        onSort={(v) => {
          setSort(v);
          setPage(1);
        }}
        categories={categories}
      />

      {someSelected && (
        <BulkBar
          count={selected.size}
          busy={bulkBusy}
          onAction={(a) => (a === "delete" ? setConfirm("delete") : setConfirm(a))}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="mt-4 overflow-hidden rounded-card border border-border bg-card">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div role="alert" className="p-6 text-sm text-error">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <ProductTable
            rows={rows}
            selected={selected}
            allSelected={allSelected}
            pendingRow={pendingRow}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelect={toggleSelect}
            onToggleStatus={toggleStatus}
            onToggleFeatured={toggleFeatured}
            onDelete={deleteRow}
          />
        )}
      </div>

      {!loading && !error && rows.length > 0 && (
        <Pagination
          page={data?.page ?? 1}
          totalPages={totalPages}
          total={total}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      )}

      {confirm && (
        <ConfirmDialog
          action={confirm}
          count={selected.size}
          busy={bulkBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => runBulk(confirm)}
        />
      )}

      {toast && <ToastBanner toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// --- presentational sub-components -------------------------------------------

function Header({
  total,
  onExport,
  exporting,
  disableExport,
}: {
  total: number;
  onExport: () => void;
  exporting: boolean;
  disableExport: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Products</h1>
        <p className="mt-1 text-sm text-secondary">
          {total.toLocaleString()} product{total === 1 ? "" : "s"} total.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={disableExport || exporting}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </Icon>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
        <Link
          href="/admin/products/new"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Add product
        </Link>
      </div>
    </div>
  );
}

const FIELD_CLASS =
  "rounded-control border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Filters({
  searchInput,
  onSearch,
  categoryId,
  onCategory,
  status,
  onStatus,
  featured,
  onFeatured,
  sort,
  onSort,
  categories,
}: {
  searchInput: string;
  onSearch: (v: string) => void;
  categoryId: string;
  onCategory: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  featured: FeaturedFilter;
  onFeatured: (v: FeaturedFilter) => void;
  sort: Sort;
  onSort: (v: Sort) => void;
  categories: CategoryOption[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="relative sm:col-span-2 lg:col-span-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <Icon>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </Icon>
        </span>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search title or store"
          aria-label="Search products by title or store"
          className={`${FIELD_CLASS} w-full pl-9`}
        />
      </div>

      <label className="sr-only" htmlFor="filter-category">
        Filter by category
      </label>
      <select
        id="filter-category"
        value={categoryId}
        onChange={(e) => onCategory(e.target.value)}
        className={`${FIELD_CLASS} cursor-pointer`}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-status">
        Filter by status
      </label>
      <select
        id="filter-status"
        value={status}
        onChange={(e) => onStatus(e.target.value as StatusFilter)}
        className={`${FIELD_CLASS} cursor-pointer`}
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>

      <label className="sr-only" htmlFor="filter-featured">
        Filter by featured
      </label>
      <select
        id="filter-featured"
        value={featured}
        onChange={(e) => onFeatured(e.target.value as FeaturedFilter)}
        className={`${FIELD_CLASS} cursor-pointer`}
      >
        <option value="">All products</option>
        <option value="true">Featured only</option>
        <option value="false">Not featured</option>
      </select>

      <label className="sr-only" htmlFor="filter-sort">
        Sort products
      </label>
      <select
        id="filter-sort"
        value={sort}
        onChange={(e) => onSort(e.target.value as Sort)}
        className={`${FIELD_CLASS} cursor-pointer`}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="clicks">Most clicks</option>
        <option value="price">Price low to high</option>
      </select>
    </div>
  );
}

function BulkBar({
  count,
  busy,
  onAction,
  onClear,
}: {
  count: number;
  busy: boolean;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
}) {
  const btn =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control border border-accent/30 bg-accent/5 px-4 py-3">
      <span className="text-sm font-medium text-foreground">
        {count} selected
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("activate")}
          className={`${btn} border border-border bg-card text-foreground hover:bg-background`}
        >
          Activate
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("deactivate")}
          className={`${btn} border border-border bg-card text-foreground hover:bg-background`}
        >
          Deactivate
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("delete")}
          className={`${btn} border border-error/40 bg-error/10 text-error hover:bg-error/20`}
        >
          Delete
        </button>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto cursor-pointer text-sm font-medium text-secondary underline-offset-2 hover:text-foreground hover:underline"
      >
        Clear
      </button>
    </div>
  );
}

function ProductTable({
  rows,
  selected,
  allSelected,
  pendingRow,
  onToggleSelectAll,
  onToggleSelect,
  onToggleStatus,
  onToggleFeatured,
  onDelete,
}: {
  rows: ProductRow[];
  selected: Set<string>;
  allSelected: boolean;
  pendingRow: string | null;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onToggleStatus: (row: ProductRow) => void;
  onToggleFeatured: (row: ProductRow) => void;
  onDelete: (row: ProductRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="w-10 px-3 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all products on this page"
                className="h-4 w-4 cursor-pointer accent-accent"
              />
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Product
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Category
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Store
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Price
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Discount
            </th>
            <th scope="col" className="px-3 py-3 text-center font-medium">
              Featured
            </th>
            <th scope="col" className="px-3 py-3 text-center font-medium">
              Active
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Clicks
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Updated
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = pendingRow === row.id;
            return (
              <tr
                key={row.id}
                className="border-b border-border/60 last:border-0 hover:bg-background/60"
              >
                <td className="px-3 py-3 align-middle">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => onToggleSelect(row.id)}
                    aria-label={`Select ${row.title}`}
                    className="h-4 w-4 cursor-pointer accent-accent"
                  />
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.primaryImageUrl}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-control border border-border object-cover"
                    />
                    <span
                      className="font-medium text-foreground"
                      title={row.title}
                    >
                      {truncate(row.title, 60)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 align-middle text-secondary">
                  {row.categoryName || "—"}
                </td>
                <td className="px-3 py-3 align-middle text-secondary">
                  {row.storeName || "—"}
                </td>
                <td className="px-3 py-3 align-middle text-right tabular-nums text-foreground">
                  {formatRupees(row.currentPrice)}
                </td>
                <td className="px-3 py-3 align-middle text-right tabular-nums">
                  {row.discountPercent === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="font-medium text-success">
                      {row.discountPercent}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <ToggleSwitch
                    on={row.featured}
                    busy={busy}
                    label={`Toggle featured for ${row.title}`}
                    onChange={() => onToggleFeatured(row)}
                  />
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <ToggleSwitch
                    on={row.status === "active"}
                    busy={busy}
                    label={`Toggle active for ${row.title}`}
                    onChange={() => onToggleStatus(row)}
                  />
                </td>
                <td className="px-3 py-3 align-middle text-right tabular-nums text-secondary">
                  {row.clickCount.toLocaleString()}
                </td>
                <td className="px-3 py-3 align-middle whitespace-nowrap text-secondary">
                  {formatDate(row.updatedAt)}
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/products/${row.id}/edit`}
                      aria-label={`Edit ${row.title}`}
                      className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Icon>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </Icon>
                    </Link>
                    <a
                      href={`/product/${row.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${row.title} (opens in new tab)`}
                      className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Icon>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </Icon>
                    </a>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={busy}
                      aria-label={`Delete ${row.title}`}
                      className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-error/10 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Icon>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </Icon>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ToggleSwitch({
  on,
  busy,
  label,
  onChange,
}: {
  on: boolean;
  busy: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-badge transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
        on ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-badge bg-white shadow transition-transform duration-200 ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const btn =
    "inline-flex cursor-pointer items-center gap-1 rounded-control border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-secondary tabular-nums">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={page <= 1} className={btn}>
          <Icon>
            <polyline points="15 18 9 12 15 6" />
          </Icon>
          Prev
        </button>
        <span className="text-sm text-secondary tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className={btn}
        >
          Next
          <Icon>
            <polyline points="9 18 15 12 9 6" />
          </Icon>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-control bg-background text-muted">
        <Icon>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </Icon>
      </span>
      <p className="text-base font-medium text-foreground">
        {hasFilters ? "No products match your filters" : "No products yet"}
      </p>
      <p className="mt-1 text-sm text-secondary">
        {hasFilters
          ? "Try adjusting your search or filters."
          : "Create your first product to get started."}
      </p>
    </div>
  );
}

function ConfirmDialog({
  action,
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  action: BulkAction;
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const verb =
    action === "delete"
      ? "delete"
      : action === "activate"
        ? "activate"
        : "deactivate";
  const destructive = action === "delete";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-confirm-title"
    >
      <div className="w-full max-w-md rounded-modal border border-border bg-card p-6 shadow-lg">
        <h2
          id="bulk-confirm-title"
          className="text-lg font-semibold text-foreground"
        >
          Confirm bulk {verb}
        </h2>
        <p className="mt-2 text-sm text-secondary">
          Are you sure you want to {verb} {count} selected product
          {count === 1 ? "" : "s"}?
          {destructive ? " This action cannot be undone." : ""}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex cursor-pointer items-center rounded-control border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex cursor-pointer items-center rounded-control px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
              destructive ? "bg-error hover:bg-error/90" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {busy ? "Working…" : `Yes, ${verb}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-control border px-4 py-3 text-sm shadow-lg ${
        toast.kind === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-error/30 bg-error/10 text-error"
      }`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="cursor-pointer text-current opacity-70 hover:opacity-100"
      >
        <Icon>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </Icon>
      </button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 animate-pulse rounded-control bg-background" />
          <div className="h-4 flex-1 animate-pulse rounded bg-background" />
        </div>
      ))}
    </div>
  );
}
