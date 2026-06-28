"use client";

/**
 * Admin banners list (client) — Task 15.9, Req 18.1, 18.2, 18.6, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10): this component fetches every
 * banner on mount from `GET /api/admin/banners` and renders a table showing a
 * thumbnail, internal name, link destination, an inline active/inactive toggle,
 * a drag-reorderable display order, and edit/delete controls (Req 18.1). When
 * no banners exist it renders an empty state (Req 18.2).
 *
 * Reordering uses native drag-and-drop on the table rows; dropping commits the
 * new arrangement by persisting each banner whose display order changed via
 * update calls (Req 18.6). Toggling status and deleting (behind a confirm)
 * likewise call the guarded admin APIs. All mutations update optimistically and
 * revert on failure.
 */
import { useEffect, useState } from "react";

import {
  ApiError,
  deleteBanner as apiDeleteBanner,
  fetchBanners,
  toBannerInput,
  updateBanner,
  type Banner,
} from "./api";
import BannerForm from "./BannerForm";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

interface FormState {
  open: boolean;
  editing: Banner | null;
}

export default function BannersClient() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [banners, setBanners] = useState<Banner[]>([]);
  const [form, setForm] = useState<FormState>({ open: false, editing: null });
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  // Drag-and-drop reorder state.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await fetchBanners();
        if (cancelled) return;
        setBanners(list);
        setLoad({ status: "ready" });
      } catch (err) {
        if (cancelled) return;
        setLoad({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "We could not load banners. Please try again.",
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function markBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openCreate() {
    setActionError(null);
    setForm({ open: true, editing: null });
  }

  function openEdit(banner: Banner) {
    setActionError(null);
    setForm({ open: true, editing: banner });
  }

  function closeForm() {
    setForm({ open: false, editing: null });
  }

  function handleSaved(saved: Banner) {
    setBanners((prev) => {
      const exists = prev.some((b) => b.id === saved.id);
      const next = exists
        ? prev.map((b) => (b.id === saved.id ? saved : b))
        : [...prev, saved];
      return [...next].sort(
        (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
      );
    });
    closeForm();
  }

  async function handleToggleStatus(banner: Banner) {
    const nextStatus = banner.status === "active" ? "inactive" : "active";
    setActionError(null);
    markBusy(banner.id, true);
    // Optimistic update.
    setBanners((prev) =>
      prev.map((b) => (b.id === banner.id ? { ...b, status: nextStatus } : b)),
    );
    try {
      const updated = await updateBanner(banner.id, {
        ...toBannerInput(banner),
        status: nextStatus,
      });
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      // Revert on failure.
      setBanners((prev) =>
        prev.map((b) => (b.id === banner.id ? banner : b)),
      );
      setActionError(
        err instanceof ApiError
          ? err.message
          : "We could not update the banner status. Please try again.",
      );
    } finally {
      markBusy(banner.id, false);
    }
  }

  async function handleDelete(banner: Banner) {
    const confirmed = window.confirm(
      `Delete the banner "${banner.internalName}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setActionError(null);
    markBusy(banner.id, true);
    const snapshot = banners;
    // Optimistic removal.
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    try {
      await apiDeleteBanner(banner.id);
    } catch (err) {
      setBanners(snapshot);
      setActionError(
        err instanceof ApiError
          ? err.message
          : "We could not delete the banner. Please try again.",
      );
    } finally {
      markBusy(banner.id, false);
    }
  }

  /** Commit a reordered list: persist every banner whose order changed. */
  async function commitReorder(reordered: Banner[]) {
    const renumbered = reordered.map((b, index) => ({
      ...b,
      displayOrder: index,
    }));
    const changed = renumbered.filter((b) => {
      const before = banners.find((x) => x.id === b.id);
      return before && before.displayOrder !== b.displayOrder;
    });
    if (changed.length === 0) {
      setBanners(renumbered);
      return;
    }

    const snapshot = banners;
    setBanners(renumbered);
    setSavingOrder(true);
    setActionError(null);
    try {
      const results = await Promise.all(
        changed.map((b) => updateBanner(b.id, toBannerInput(b))),
      );
      setBanners((prev) => {
        const byId = new Map(results.map((b) => [b.id, b]));
        return prev.map((b) => byId.get(b.id) ?? b);
      });
    } catch (err) {
      setBanners(snapshot);
      setActionError(
        err instanceof ApiError
          ? err.message
          : "We could not save the new order. Please try again.",
      );
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDrop(targetId: string) {
    const sourceId = draggingId;
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const fromIndex = banners.findIndex((b) => b.id === sourceId);
    const toIndex = banners.findIndex((b) => b.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...banners];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    void commitReorder(reordered);
  }

  const nextDisplayOrder =
    banners.length === 0
      ? 0
      : Math.max(...banners.map((b) => b.displayOrder)) + 1;

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Banners</h1>
          <p className="mt-1 text-sm text-secondary">
            Manage the homepage hero carousel. Drag rows to reorder.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <PlusIcon />
          Add banner
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
        >
          {actionError}
        </div>
      )}

      {load.status === "loading" && <ListSkeleton />}

      {load.status === "error" && (
        <div
          role="alert"
          className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
        >
          {load.message}
        </div>
      )}

      {load.status === "ready" &&
        (banners.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <BannerTable
            banners={banners}
            busyIds={busyIds}
            savingOrder={savingOrder}
            draggingId={draggingId}
            dragOverId={dragOverId}
            onDragStart={setDraggingId}
            onDragEnter={setDragOverId}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOverId(null);
            }}
            onDrop={handleDrop}
            onToggle={handleToggleStatus}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}

      {form.open && (
        <BannerForm
          banner={form.editing}
          defaultDisplayOrder={nextDisplayOrder}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface BannerTableProps {
  banners: readonly Banner[];
  busyIds: ReadonlySet<string>;
  savingOrder: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onToggle: (banner: Banner) => void;
  onEdit: (banner: Banner) => void;
  onDelete: (banner: Banner) => void;
}

function BannerTable({
  banners,
  busyIds,
  savingOrder,
  draggingId,
  dragOverId,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onToggle,
  onEdit,
  onDelete,
}: BannerTableProps) {
  return (
    <div className="rounded-card border border-border bg-card">
      {savingOrder && (
        <p
          role="status"
          className="border-b border-border px-4 py-2 text-xs font-medium text-secondary"
        >
          Saving new order…
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="w-10 py-3 pl-4" aria-label="Reorder" />
              <th scope="col" className="py-3 pr-4 font-medium">
                Banner
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                Link
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                Order
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-3 pr-4 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {banners.map((banner) => {
              const busy = busyIds.has(banner.id);
              const isDragging = draggingId === banner.id;
              const isDragOver = dragOverId === banner.id && draggingId !== banner.id;
              return (
                <tr
                  key={banner.id}
                  draggable
                  onDragStart={() => onDragStart(banner.id)}
                  onDragEnter={() => onDragEnter(banner.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={onDragEnd}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(banner.id);
                  }}
                  className={`border-b border-border/60 last:border-0 transition-colors duration-200 ${
                    isDragging ? "opacity-50" : ""
                  } ${isDragOver ? "bg-accent/5" : ""}`}
                >
                  <td className="py-3 pl-4 align-middle">
                    <span
                      className="inline-flex cursor-grab text-muted active:cursor-grabbing"
                      aria-hidden="true"
                      title="Drag to reorder"
                    >
                      <DragIcon />
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-middle">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-background">
                        {banner.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={banner.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-muted" aria-hidden="true">
                            <SmallImageIcon />
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-foreground">
                        {banner.internalName}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 align-middle">
                    {banner.linkUrl ? (
                      <a
                        href={banner.linkUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex max-w-[16rem] items-center gap-1 truncate text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        title={banner.linkUrl}
                      >
                        <span className="truncate">{banner.linkUrl}</span>
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-middle tabular-nums text-secondary">
                    {banner.displayOrder}
                  </td>
                  <td className="py-3 pr-4 align-middle">
                    <StatusToggle
                      banner={banner}
                      busy={busy}
                      onToggle={() => onToggle(banner)}
                    />
                  </td>
                  <td className="py-3 pr-4 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`Edit ${banner.internalName}`}
                        onClick={() => onEdit(banner)}
                        disabled={busy}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        label={`Delete ${banner.internalName}`}
                        onClick={() => onDelete(banner)}
                        disabled={busy}
                        destructive
                      >
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusToggle({
  banner,
  busy,
  onToggle,
}: {
  banner: Banner;
  busy: boolean;
  onToggle: () => void;
}) {
  const active = banner.status === "active";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${banner.internalName} is ${active ? "active" : "inactive"}. Toggle status.`}
      disabled={busy}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-badge px-2.5 py-1 text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "bg-success/15 text-success hover:bg-success/25"
          : "bg-border text-secondary hover:bg-muted/20"
      } cursor-pointer`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${active ? "bg-success" : "bg-muted"}`}
      />
      {active ? "Active" : "Inactive"}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
        destructive ? "hover:bg-error/10 hover:text-error" : "hover:bg-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty / loading states
// ---------------------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-control bg-accent/10 text-accent">
        <SmallImageIcon />
      </span>
      <h2 className="text-base font-semibold text-foreground">
        No banners yet
      </h2>
      <p className="mt-1 max-w-sm text-sm text-secondary">
        You haven&apos;t created any banners. Add one to populate the homepage
        hero carousel.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <PlusIcon />
        Add banner
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div
      className="space-y-3 rounded-card border border-border bg-card p-4"
      aria-busy="true"
      aria-label="Loading banners"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-control border border-border bg-background"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlusIcon() {
  return (
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
  );
}

function DragIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function EditIcon() {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon() {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SmallImageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </svg>
  );
}
