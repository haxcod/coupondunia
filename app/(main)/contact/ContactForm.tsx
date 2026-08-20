"use client";

/**
 * Contact form (client) — Req 12.2, 12.4, 12.5, 12.6.
 *
 * Validates Name/Email/Subject/Message against the shared `contactSchema` for
 * instant client feedback (single source of truth with the server), then POSTs
 * to `/api/public/contact`. On a validation failure it identifies every invalid
 * field and retains the entered values (Req 12.5); on a server/network failure
 * it shows a retry prompt while keeping the values (Req 12.6); on success it
 * shows a confirmation and clears the form (Req 12.4).
 */
import { useState } from "react";

import { contactSchema, validate, type FieldError } from "@/lib/validation";

interface FormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY_VALUES: FormValues = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

type FieldName = keyof FormValues;

type FieldErrorMap = Partial<Record<FieldName, string>>;

const FIELD_LIMITS: Record<FieldName, number> = {
  name: 100,
  email: 254,
  subject: 150,
  message: 2000,
};

/** Map the validator's flat `FieldError[]` to a per-field message lookup. */
function toFieldErrorMap(fieldErrors: FieldError[]): FieldErrorMap {
  const map: FieldErrorMap = {};
  for (const { field, message } of fieldErrors) {
    if (field && field in EMPTY_VALUES && !(field in map)) {
      map[field as FieldName] = message;
    }
  }
  return map;
}

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function ContactForm() {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrorMap>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  function handleChange(field: FieldName) {
    return (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const next = event.target.value;
      setValues((prev) => ({ ...prev, [field]: next }));
      // Clear a field's error as the visitor corrects it.
      setErrors((prev) => {
        if (!prev[field]) return prev;
        const { [field]: _removed, ...rest } = prev;
        return rest;
      });
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Client-side validation with the shared schema (Req 12.5).
    const result = validate(contactSchema, values);
    if (!result.success) {
      setErrors(toFieldErrorMap(result.fieldErrors));
      setSubmit({ status: "idle" });
      return;
    }

    setErrors({});
    setSubmit({ status: "submitting" });

    try {
      const response = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (response.ok) {
        setValues(EMPTY_VALUES);
        setSubmit({ status: "success" });
        return;
      }

      // Server rejected the submission. Surface a field error when present,
      // otherwise a generic retry prompt (Req 12.5, 12.6). Values are retained.
      let message = "We could not send your message. Please try again.";
      try {
        const payload = (await response.json()) as {
          error?: { field?: string; message?: string };
        };
        if (payload.error?.message) {
          message = payload.error.message;
        }
        if (payload.error?.field && payload.error.field in EMPTY_VALUES) {
          setErrors({
            [payload.error.field as FieldName]:
              payload.error.message ?? "This field is invalid.",
          });
        }
      } catch {
        // Non-JSON error body — fall back to the generic message.
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

  const isSubmitting = submit.status === "submitting";

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-8 space-y-6">
      {submit.status === "success" && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-control border border-success/30 bg-success/10 p-4 text-sm text-success"
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
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="m9 11 3 3L22 4" />
          </svg>
          <span>
            Thanks for reaching out. Your message has been sent and we will get
            back to you soon.
          </span>
        </div>
      )}

      {submit.status === "error" && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-control border border-error/30 bg-error/10 p-4 text-sm text-error"
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
        id="contact-name"
        label="Name"
        value={values.name}
        error={errors.name}
        maxLength={FIELD_LIMITS.name}
        autoComplete="name"
        disabled={isSubmitting}
        onChange={handleChange("name")}
      />

      <Field
        id="contact-email"
        label="Email"
        type="email"
        value={values.email}
        error={errors.email}
        maxLength={FIELD_LIMITS.email}
        autoComplete="email"
        disabled={isSubmitting}
        onChange={handleChange("email")}
      />

      <Field
        id="contact-subject"
        label="Subject"
        value={values.subject}
        error={errors.subject}
        maxLength={FIELD_LIMITS.subject}
        disabled={isSubmitting}
        onChange={handleChange("subject")}
      />

      <Field
        id="contact-message"
        label="Message"
        multiline
        value={values.message}
        error={errors.message}
        maxLength={FIELD_LIMITS.message}
        disabled={isSubmitting}
        onChange={handleChange("message")}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  maxLength: number;
  type?: string;
  multiline?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  onChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}

/** Accessible labelled field with inline error messaging. */
function Field({
  id,
  label,
  value,
  error,
  maxLength,
  type = "text",
  multiline = false,
  autoComplete,
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
      {multiline ? (
        <textarea
          id={id}
          name={id}
          rows={6}
          value={value}
          maxLength={maxLength}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onChange={onChange}
          className={controlClasses}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          maxLength={maxLength}
          required
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onChange={onChange}
          className={controlClasses}
        />
      )}
      {error && (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
