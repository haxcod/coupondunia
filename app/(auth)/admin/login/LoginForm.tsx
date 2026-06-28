"use client";

/**
 * Admin login form (client) — Req 13.2, 13.3, 13.4, 13.5, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10), so credential entry is a
 * Client Component that POSTs to `POST /api/admin/auth` with
 * `{ action: 'login', email, password }` and reacts to the documented status
 * codes:
 *   - 200 → session cookie set by the route handler; redirect to
 *           `/admin/dashboard` and refresh so the guarded layout re-evaluates
 *           the now-valid session (Req 13.2).
 *   - 400 → empty/invalid field; surface the per-field message (Req 13.4).
 *   - 401 → "Invalid email or password" form-level alert; no session (Req 13.3).
 *   - 423 → account temporarily locked; show when the lock lifts (Req 13.5).
 *
 * Client-side validation (required fields + email format) runs first against the
 * shared `emailField` primitive for instant feedback — a single source of truth
 * with the server. We deliberately do NOT enforce the 8–128 password policy at
 * login: a short password is an invalid credential (401), not a field error.
 */
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { emailField, validate } from "@/lib/validation";

/** Where to land an authenticated administrator (Req 13.2, matches Task 15.5). */
const DASHBOARD_PATH = "/admin/dashboard";

interface FormValues {
  email: string;
  password: string;
}

type FieldName = keyof FormValues;

type FieldErrorMap = Partial<Record<FieldName, string>>;

const EMPTY_VALUES: FormValues = { email: "", password: "" };

/** Format the lockout-expiry instant for the temporary-lockout message. */
function formatUnlockTime(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success" };

export default function LoginForm() {
  const router = useRouter();
  const baseId = useId();
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrorMap>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const alertRef = useRef<HTMLDivElement | null>(null);

  const emailId = `${baseId}-email`;
  const passwordId = `${baseId}-password`;

  function handleChange(field: FieldName) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValues((prev) => ({ ...prev, [field]: next }));
      // Clear a field error as the administrator corrects it.
      setErrors((prev) => {
        if (!prev[field]) return prev;
        const { [field]: _removed, ...rest } = prev;
        return rest;
      });
    };
  }

  /** Required-field + email-format validation (Req 13.4 client mirror). */
  function validateClient(): FieldErrorMap {
    const next: FieldErrorMap = {};
    if (values.email.trim() === "") {
      next.email = "Email is required.";
    } else {
      const result = validate(emailField, values.email.trim());
      if (!result.success) {
        next.email = result.error.message;
      }
    }
    if (values.password === "") {
      next.password = "Password is required.";
    }
    return next;
  }

  function focusAlert() {
    // Move focus to the error region so assistive tech announces it.
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setSubmit({ status: "idle" });
      return;
    }

    setErrors({});
    setSubmit({ status: "submitting" });

    let response: Response;
    try {
      response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: values.email.trim(),
          password: values.password,
        }),
      });
    } catch {
      setSubmit({
        status: "error",
        message:
          "We could not reach the server. Please check your connection and try again.",
      });
      focusAlert();
      return;
    }

    // 200 — session established; go to the dashboard and refresh so the
    // guarded admin layout re-runs with the new session (Req 13.2).
    if (response.ok) {
      setSubmit({ status: "success" });
      router.push(DASHBOARD_PATH);
      router.refresh();
      return;
    }

    // Parse the standard `{ error: { field?, message, lockedUntil? } }` body.
    let payload: {
      error?: { field?: string; message?: string; lockedUntil?: string };
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Non-JSON body — fall through to a generic message below.
    }

    if (response.status === 400) {
      // Empty/invalid field — surface against the specific input (Req 13.4).
      const field = payload.error?.field;
      const message = payload.error?.message ?? "This field is required.";
      if (field === "email" || field === "password") {
        setErrors({ [field]: message });
        setSubmit({ status: "idle" });
        return;
      }
      setSubmit({ status: "error", message });
      focusAlert();
      return;
    }

    if (response.status === 423) {
      // Account temporarily locked — include when it unlocks (Req 13.5).
      const unlockAt = payload.error?.lockedUntil
        ? formatUnlockTime(payload.error.lockedUntil)
        : "";
      const base =
        payload.error?.message ??
        "Account temporarily locked due to repeated failed attempts.";
      setSubmit({
        status: "error",
        message: unlockAt
          ? `${base} Please try again after ${unlockAt}.`
          : base,
      });
      focusAlert();
      return;
    }

    // 401 (and any other failure) — invalid credentials (Req 13.3).
    setSubmit({
      status: "error",
      message: payload.error?.message ?? "Invalid email or password",
    });
    focusAlert();
  }

  const isSubmitting = submit.status === "submitting";
  // Keep the button disabled through the post-success redirect, too.
  const isBusy = isSubmitting || submit.status === "success";

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {submit.status === "error" && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-3 rounded-control border border-error/30 bg-error/10 p-4 text-sm text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 h-5 w-5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{submit.message}</span>
        </div>
      )}

      <Field
        id={emailId}
        label="Email"
        type="email"
        value={values.email}
        error={errors.email}
        autoComplete="username"
        inputMode="email"
        disabled={isBusy}
        onChange={handleChange("email")}
      />

      <Field
        id={passwordId}
        label="Password"
        type="password"
        value={values.password}
        error={errors.password}
        autoComplete="current-password"
        disabled={isBusy}
        onChange={handleChange("password")}
      />

      <button
        type="submit"
        disabled={isBusy}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  error?: string;
  autoComplete: string;
  inputMode?: "email" | "text";
  disabled?: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Accessible labelled input with inline error messaging. */
function Field({
  id,
  label,
  type,
  value,
  error,
  autoComplete,
  inputMode,
  disabled,
  onChange,
}: FieldProps) {
  const errorId = `${id}-error`;
  const controlClasses = `w-full rounded-control border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 ${
    error ? "border-error" : "border-border"
  }`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        onChange={onChange}
        className={controlClasses}
      />
      {error && (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
