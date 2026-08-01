"use client";

/**
 * Admin category create/edit form (client) — Task 15.6, Req 15.3–15.9, 25.10.
 *
 * Validates input against the shared `categorySchema` for instant client
 * feedback (the server re-validates authoritatively), then submits to
 * `POST /api/admin/categories` (create) or `PUT /api/admin/categories/[id]`
 * (edit). On a name of 1–100 trimmed characters the category persists and a
 * success notice shows before returning to the list (Req 15.3); an invalid name
 * or display order surfaces a field message without persisting (Req 15.4, 15.8).
 *
 * The slug is derived from the name with `generateSlug` for a live preview until
 * the administrator edits it manually (Req 15.5). The icon field uploads through
 * `POST /api/admin/upload` with a live preview, pre-checking type and size on
 * the client (Req 15.7, 15.8). A blank meta title defaults to
 * "[Category] Deals & Coupons | DealSpark" on submit (Req 15.9).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { categorySchema, validate, type FieldError } from "@/lib/validation";
import type { EntityStatus } from "@/lib/models/types";
import { generateSlug } from "@/lib/slug";

import {
  type AdminCategoryDetailView,
  type AdminCategoryRow,
  type CategoryRequestBody,
  defaultMetaTitle,
  Icon,
} from "./category-shared";

/** Client-side mirror of the upload endpoint's accepted types/size (Req 15.8). */
const ACCEPTED_ICON_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const MAX_ICON_BYTES = 5 * 1024 * 1024;

interface FormValues {
  name: string;
  slug: string;
  parentId: string;
  iconUrl: string;
  description: string;
  showOnHomepage: boolean;
  homepageSectionTitle: string;
  displayOrder: string;
  status: EntityStatus;
  metaTitle: string;
  metaDescription: string;
}

const EMPTY_VALUES: FormValues = {
  name: "",
  slug: "",
  parentId: "",
  iconUrl: "",
  description: "",
  showOnHomepage: false,
  homepageSectionTitle: "",
  displayOrder: "0",
  status: "active",
  metaTitle: "",
  metaDescription: "",
};

type FieldName = keyof FormValues;
type FieldErrorMap = Partial<Record<string, string>>;

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

function toFieldErrorMap(fieldErrors: FieldError[]): FieldErrorMap {
  const map: FieldErrorMap = {};
  for (const { field, message } of fieldErrors) {
    const key = field ?? "_form";
    if (!(key in map)) map[key] = message;
  }
  return map;
}

export default function CategoryForm({
  mode,
  categoryId,
}: {
  mode: "create" | "edit";
  categoryId?: string;
}) {
  const router = useRouter();

  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrorMap>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [parents, setParents] = useState<AdminCategoryRow[]>([]);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "load-error"
  >("loading");
  const [iconState, setIconState] = useState<"idle" | "uploading">("idle");
  const [iconError, setIconError] = useState<string | null>(null);

  // Load parent options and (in edit mode) prefill the form on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoadState("loading");
      try {
        const listRes = await fetch("/api/admin/categories", {
          headers: { Accept: "application/json" },
        });
        if (!listRes.ok) throw new Error("list");
        const { categories } = (await listRes.json()) as {
          categories: AdminCategoryRow[];
        };

        let prefill: FormValues | null = null;
        if (mode === "edit" && categoryId) {
          const res = await fetch(`/api/admin/categories/${categoryId}`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error("detail");
          const { category } = (await res.json()) as {
            category: AdminCategoryDetailView;
          };
          prefill = {
            name: category.name,
            slug: category.slug,
            parentId: category.parentId ?? "",
            iconUrl: category.iconUrl ?? "",
            description: category.description ?? "",
            showOnHomepage: category.showOnHomepage,
            homepageSectionTitle: category.homepageSectionTitle ?? "",
            displayOrder: String(category.displayOrder),
            status: category.status,
            metaTitle: category.metaTitle ?? "",
            metaDescription: category.metaDescription ?? "",
          };
        }

        if (cancelled) return;
        setParents(categories ?? []);
        if (prefill) {
          setValues(prefill);
          setSlugEdited(true); // keep the saved slug unless the admin retypes it
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("load-error");
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [mode, categoryId]);

  // Live slug preview derived from the name until the admin edits it (Req 15.5).
  const slugPreview = useMemo(
    () => (slugEdited ? values.slug : generateSlug(values.name)),
    [slugEdited, values.slug, values.name],
  );

  const clearError = useCallback((key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  function setField<K extends FieldName>(field: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearError(field);
  }

  async function handleIconChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file later.
    event.target.value = "";
    if (!file) return;

    setIconError(null);

    if (!(ACCEPTED_ICON_TYPES as readonly string[]).includes(file.type)) {
      setIconError(
        "Unsupported file type. Allowed types are JPEG, PNG, WebP, and GIF.",
      );
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setIconError("File exceeds the maximum allowed size of 5 MB.");
      return;
    }

    setIconState("uploading");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) {
        let message = "We could not upload the image. Please try again.";
        try {
          const payload = (await res.json()) as {
            error?: { message?: string };
          };
          if (payload.error?.message) message = payload.error.message;
        } catch {
          /* non-JSON body */
        }
        setIconError(message);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      setField("iconUrl", url);
    } catch {
      setIconError("We could not reach the server. Please try again.");
    } finally {
      setIconState("idle");
    }
  }

  function buildBody(): { body: CategoryRequestBody; candidate: unknown } {
    const trimmedName = values.name.trim();
    const displayOrderNum =
      values.displayOrder.trim() === ""
        ? Number.NaN
        : Number(values.displayOrder);
    const slug = slugEdited ? values.slug.trim() : slugPreview;
    const metaTitle =
      values.metaTitle.trim() === ""
        ? defaultMetaTitle(trimmedName)
        : values.metaTitle.trim();

    const body: CategoryRequestBody = {
      name: trimmedName,
      slug: slug === "" ? undefined : slug,
      parentId: values.parentId === "" ? null : values.parentId,
      iconUrl: values.iconUrl === "" ? null : values.iconUrl,
      description: values.description.trim() === "" ? null : values.description.trim(),
      showOnHomepage: values.showOnHomepage,
      homepageSectionTitle:
        values.homepageSectionTitle.trim() === ""
          ? null
          : values.homepageSectionTitle.trim(),
      displayOrder: displayOrderNum,
      status: values.status,
      metaTitle,
      metaDescription:
        values.metaDescription.trim() === ""
          ? null
          : values.metaDescription.trim(),
    };
    return { body, candidate: body };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const { body, candidate } = buildBody();

    const result = validate(categorySchema, candidate);
    if (!result.success) {
      setErrors(toFieldErrorMap(result.fieldErrors));
      setSubmit({ status: "idle" });
      return;
    }

    setErrors({});
    setSubmit({ status: "submitting" });

    const url =
      mode === "edit" && categoryId
        ? `/api/admin/categories/${categoryId}`
        : "/api/admin/categories";
    const method = mode === "edit" ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/admin/categories");
        router.refresh();
        return;
      }

      // Surface a server-side field error or a generic message (values kept).
      let message = "We could not save the category. Please try again.";
      try {
        const payload = (await res.json()) as {
          error?: { field?: string; message?: string };
        };
        if (payload.error?.message) message = payload.error.message;
        if (payload.error?.field) {
          setErrors({
            [payload.error.field]:
              payload.error.message ?? "This field is invalid.",
          });
        }
      } catch {
        /* non-JSON body */
      }
      setSubmit({ status: "error", message });
    } catch {
      setSubmit({
        status: "error",
        message:
          "We could not reach the server. Please check your connection and try again.",
      });
    }
  }

  if (loadState === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <div
          className="h-96 animate-pulse rounded-card border border-border bg-card"
          aria-busy="true"
          aria-label="Loading form"
        />
      </div>
    );
  }

  if (loadState === "load-error") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error">
          We could not load this category. It may have been removed.{" "}
          <Link href="/admin/categories" className="font-medium underline">
            Back to categories
          </Link>
        </div>
      </div>
    );
  }

  const isSubmitting = submit.status === "submitting";
  // A parent cannot be its own parent in edit mode.
  const parentOptions = parents.filter((p) => p.id !== categoryId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/admin/categories"
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-secondary transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </Icon>
          Categories
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {mode === "edit" ? "Edit category" : "New category"}
        </h1>
      </div>

      {submit.status === "error" && (
        <div
          role="alert"
          className="mb-5 rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
        >
          {submit.message}
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSubmit}
        className="space-y-6 rounded-card border border-border bg-card p-5 sm:p-6"
      >
        <TextField
          id="cat-name"
          label="Name"
          required
          value={values.name}
          error={errors.name}
          maxLength={100}
          disabled={isSubmitting}
          onChange={(v) => setField("name", v)}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="cat-slug"
            className="block text-sm font-medium text-foreground"
          >
            Slug
          </label>
          <input
            id="cat-slug"
            name="slug"
            type="text"
            value={slugPreview}
            maxLength={200}
            disabled={isSubmitting}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={errors.slug ? "cat-slug-error" : "cat-slug-help"}
            onChange={(e) => {
              setSlugEdited(true);
              setField("slug", e.target.value);
            }}
            className={controlClasses(Boolean(errors.slug))}
          />
          {errors.slug ? (
            <p id="cat-slug-error" className="text-sm text-error">
              {errors.slug}
            </p>
          ) : (
            <p id="cat-slug-help" className="text-xs text-muted">
              Auto-generated from the name. Edit to override.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="cat-parent"
            className="block text-sm font-medium text-foreground"
          >
            Parent category
          </label>
          <select
            id="cat-parent"
            name="parentId"
            value={values.parentId}
            disabled={isSubmitting}
            onChange={(e) => setField("parentId", e.target.value)}
            className={controlClasses(Boolean(errors.parentId))}
          >
            <option value="">— None (top level)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.parentId && (
            <p className="text-sm text-error">{errors.parentId}</p>
          )}
        </div>

        {/* Icon upload + preview (Req 15.7, 15.8) */}
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-foreground">
            Icon
          </span>
          <div className="flex items-center gap-4">
            <IconPreview url={values.iconUrl} />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-border focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                    iconState === "uploading" || isSubmitting
                      ? "pointer-events-none opacity-60"
                      : ""
                  }`}
                >
                  <Icon>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </Icon>
                  {iconState === "uploading"
                    ? "Uploading…"
                    : values.iconUrl
                      ? "Replace"
                      : "Upload"}
                  <input
                    type="file"
                    accept={ACCEPTED_ICON_TYPES.join(",")}
                    className="sr-only"
                    disabled={iconState === "uploading" || isSubmitting}
                    onChange={handleIconChange}
                  />
                </label>
                {values.iconUrl && (
                  <button
                    type="button"
                    onClick={() => setField("iconUrl", "")}
                    disabled={isSubmitting}
                    className="inline-flex cursor-pointer items-center rounded-control px-3 py-2 text-sm font-medium text-secondary transition-colors duration-200 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                JPEG, PNG, WebP, or GIF, up to 5 MB.
              </p>
            </div>
          </div>
          {iconError && <p className="text-sm text-error">{iconError}</p>}
        </div>

        <TextAreaField
          id="cat-description"
          label="Description"
          value={values.description}
          error={errors.description}
          maxLength={5000}
          disabled={isSubmitting}
          onChange={(v) => setField("description", v)}
        />

        {/* Homepage flag + section title (Req 15.7) */}
        <div className="space-y-3 rounded-control border border-border p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={values.showOnHomepage}
              disabled={isSubmitting}
              onChange={(e) => setField("showOnHomepage", e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <span className="text-sm font-medium text-foreground">
              Show on homepage
            </span>
          </label>
          <TextField
            id="cat-homepage-title"
            label="Homepage section title"
            value={values.homepageSectionTitle}
            error={errors.homepageSectionTitle}
            maxLength={150}
            disabled={isSubmitting || !values.showOnHomepage}
            onChange={(v) => setField("homepageSectionTitle", v)}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="cat-order"
              className="block text-sm font-medium text-foreground"
            >
              Display order
            </label>
            <input
              id="cat-order"
              name="displayOrder"
              type="number"
              min={0}
              max={9999}
              step={1}
              inputMode="numeric"
              value={values.displayOrder}
              disabled={isSubmitting}
              aria-invalid={errors.displayOrder ? true : undefined}
              aria-describedby={
                errors.displayOrder ? "cat-order-error" : undefined
              }
              onChange={(e) => setField("displayOrder", e.target.value)}
              className={controlClasses(Boolean(errors.displayOrder))}
            />
            {errors.displayOrder && (
              <p id="cat-order-error" className="text-sm text-error">
                {errors.displayOrder}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cat-status"
              className="block text-sm font-medium text-foreground"
            >
              Status
            </label>
            <select
              id="cat-status"
              name="status"
              value={values.status}
              disabled={isSubmitting}
              onChange={(e) =>
                setField("status", e.target.value as EntityStatus)
              }
              className={controlClasses(Boolean(errors.status))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {errors.status && (
              <p className="text-sm text-error">{errors.status}</p>
            )}
          </div>
        </div>

        <TextField
          id="cat-meta-title"
          label="Meta title"
          value={values.metaTitle}
          error={errors.metaTitle}
          maxLength={200}
          placeholder={defaultMetaTitle(values.name)}
          help="Leave blank to use the default shown above."
          disabled={isSubmitting}
          onChange={(v) => setField("metaTitle", v)}
        />

        <TextAreaField
          id="cat-meta-description"
          label="Meta description"
          value={values.metaDescription}
          error={errors.metaDescription}
          maxLength={300}
          rows={3}
          disabled={isSubmitting}
          onChange={(v) => setField("metaDescription", v)}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Saving…"
              : mode === "edit"
                ? "Save changes"
                : "Create category"}
          </button>
          <Link
            href="/admin/categories"
            className="inline-flex cursor-pointer items-center justify-center rounded-control px-4 py-2.5 text-sm font-medium text-secondary transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function controlClasses(hasError: boolean): string {
  return `w-full rounded-control border bg-background px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
    hasError ? "border-error" : "border-border"
  }`;
}

function IconPreview({ url }: { url: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Category icon preview"
        className="h-16 w-16 rounded-control border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-16 w-16 items-center justify-center rounded-control border border-dashed border-border text-muted"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
      </svg>
    </span>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
  help?: string;
  disabled?: boolean;
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
  required,
  placeholder,
  help,
  disabled,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : help ? helpId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClasses(Boolean(error))}
      />
      {error ? (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="text-xs text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
  rows = 4,
  disabled,
}: TextAreaFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClasses(Boolean(error))}
      />
      {error && (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
