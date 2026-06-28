"use client";

/**
 * Banner create/edit form (client) — Task 15.9, Req 18.3, 18.4, 18.5, 25.10.
 *
 * Rendered as an accessible modal dialog over the banners list. Fields mirror
 * the shared `bannerSchema` (single source of truth with the server): internal
 * name, a required banner image plus an optional mobile image (both uploaded
 * via `POST /api/admin/upload`), optional headline/CTA text, a required http(s)
 * link URL, link target (same/new tab), display order, and status.
 *
 * On submit the values are validated client-side with `bannerSchema` for
 * instant per-field feedback; the same schema runs again on the server, which
 * remains authoritative. When validation fails the dialog renders the offending
 * field's message and RETAINS every entered value (Req 18.4). A successful
 * create/update calls `onSaved` with the persisted record.
 */
import { useEffect, useId, useRef, useState } from "react";

import { bannerSchema, validate } from "@/lib/validation";
import type { EntityStatus, LinkTarget } from "@/lib/models/types";

import {
  ApiError,
  createBanner,
  updateBanner,
  uploadImage,
  type Banner,
} from "./api";

interface BannerFormProps {
  /** The banner being edited, or `null` to create a new one. */
  banner: Banner | null;
  /** Default display order suggested for a new banner. */
  defaultDisplayOrder: number;
  /** Close the dialog without saving. */
  onClose: () => void;
  /** Called with the persisted banner after a successful create/update. */
  onSaved: (banner: Banner) => void;
}

interface FormValues {
  internalName: string;
  imageUrl: string;
  mobileImageUrl: string;
  headline: string;
  ctaText: string;
  linkUrl: string;
  linkTarget: LinkTarget;
  displayOrder: string;
  status: EntityStatus;
}

type FieldName = keyof FormValues;
type FieldErrorMap = Partial<Record<FieldName, string>>;

function initialValues(
  banner: Banner | null,
  defaultDisplayOrder: number,
): FormValues {
  if (banner) {
    return {
      internalName: banner.internalName,
      imageUrl: banner.imageUrl,
      mobileImageUrl: banner.mobileImageUrl ?? "",
      headline: banner.headline ?? "",
      ctaText: banner.ctaText ?? "",
      linkUrl: banner.linkUrl,
      linkTarget: banner.linkTarget,
      displayOrder: String(banner.displayOrder),
      status: banner.status,
    };
  }
  return {
    internalName: "",
    imageUrl: "",
    mobileImageUrl: "",
    headline: "",
    ctaText: "",
    linkUrl: "",
    linkTarget: "same_tab",
    displayOrder: String(defaultDisplayOrder),
    status: "active",
  };
}

export default function BannerForm({
  banner,
  defaultDisplayOrder,
  onClose,
  onSaved,
}: BannerFormProps) {
  const baseId = useId();
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(banner, defaultDisplayOrder),
  );
  const [errors, setErrors] = useState<FieldErrorMap>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ main: boolean; mobile: boolean }>(
    { main: false, mobile: false },
  );
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const isEdit = banner !== null;

  // Focus the first field on open and close on Escape (accessible dialog).
  useEffect(() => {
    firstFieldRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function setField<K extends FieldName>(field: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function handleUpload(
    slot: "main" | "mobile",
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    // Reset the input so re-selecting the same file fires another change event.
    event.target.value = "";
    if (!file) return;

    const field: FieldName = slot === "main" ? "imageUrl" : "mobileImageUrl";
    setUploading((prev) => ({ ...prev, [slot]: true }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    try {
      const url = await uploadImage(file);
      setField(field, url);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "We could not upload that image. Please try again.";
      setErrors((prev) => ({ ...prev, [field]: message }));
    } finally {
      setUploading((prev) => ({ ...prev, [slot]: false }));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const orderNumber = Number(values.displayOrder);
    const payload = {
      internalName: values.internalName.trim(),
      imageUrl: values.imageUrl.trim(),
      mobileImageUrl: values.mobileImageUrl.trim() || null,
      headline: values.headline.trim() || null,
      ctaText: values.ctaText.trim() || null,
      linkUrl: values.linkUrl.trim(),
      linkTarget: values.linkTarget,
      displayOrder: values.displayOrder.trim() === "" ? NaN : orderNumber,
      status: values.status,
    };

    const result = validate(bannerSchema, payload);
    if (!result.success) {
      const next: FieldErrorMap = {};
      for (const issue of result.fieldErrors) {
        const field = issue.field as FieldName | undefined;
        if (field && field in values && !next[field]) {
          next[field] = issue.message;
        }
      }
      setErrors(next);
      if (Object.keys(next).length === 0) {
        setFormError(result.error.message);
      }
      return;
    }

    setSaving(true);
    try {
      const saved = isEdit
        ? await updateBanner(banner.id, result.data)
        : await createBanner(result.data);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.field && err.field in values) {
        setErrors((prev) => ({
          ...prev,
          [err.field as FieldName]: err.message,
        }));
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : "We could not save the banner. Please try again.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const titleId = `${baseId}-title`;
  const busy = saving || uploading.main || uploading.mobile;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-8 w-full max-w-2xl rounded-card border border-border bg-card shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit banner" : "New banner"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex cursor-pointer items-center justify-center rounded-control p-1.5 text-secondary transition-colors duration-200 hover:bg-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <CloseIcon />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          {formError && (
            <div
              role="alert"
              className="rounded-control border border-error/30 bg-error/10 p-3 text-sm text-error"
            >
              {formError}
            </div>
          )}

          <TextField
            ref={firstFieldRef}
            id={`${baseId}-internalName`}
            label="Internal name"
            value={values.internalName}
            error={errors.internalName}
            maxLength={100}
            required
            onChange={(v) => setField("internalName", v)}
          />

          <ImageField
            id={`${baseId}-image`}
            label="Banner image"
            required
            url={values.imageUrl}
            uploading={uploading.main}
            error={errors.imageUrl}
            onUpload={(e) => handleUpload("main", e)}
            onClear={() => setField("imageUrl", "")}
          />

          <ImageField
            id={`${baseId}-mobileImage`}
            label="Mobile image"
            hint="Optional. Shown on small screens in place of the banner image."
            url={values.mobileImageUrl}
            uploading={uploading.mobile}
            error={errors.mobileImageUrl}
            onUpload={(e) => handleUpload("mobile", e)}
            onClear={() => setField("mobileImageUrl", "")}
          />

          <TextField
            id={`${baseId}-headline`}
            label="Headline"
            hint="Optional, up to 100 characters."
            value={values.headline}
            error={errors.headline}
            maxLength={100}
            onChange={(v) => setField("headline", v)}
          />

          <TextField
            id={`${baseId}-ctaText`}
            label="CTA button text"
            hint="Optional, up to 30 characters."
            value={values.ctaText}
            error={errors.ctaText}
            maxLength={30}
            onChange={(v) => setField("ctaText", v)}
          />

          <TextField
            id={`${baseId}-linkUrl`}
            label="Link URL"
            type="url"
            placeholder="https://example.com/landing"
            value={values.linkUrl}
            error={errors.linkUrl}
            maxLength={2048}
            required
            onChange={(v) => setField("linkUrl", v)}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SelectField
              id={`${baseId}-linkTarget`}
              label="Link opens in"
              value={values.linkTarget}
              error={errors.linkTarget}
              options={[
                { value: "same_tab", label: "Same tab" },
                { value: "new_tab", label: "New tab" },
              ]}
              onChange={(v) => setField("linkTarget", v as LinkTarget)}
            />

            <NumberField
              id={`${baseId}-displayOrder`}
              label="Display order"
              value={values.displayOrder}
              error={errors.displayOrder}
              min={0}
              max={9999}
              onChange={(v) => setField("displayOrder", v)}
            />

            <SelectField
              id={`${baseId}-status`}
              label="Status"
              value={values.status}
              error={errors.status}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              onChange={(v) => setField("status", v as EntityStatus)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex cursor-pointer items-center justify-center rounded-control border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex cursor-pointer items-center justify-center rounded-control bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create banner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  onChange: (value: string) => void;
  ref?: React.Ref<HTMLInputElement>;
}

function TextField({
  id,
  label,
  value,
  error,
  hint,
  type = "text",
  placeholder,
  maxLength,
  required,
  onChange,
  ref,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <FieldLabel id={id} label={label} required={required} />
      <input
        ref={ref}
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClasses(Boolean(error))}
      />
      <FieldMessages errorId={errorId} hintId={hintId} error={error} hint={hint} />
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}

function NumberField({
  id,
  label,
  value,
  error,
  min,
  max,
  onChange,
}: NumberFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <FieldLabel id={id} label={label} />
      <input
        id={id}
        name={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClasses(Boolean(error))}
      />
      <FieldMessages errorId={errorId} error={error} />
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}

function SelectField({
  id,
  label,
  value,
  error,
  options,
  onChange,
}: SelectFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <FieldLabel id={id} label={label} />
      <select
        id={id}
        name={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${controlClasses(Boolean(error))} cursor-pointer`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages errorId={errorId} error={error} />
    </div>
  );
}

interface ImageFieldProps {
  id: string;
  label: string;
  url: string;
  uploading: boolean;
  error?: string;
  hint?: string;
  required?: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

function ImageField({
  id,
  label,
  url,
  uploading,
  error,
  hint,
  required,
  onUpload,
  onClear,
}: ImageFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <FieldLabel id={id} label={label} required={required} />
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-background">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${label} preview`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden="true" className="text-muted">
              <ImageIcon />
            </span>
          )}
        </div>
        <div className="space-y-2">
          <label
            htmlFor={id}
            className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-border focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          >
            <UploadIcon />
            {uploading ? "Uploading…" : url ? "Replace image" : "Upload image"}
          </label>
          <input
            id={id}
            name={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            onChange={onUpload}
            className="sr-only"
          />
          {url && (
            <button
              type="button"
              onClick={onClear}
              className="ml-3 cursor-pointer text-sm font-medium text-secondary transition-colors duration-200 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <FieldMessages errorId={errorId} hintId={hintId} error={error} hint={hint} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational helpers
// ---------------------------------------------------------------------------

function controlClasses(hasError: boolean): string {
  return `w-full rounded-control border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 ${
    hasError ? "border-error" : "border-border"
  }`;
}

function FieldLabel({
  id,
  label,
  required,
}: {
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-foreground">
      {label}
      {required && (
        <span className="ml-0.5 text-error" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

function FieldMessages({
  errorId,
  hintId,
  error,
  hint,
}: {
  errorId: string;
  hintId?: string;
  error?: string;
  hint?: string;
}) {
  if (error) {
    return (
      <p id={errorId} className="text-sm text-error">
        {error}
      </p>
    );
  }
  if (hint && hintId) {
    return (
      <p id={hintId} className="text-sm text-secondary">
        {hint}
      </p>
    );
  }
  return null;
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UploadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ImageIcon() {
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
