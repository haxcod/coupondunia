"use client";

/**
 * Accessible form primitives shared by the settings forms (Task 15.10, Req 20).
 *
 * Each control wires `<label htmlFor>` to its input, exposes `aria-invalid` /
 * `aria-describedby` for inline errors, and follows the design tokens
 * (rounded-control, border, focus-visible outline) and ui-ux-pro-max rules
 * (labelled inputs, cursor-pointer on interactive controls).
 */
import { useId, useState } from "react";

interface BaseFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  maxLength?: number;
}

const controlClasses = (hasError: boolean) =>
  `w-full rounded-control border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 ${
    hasError ? "border-error" : "border-border"
  }`;

interface TextFieldProps extends BaseFieldProps {
  type?: "text" | "email" | "url" | "password";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}

/** Labelled single-line text input with inline error + optional hint. */
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  maxLength,
  type = "text",
  autoComplete,
  placeholder,
  required,
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClasses(Boolean(error))}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextAreaFieldProps extends BaseFieldProps {
  rows?: number;
  placeholder?: string;
}

/** Labelled multi-line text input with inline error + optional hint. */
export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  maxLength,
  rows = 3,
  placeholder,
}: TextAreaFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClasses(Boolean(error))}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Labelled checkbox row used for boolean settings (e.g. notifications). */
export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: CheckboxFieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-describedby={description ? descId : undefined}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        {description ? (
          <p id={descId} className="text-xs text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface ImageUploadFieldProps {
  label: string;
  /** Current stored URL, or null/empty when unset. */
  value: string | null;
  onChange: (url: string | null) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Image picker for the logo/favicon settings (Req 20.1). Uploads the selected
 * file to `POST /api/admin/upload` and stores the returned public URL; shows a
 * live preview with a clear action. Upload failures surface inline.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
}: ImageUploadFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so re-selecting the same file fires `change` again.
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message ?? "Upload failed.");
      }
      const data = (await res.json()) as { url: string };
      onChange(data.url);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  const shownError = error ?? uploadError ?? undefined;
  const describedBy =
    [shownError ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-4">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={`${label} preview`}
            className="h-12 w-12 rounded-control border border-border object-contain"
          />
        ) : (
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-control border border-dashed border-border text-muted">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
            </svg>
          </span>
        )}
        <div className="flex items-center gap-2">
          <label
            htmlFor={id}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-border/40 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
              disabled || uploading ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          </label>
          <input
            id={id}
            type="file"
            accept="image/*"
            disabled={disabled || uploading}
            onChange={handleFile}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={describedBy}
            className="sr-only"
          />
          {value ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              className="inline-flex cursor-pointer items-center rounded-control px-2 py-2 text-sm font-medium text-secondary transition-colors duration-200 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {hint && !shownError ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {shownError ? (
        <p id={errorId} className="text-sm text-error">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
