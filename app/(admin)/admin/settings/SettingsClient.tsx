"use client";

/**
 * Admin settings (client) — Task 15.10, Req 20.1–20.10, 25.10.
 *
 * The admin panel is client-rendered (Req 25.10): this component loads the
 * current settings singleton from `GET /api/admin/settings` and renders five
 * independent forms — Site, SEO, Social links, Affiliate disclosure, and
 * Password change. Each form:
 *
 *   - validates instantly with its shared Zod section schema for per-field
 *     feedback and value retention (single source of truth with the server);
 *   - submits to `PUT /api/admin/settings` with the matching `section`
 *     discriminator;
 *   - surfaces per-field server errors from the `{ error: { field?, message } }`
 *     envelope (Req 20.2/20.6/20.9/20.10); and
 *   - shows a success confirmation on a 200 (Req 20.1/20.3/20.4/20.7/20.8).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { ZodType } from "zod";

import {
  affiliateSettingsSchema,
  passwordChangeSchema,
  seoSettingsSchema,
  siteSettingsSchema,
  socialLinksSchema,
  validate,
  type FieldError,
} from "@/lib/validation";

import {
  CheckboxField,
  ImageUploadField,
  TextAreaField,
  TextField,
} from "./fields";

interface SettingsView {
  siteName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  contactEmail: string;
  adminEmailNotifications: boolean;
  defaultMetaTitleSuffix: string;
  defaultMetaDescription: string;
  ga4MeasurementId: string;
  searchConsoleCode: string;
  social: {
    facebook: string;
    instagram: string;
    twitter: string;
    youtube: string;
  };
  defaultAffiliateDisclosure: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; settings: SettingsView };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}.`);
  }
  return (await res.json()) as T;
}

/** Outcome of a `PUT /api/admin/settings` call as consumed by the forms. */
type PutOutcome =
  | { ok: true; data: unknown }
  | { ok: false; field?: string; message: string };

async function putSection(payload: Record<string, unknown>): Promise<PutOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      message: "We could not reach the server. Please try again.",
    };
  }

  if (res.ok) {
    return { ok: true, data: await res.json().catch(() => null) };
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: { field?: string; message?: string };
  };
  return {
    ok: false,
    field: body.error?.field,
    message: body.error?.message ?? "The change could not be saved.",
  };
}

/** Map a Zod validation failure's field errors into a `{ field: message }` record. */
function toErrorMap(fieldErrors: readonly FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const fe of fieldErrors) {
    const key = fe.field ?? "_form";
    if (!(key in map)) map[key] = fe.message;
  }
  return map;
}

export default function SettingsClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getJson<SettingsView>("/api/admin/settings")
      .then((settings) => {
        if (!cancelled) setState({ status: "ready", settings });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "We could not load settings. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-secondary">
          Configure site identity, SEO defaults, social links, the affiliate
          disclosure, and your password.
        </p>
      </div>

      {state.status === "loading" && <SettingsSkeleton />}

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
        >
          {state.message}
        </div>
      )}

      {state.status === "ready" && (
        <div className="space-y-6">
          <SiteForm initial={state.settings} />
          <SeoForm initial={state.settings} />
          <SocialForm initial={state.settings} />
          <AffiliateForm initial={state.settings} />
          <PasswordForm />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared section shell
// ---------------------------------------------------------------------------

interface SectionShellProps {
  title: string;
  description?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  saved: boolean;
  formError: string | null;
  submitLabel?: string;
  children: ReactNode;
}

function SectionShell({
  title,
  description,
  onSubmit,
  submitting,
  saved,
  formError,
  submitLabel = "Save changes",
  children,
}: SectionShellProps) {
  return (
    <section className="rounded-card border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-secondary">{description}</p>
        ) : null}
      </div>

      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="rounded-control border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            {formError}
          </div>
        )}

        {children}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex cursor-pointer items-center justify-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
          {saved && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-success"
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
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

/** Common submit status for a section form. */
type SubmitStatus = "idle" | "submitting" | "saved" | "error";

/**
 * Run the shared submit pipeline: client-validate with `schema`, then PUT.
 * Returns the field-error map + form-level error to apply to the form state.
 */
async function submitSection<T>(
  schema: ZodType<T>,
  payload: Record<string, unknown>,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; errors: Record<string, string>; formError: string | null }
> {
  const result = validate(schema, payload);
  if (!result.success) {
    return { ok: false, errors: toErrorMap(result.fieldErrors), formError: null };
  }

  const outcome = await putSection(payload);
  if (outcome.ok) {
    return { ok: true, data: outcome.data };
  }
  if (outcome.field) {
    return {
      ok: false,
      errors: { [outcome.field]: outcome.message },
      formError: null,
    };
  }
  return { ok: false, errors: {}, formError: outcome.message };
}

// ---------------------------------------------------------------------------
// Site settings (Req 20.1/20.2)
// ---------------------------------------------------------------------------

function SiteForm({ initial }: { initial: SettingsView }) {
  const [values, setValues] = useState({
    siteName: initial.siteName,
    tagline: initial.tagline,
    logoUrl: initial.logoUrl,
    faviconUrl: initial.faviconUrl,
    contactEmail: initial.contactEmail,
    adminEmailNotifications: initial.adminEmailNotifications,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key as string];
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFormError(null);
    const res = await submitSection(siteSettingsSchema, {
      section: "site",
      siteName: values.siteName,
      tagline: values.tagline,
      logoUrl: values.logoUrl,
      faviconUrl: values.faviconUrl,
      contactEmail: values.contactEmail,
      adminEmailNotifications: values.adminEmailNotifications,
    });
    if (res.ok) {
      setErrors({});
      setStatus("saved");
    } else {
      setErrors(res.errors);
      setFormError(res.formError);
      setStatus("error");
    }
  }

  return (
    <SectionShell
      title="Site settings"
      description="Site identity shown across the public site."
      onSubmit={handleSubmit}
      submitting={status === "submitting"}
      saved={status === "saved"}
      formError={formError}
    >
      <TextField
        label="Site name"
        value={values.siteName}
        onChange={(v) => set("siteName", v)}
        error={errors.siteName}
        required
        maxLength={100}
      />
      <TextField
        label="Tagline"
        value={values.tagline}
        onChange={(v) => set("tagline", v)}
        error={errors.tagline}
        maxLength={200}
        hint="Optional. Up to 200 characters."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ImageUploadField
          label="Logo"
          value={values.logoUrl}
          onChange={(url) => set("logoUrl", url)}
          error={errors.logoUrl}
          hint="PNG, JPEG, WebP, or SVG."
        />
        <ImageUploadField
          label="Favicon"
          value={values.faviconUrl}
          onChange={(url) => set("faviconUrl", url)}
          error={errors.faviconUrl}
          hint="Square icon recommended."
        />
      </div>
      <TextField
        label="Contact email"
        type="email"
        value={values.contactEmail}
        onChange={(v) => set("contactEmail", v)}
        error={errors.contactEmail}
        autoComplete="email"
        required
      />
      <CheckboxField
        label="Admin email notifications"
        description="Receive an email when a visitor submits the contact form."
        checked={values.adminEmailNotifications}
        onChange={(c) => set("adminEmailNotifications", c)}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// SEO settings (Req 20.3)
// ---------------------------------------------------------------------------

function SeoForm({ initial }: { initial: SettingsView }) {
  const [values, setValues] = useState({
    defaultMetaTitleSuffix: initial.defaultMetaTitleSuffix,
    defaultMetaDescription: initial.defaultMetaDescription,
    ga4MeasurementId: initial.ga4MeasurementId,
    searchConsoleCode: initial.searchConsoleCode,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key as string];
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFormError(null);
    const res = await submitSection(seoSettingsSchema, {
      section: "seo",
      ...values,
    });
    if (res.ok) {
      setErrors({});
      setStatus("saved");
    } else {
      setErrors(res.errors);
      setFormError(res.formError);
      setStatus("error");
    }
  }

  return (
    <SectionShell
      title="SEO settings"
      description="Defaults applied to public page metadata."
      onSubmit={handleSubmit}
      submitting={status === "submitting"}
      saved={status === "saved"}
      formError={formError}
    >
      <TextField
        label="Default meta title suffix"
        value={values.defaultMetaTitleSuffix}
        onChange={(v) => set("defaultMetaTitleSuffix", v)}
        error={errors.defaultMetaTitleSuffix}
        maxLength={70}
        hint="Appended to page titles, e.g. “ | DealSpark”."
      />
      <TextAreaField
        label="Default meta description"
        value={values.defaultMetaDescription}
        onChange={(v) => set("defaultMetaDescription", v)}
        error={errors.defaultMetaDescription}
        maxLength={160}
        hint="Up to 160 characters."
      />
      <TextField
        label="GA4 measurement ID"
        value={values.ga4MeasurementId}
        onChange={(v) => set("ga4MeasurementId", v)}
        error={errors.ga4MeasurementId}
        maxLength={50}
        placeholder="G-XXXXXXXXXX"
      />
      <TextField
        label="Search Console verification code"
        value={values.searchConsoleCode}
        onChange={(v) => set("searchConsoleCode", v)}
        error={errors.searchConsoleCode}
        maxLength={200}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Social links (Req 20.4/20.6)
// ---------------------------------------------------------------------------

function SocialForm({ initial }: { initial: SettingsView }) {
  const [values, setValues] = useState({
    facebook: initial.social.facebook,
    instagram: initial.social.instagram,
    twitter: initial.social.twitter,
    youtube: initial.social.youtube,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key as string];
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFormError(null);
    const res = await submitSection(socialLinksSchema, {
      section: "social",
      ...values,
    });
    if (res.ok) {
      setErrors({});
      setStatus("saved");
    } else {
      setErrors(res.errors);
      setFormError(res.formError);
      setStatus("error");
    }
  }

  return (
    <SectionShell
      title="Social links"
      description="Shown in the footer. Leave a field blank to hide that link."
      onSubmit={handleSubmit}
      submitting={status === "submitting"}
      saved={status === "saved"}
      formError={formError}
    >
      <TextField
        label="Facebook URL"
        type="url"
        value={values.facebook}
        onChange={(v) => set("facebook", v)}
        error={errors.facebook}
        placeholder="https://facebook.com/yourpage"
      />
      <TextField
        label="Instagram URL"
        type="url"
        value={values.instagram}
        onChange={(v) => set("instagram", v)}
        error={errors.instagram}
        placeholder="https://instagram.com/yourpage"
      />
      <TextField
        label="Twitter / X URL"
        type="url"
        value={values.twitter}
        onChange={(v) => set("twitter", v)}
        error={errors.twitter}
        placeholder="https://x.com/yourpage"
      />
      <TextField
        label="YouTube URL"
        type="url"
        value={values.youtube}
        onChange={(v) => set("youtube", v)}
        error={errors.youtube}
        placeholder="https://youtube.com/@yourchannel"
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Affiliate disclosure (Req 20.7)
// ---------------------------------------------------------------------------

function AffiliateForm({ initial }: { initial: SettingsView }) {
  const [value, setValue] = useState(initial.defaultAffiliateDisclosure);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");

  function handleChange(next: string) {
    setValue(next);
    setStatus("idle");
    setErrors((prev) => {
      if (!("defaultAffiliateDisclosure" in prev)) return prev;
      const rest = { ...prev };
      delete rest.defaultAffiliateDisclosure;
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFormError(null);
    const res = await submitSection(affiliateSettingsSchema, {
      section: "affiliate",
      defaultAffiliateDisclosure: value,
    });
    if (res.ok) {
      setErrors({});
      setStatus("saved");
    } else {
      setErrors(res.errors);
      setFormError(res.formError);
      setStatus("error");
    }
  }

  return (
    <SectionShell
      title="Affiliate disclosure"
      description="Default disclosure text shown alongside affiliate links."
      onSubmit={handleSubmit}
      submitting={status === "submitting"}
      saved={status === "saved"}
      formError={formError}
    >
      <TextAreaField
        label="Disclosure text"
        value={value}
        onChange={handleChange}
        error={errors.defaultAffiliateDisclosure}
        maxLength={1000}
        rows={4}
        hint="Up to 1000 characters."
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Password change (Req 20.8/20.9/20.10)
// ---------------------------------------------------------------------------

function PasswordForm() {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key as string];
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFormError(null);
    const res = await submitSection(passwordChangeSchema, {
      section: "password",
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (res.ok) {
      setValues({ currentPassword: "", newPassword: "" });
      setErrors({});
      setStatus("saved");
    } else {
      setErrors(res.errors);
      setFormError(res.formError);
      setStatus("error");
    }
  }

  return (
    <SectionShell
      title="Change password"
      description="Use a strong password of 8 to 128 characters."
      onSubmit={handleSubmit}
      submitting={status === "submitting"}
      saved={status === "saved"}
      formError={formError}
      submitLabel="Update password"
    >
      <TextField
        label="Current password"
        type="password"
        value={values.currentPassword}
        onChange={(v) => set("currentPassword", v)}
        error={errors.currentPassword}
        autoComplete="current-password"
        required
      />
      <TextField
        label="New password"
        type="password"
        value={values.newPassword}
        onChange={(v) => set("newPassword", v)}
        error={errors.newPassword}
        autoComplete="new-password"
        required
        hint="8 to 128 characters."
      />
    </SectionShell>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-card border border-border bg-card"
        />
      ))}
    </div>
  );
}

