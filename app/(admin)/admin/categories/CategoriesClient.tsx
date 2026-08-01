"use client";

/**
 * Admin categories list (client) — Task 15.6, Req 15.1, 15.2, 15.10, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10): this component fetches every
 * category (active + inactive) on mount from `GET /api/admin/categories` and
 * renders the admin table showing icon, name, slug, parent, active-product
 * count, an inline active toggle and an inline show-on-homepage toggle, plus
 * edit and delete controls (Req 15.1). When there are no categories it renders
 * an empty state instead of the table (Req 15.2).
 *
 * Inline toggles re-use the full update endpoint: because `PUT` replaces every
 * field, the toggle first loads the complete category via
 * `GET /api/admin/categories/[id]` and re-submits it with only the toggled flag
 * changed, so description/meta/homepage data is never dropped.
 *
 * Delete asks for confirmation, then `DELETE /api/admin/categories/[id]`. A 409
 * dependency-guard rejection (the category still has child categories or
 * products) is surfaced as a friendly inline message (Req 15.10).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { EntityStatus } from "@/lib/models/types";

import {
  type AdminCategoryDetailView,
  type AdminCategoryRow,
  buildCategoryBody,
  Icon,
} from "./category-shared";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}.`);
  }
  return (await res.json()) as T;
}

/** Parse a `{ error: { message } }` envelope, falling back to `fallback`. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function CategoriesClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rows, setRows] = useState<AdminCategoryRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await getJson<{ categories: AdminCategoryRow[] }>(
        "/api/admin/categories",
      );
      setRows(data.categories ?? []);
      setState({ status: "ready" });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "We could not load categories. Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Flip a boolean flag inline by round-tripping the full category through the
   * update endpoint so no other field is lost.
   */
  async function toggleField(
    row: AdminCategoryRow,
    field: "status" | "showOnHomepage",
  ) {
    setBusyId(row.id);
    setNotice(null);
    try {
      const { category } = await getJson<{ category: AdminCategoryDetailView }>(
        `/api/admin/categories/${row.id}`,
      );

      const nextStatus: EntityStatus =
        field === "status"
          ? category.status === "active"
            ? "inactive"
            : "active"
          : category.status;
      const nextHomepage =
        field === "showOnHomepage"
          ? !category.showOnHomepage
          : category.showOnHomepage;

      const body = buildCategoryBody({
        ...category,
        status: nextStatus,
        showOnHomepage: nextHomepage,
      });

      const res = await fetch(`/api/admin/categories/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setNotice({
          kind: "error",
          message: await readError(res, "We could not save your change."),
        });
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: nextStatus, showOnHomepage: nextHomepage }
            : r,
        ),
      );
    } catch {
      setNotice({
        kind: "error",
        message: "We could not reach the server. Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: AdminCategoryRow) {
    const confirmed = window.confirm(
      `Delete the category “${row.name}”? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/categories/${row.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        // 409 → dependency guard; surface the friendly message (Req 15.10).
        setNotice({
          kind: "error",
          message: await readError(
            res,
            "This category could not be deleted.",
          ),
        });
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setNotice({ kind: "success", message: `“${row.name}” was deleted.` });
    } catch {
      setNotice({
        kind: "error",
        message: "We could not reach the server. Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Categories</h1>
          <p className="mt-1 text-sm text-secondary">
            Organise products into browsable, SEO-friendly categories.
          </p>
        </div>
        <Link
          href="/admin/categories/new"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Add category
        </Link>
      </div>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mb-4 rounded-card border p-4 text-sm ${
            notice.kind === "error"
              ? "border-error/30 bg-error/10 text-error"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {notice.message}
        </div>
      )}

      {state.status === "loading" && <ListSkeleton />}

      {state.status === "error" && (
        <div className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error">
          <p>{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex cursor-pointer items-center rounded-control border border-error/40 px-3 py-1.5 font-medium transition-colors duration-200 hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
          >
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" &&
        (rows.length === 0 ? (
          <EmptyState />
        ) : (
          <CategoryTable
            rows={rows}
            busyId={busyId}
            onToggle={toggleField}
            onDelete={handleDelete}
          />
        ))}
    </div>
  );
}

function CategoryTable({
  rows,
  busyId,
  onToggle,
  onDelete,
}: {
  rows: AdminCategoryRow[];
  busyId: string | null;
  onToggle: (
    row: AdminCategoryRow,
    field: "status" | "showOnHomepage",
  ) => void;
  onDelete: (row: AdminCategoryRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-3 font-medium">
              Category
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Parent
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Products
            </th>
            <th scope="col" className="px-4 py-3 text-center font-medium">
              Active
            </th>
            <th scope="col" className="px-4 py-3 text-center font-medium">
              Homepage
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = busyId === row.id;
            return (
              <tr
                key={row.id}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon name={row.name} iconUrl={row.iconUrl} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-secondary">
                        /{row.slug}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-secondary">
                  {row.parentName ?? (
                    <span className="text-muted">— top level</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.activeProductCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={row.status === "active"}
                    disabled={busy}
                    label={`Active status for ${row.name}`}
                    onChange={() => onToggle(row, "status")}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={row.showOnHomepage}
                    disabled={busy}
                    label={`Show ${row.name} on homepage`}
                    onChange={() => onToggle(row, "showOnHomepage")}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/categories/${row.id}/edit`}
                      aria-label={`Edit ${row.name}`}
                      className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Icon>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </Icon>
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={busy}
                      aria-label={`Delete ${row.name}`}
                      className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-error/10 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
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

function CategoryIcon({
  name,
  iconUrl,
}: {
  name: string;
  iconUrl: string | null;
}) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-control border border-border object-cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent/10 text-sm font-semibold text-accent"
    >
      {initial}
    </span>
  );
}

/** Accessible switch styled as a pill toggle. */
function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-border bg-card p-12 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        No categories yet
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-secondary">
        Create your first category to start organising products for visitors to
        browse.
      </p>
      <Link
        href="/admin/categories/new"
        className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </Icon>
        Add category
      </Link>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading categories"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-card border border-border bg-card"
        />
      ))}
    </div>
  );
}
