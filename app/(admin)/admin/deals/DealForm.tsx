"use client";

/**
 * Deal create/edit form (Task 15.8, Req 17.3–17.9, 25.10).
 *
 * Shared by `/admin/deals/new` (create) and `/admin/deals/[id]/edit` (edit).
 * The admin panel is client-rendered (Req 25.10): the form fetches the category
 * list and (in edit mode) the existing deal from the session-guarded admin APIs
 * on mount, validates with the shared `dealSchema` (the single source of truth,
 * identical to the server, Req 17.4), and submits to `POST /api/admin/deals`
 * or `PUT /api/admin/deals/[id]`. On a validation failure the entered values
 * are retained and the offending field is identified; nothing is persisted
 * (Req 17.4/17.7/17.9).
 *
 * Field rules honoured here:
 *   - a deal-type selector offering exactly the four allowed types (Req 17.5);
 *   - a coupon-code input shown + required only for coupon-code deals
 *     (Req 17.6/17.7);
 *   - up to 5 how-to-use steps (Req 17.8);
 *   - valid-from / valid-until with `validFrom ≤ validUntil` (Req 17.9);
 *   - discount value, button label, terms, minimum order value, maximum
 *     discount cap, and applicable-for (Req 17.8).
 *
 * Monetary caps arrive as integer paise and are edited in rupees.
 */
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { dealSchema, validate, type FieldError } from "@/lib/validation";
import type { DealType, EntityStatus } from "@/lib/models";

const MAX_HOW_TO_USE_STEPS = 5;

/** The four deal types the selector must offer, in order (Req 17.5). */
const DEAL_TYPE_OPTIONS: ReadonlyArray<{ value: DealType; label: string }> = [
  { value: "coupon_code", label: "Coupon code" },
  { value: "direct_deal", label: "Direct deal" },
  { value: "bank_card", label: "Bank-card offer" },
  { value: "cashback", label: "Cashback deal" },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: EntityStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface CategoryOption {
  id: string;
  name: string;
}

/** Editable deal projection returned by `GET /api/admin/deals/[id]`. */
interface AdminDealDetail {
  id: string;
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
  minOrderValue: number | null; // paise
  maxDiscountCap: number | null; // paise
  applicableFor: string | null;
  featured: boolean;
  status: EntityStatus;
}

interface FormState {
  headline: string;
  store: string;
  categoryId: string;
  dealType: DealType;
  couponCode: string;
  destinationUrl: string;
  discountValue: string;
  buttonLabel: string;
  terms: string;
  howToUseSteps: string[];
  validFrom: string;
  validUntil: string;
  minOrderValue: string;
  maxDiscountCap: string;
  applicableFor: string;
  featured: boolean;
  status: EntityStatus;
}

const EMPTY_FORM: FormState = {
  headline: "",
  store: "",
  categoryId: "",
  dealType: "coupon_code",
  couponCode: "",
  destinationUrl: "",
  discountValue: "",
  buttonLabel: "",
  terms: "",
  howToUseSteps: [""],
  validFrom: "",
  validUntil: "",
  minOrderValue: "",
  maxDiscountCap: "",
  applicableFor: "",
  featured: false,
  status: "active",
};

/** ISO timestamp → `yyyy-MM-dd` for a native date input (empty when null). */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Paise → rupee input string (empty when null). */
function paiseToInput(paise: number | null): string {
  return paise === null ? "" : String(paise / 100);
}

/** Trim → value or null for optional text fields. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse a rupee input → number, null (empty), or NaN (invalid, lets Zod flag). */
function amountOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return Number(trimmed);
}

export default function DealForm({ dealId }: { dealId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(dealId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const baseId = useId();

  const fieldId = (name: string) => `${baseId}-${name}`;
  const errorId = (name: string) => `${baseId}-${name}-error`;

  // Load categories for the dropdown.
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
        /* non-fatal: the selector stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // In edit mode, load the existing deal.
  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/admin/deals/${dealId}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error("We could not load the deal.");
        }
        const { deal } = (await res.json()) as { deal: AdminDealDetail };
        if (cancelled) return;
        setForm({
          headline: deal.headline,
          store: deal.store,
          categoryId: deal.categoryId,
          dealType: deal.dealType,
          couponCode: deal.couponCode ?? "",
          destinationUrl: deal.destinationUrl,
          discountValue: deal.discountValue ?? "",
          buttonLabel: deal.buttonLabel ?? "",
          terms: deal.terms ?? "",
          howToUseSteps:
            deal.howToUseSteps.length > 0 ? [...deal.howToUseSteps] : [""],
          validFrom: toDateInput(deal.validFrom),
          validUntil: toDateInput(deal.validUntil),
          minOrderValue: paiseToInput(deal.minOrderValue),
          maxDiscountCap: paiseToInput(deal.maxDiscountCap),
          applicableFor: deal.applicableFor ?? "",
          featured: deal.featured,
          status: deal.status,
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "We could not load the deal.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setStep(index: number, value: string) {
    setForm((prev) => {
      const next = [...prev.howToUseSteps];
      next[index] = value;
      return { ...prev, howToUseSteps: next };
    });
  }

  function addStep() {
    setForm((prev) =>
      prev.howToUseSteps.length >= MAX_HOW_TO_USE_STEPS
        ? prev
        : { ...prev, howToUseSteps: [...prev.howToUseSteps, ""] },
    );
  }

  function removeStep(index: number) {
    setForm((prev) => {
      const next = prev.howToUseSteps.filter((_, i) => i !== index);
      return { ...prev, howToUseSteps: next.length > 0 ? next : [""] };
    });
  }

  /** Build the API payload from form state, mirroring `dealSchema`. */
  function buildPayload() {
    return {
      headline: form.headline.trim(),
      store: form.store.trim(),
      categoryId: form.categoryId,
      dealType: form.dealType,
      couponCode:
        form.dealType === "coupon_code"
          ? form.couponCode.trim()
          : orNull(form.couponCode),
      destinationUrl: form.destinationUrl.trim(),
      discountValue: orNull(form.discountValue),
      buttonLabel: orNull(form.buttonLabel),
      terms: orNull(form.terms),
      howToUseSteps: form.howToUseSteps
        .map((step) => step.trim())
        .filter((step) => step.length > 0),
      validFrom: orNull(form.validFrom),
      validUntil: orNull(form.validUntil),
      minOrderValue: amountOrNull(form.minOrderValue),
      maxDiscountCap: amountOrNull(form.maxDiscountCap),
      applicableFor: orNull(form.applicableFor),
      featured: form.featured,
      status: form.status,
    };
  }

  function applyFieldErrors(fieldErrors: FieldError[]) {
    const next: Record<string, string> = {};
    let general: string | null = null;
    for (const fe of fieldErrors) {
      if (fe.field) {
        const key = fe.field.split(".")[0];
        if (!(key in next)) next[key] = fe.message;
      } else if (general === null) {
        general = fe.message;
      }
    }
    setErrors(next);
    setFormError(general ?? "Please correct the highlighted fields.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const candidate = buildPayload();
    const result = validate(dealSchema, candidate);
    if (!result.success) {
      applyFieldErrors(result.fieldErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/admin/deals/${dealId}` : "/api/admin/deals";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: FieldError }
          | null;
        if (body?.error) {
          applyFieldErrors([body.error]);
        } else {
          setFormError("We could not save this deal. Please try again.");
        }
        setSubmitting(false);
        return;
      }

      // Success — return to the list (Req 17.3 success surfaced there).
      router.push("/admin/deals");
      router.refresh();
    } catch {
      setFormError("We could not reach the server. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-content">
        <div className="h-8 w-48 animate-pulse rounded bg-card" />
        <div className="mt-6 h-96 animate-pulse rounded-card border border-border bg-card" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-content">
        <div
          role="alert"
          className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error"
        >
          {loadError}
        </div>
        <Link
          href="/admin/deals"
          className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Back to deals
        </Link>
      </div>
    );
  }

  const isCouponType = form.dealType === "coupon_code";

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6">
        <Link
          href="/admin/deals"
          className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-secondary transition-colors duration-200 hover:text-foreground"
        >
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to deals
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {isEdit ? "Edit deal" : "Create deal"}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-5 rounded-card border border-border bg-card p-5 sm:p-6"
      >
        {formError && (
          <div
            role="alert"
            className="rounded-card border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            {formError}
          </div>
        )}

        <Field
          label="Headline"
          htmlFor={fieldId("headline")}
          required
          error={errors.headline}
          errorId={errorId("headline")}
        >
          <input
            id={fieldId("headline")}
            type="text"
            value={form.headline}
            maxLength={120}
            onChange={(e) => update("headline", e.target.value)}
            aria-invalid={errors.headline ? true : undefined}
            aria-describedby={errors.headline ? errorId("headline") : undefined}
            className={inputClass(Boolean(errors.headline))}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Store"
            htmlFor={fieldId("store")}
            required
            hint="Free text; a new store is created automatically if it doesn't exist."
            error={errors.store}
            errorId={errorId("store")}
          >
            <input
              id={fieldId("store")}
              type="text"
              value={form.store}
              maxLength={100}
              onChange={(e) => update("store", e.target.value)}
              aria-invalid={errors.store ? true : undefined}
              aria-describedby={errors.store ? errorId("store") : undefined}
              className={inputClass(Boolean(errors.store))}
            />
          </Field>

          <Field
            label="Category"
            htmlFor={fieldId("categoryId")}
            required
            error={errors.categoryId}
            errorId={errorId("categoryId")}
          >
            <select
              id={fieldId("categoryId")}
              value={form.categoryId}
              onChange={(e) => update("categoryId", e.target.value)}
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={
                errors.categoryId ? errorId("categoryId") : undefined
              }
              className={selectClass(Boolean(errors.categoryId))}
            >
              <option value="">Select a category…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Deal type" htmlFor={fieldId("dealType")} required>
            <select
              id={fieldId("dealType")}
              value={form.dealType}
              onChange={(e) => update("dealType", e.target.value as DealType)}
              className={selectClass(false)}
            >
              {DEAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Coupon code shown + required only for coupon-code deals (Req 17.6/17.7). */}
          {isCouponType && (
            <Field
              label="Coupon code"
              htmlFor={fieldId("couponCode")}
              required
              error={errors.couponCode}
              errorId={errorId("couponCode")}
            >
              <input
                id={fieldId("couponCode")}
                type="text"
                value={form.couponCode}
                maxLength={50}
                onChange={(e) => update("couponCode", e.target.value)}
                aria-invalid={errors.couponCode ? true : undefined}
                aria-describedby={
                  errors.couponCode ? errorId("couponCode") : undefined
                }
                className={`${inputClass(Boolean(errors.couponCode))} font-mono uppercase`}
              />
            </Field>
          )}
        </div>

        <Field
          label="Destination URL"
          htmlFor={fieldId("destinationUrl")}
          required
          hint="Must start with http:// or https://"
          error={errors.destinationUrl}
          errorId={errorId("destinationUrl")}
        >
          <input
            id={fieldId("destinationUrl")}
            type="url"
            inputMode="url"
            value={form.destinationUrl}
            maxLength={2048}
            placeholder="https://example.com/offer"
            onChange={(e) => update("destinationUrl", e.target.value)}
            aria-invalid={errors.destinationUrl ? true : undefined}
            aria-describedby={
              errors.destinationUrl ? errorId("destinationUrl") : undefined
            }
            className={inputClass(Boolean(errors.destinationUrl))}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Discount value"
            htmlFor={fieldId("discountValue")}
            hint="e.g. 40% OFF or Flat ₹500"
            error={errors.discountValue}
            errorId={errorId("discountValue")}
          >
            <input
              id={fieldId("discountValue")}
              type="text"
              value={form.discountValue}
              maxLength={50}
              onChange={(e) => update("discountValue", e.target.value)}
              className={inputClass(Boolean(errors.discountValue))}
            />
          </Field>

          <Field
            label="Button label"
            htmlFor={fieldId("buttonLabel")}
            hint="e.g. Get Code or Shop Now"
            error={errors.buttonLabel}
            errorId={errorId("buttonLabel")}
          >
            <input
              id={fieldId("buttonLabel")}
              type="text"
              value={form.buttonLabel}
              maxLength={50}
              onChange={(e) => update("buttonLabel", e.target.value)}
              className={inputClass(Boolean(errors.buttonLabel))}
            />
          </Field>
        </div>

        {/* How-to-use steps — up to 5 (Req 17.8). */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            How-to-use steps
            <span className="ml-1 font-normal text-muted">
              (optional, up to {MAX_HOW_TO_USE_STEPS})
            </span>
          </legend>
          {errors.howToUseSteps && (
            <p className="text-sm text-error" role="alert">
              {errors.howToUseSteps}
            </p>
          )}
          <ol className="space-y-2">
            {form.howToUseSteps.map((step, index) => (
              <li key={index} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent"
                >
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={step}
                  maxLength={500}
                  aria-label={`How-to-use step ${index + 1}`}
                  onChange={(e) => setStep(index, e.target.value)}
                  className={inputClass(false)}
                />
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  aria-label={`Remove step ${index + 1}`}
                  className="mt-1 inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-error/10 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
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
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          {form.howToUseSteps.length < MAX_HOW_TO_USE_STEPS && (
            <button
              type="button"
              onClick={addStep}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add step
            </button>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Valid from"
            htmlFor={fieldId("validFrom")}
            error={errors.validFrom}
            errorId={errorId("validFrom")}
          >
            <input
              id={fieldId("validFrom")}
              type="date"
              value={form.validFrom}
              onChange={(e) => update("validFrom", e.target.value)}
              aria-invalid={errors.validFrom ? true : undefined}
              aria-describedby={
                errors.validFrom ? errorId("validFrom") : undefined
              }
              className={inputClass(Boolean(errors.validFrom))}
            />
          </Field>

          <Field
            label="Valid until"
            htmlFor={fieldId("validUntil")}
            hint="Must be on or after valid-from."
            error={errors.validUntil}
            errorId={errorId("validUntil")}
          >
            <input
              id={fieldId("validUntil")}
              type="date"
              value={form.validUntil}
              onChange={(e) => update("validUntil", e.target.value)}
              aria-invalid={errors.validUntil ? true : undefined}
              aria-describedby={
                errors.validUntil ? errorId("validUntil") : undefined
              }
              className={inputClass(Boolean(errors.validUntil))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Minimum order value (₹)"
            htmlFor={fieldId("minOrderValue")}
            error={errors.minOrderValue}
            errorId={errorId("minOrderValue")}
          >
            <input
              id={fieldId("minOrderValue")}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.minOrderValue}
              onChange={(e) => update("minOrderValue", e.target.value)}
              aria-invalid={errors.minOrderValue ? true : undefined}
              aria-describedby={
                errors.minOrderValue ? errorId("minOrderValue") : undefined
              }
              className={inputClass(Boolean(errors.minOrderValue))}
            />
          </Field>

          <Field
            label="Maximum discount cap (₹)"
            htmlFor={fieldId("maxDiscountCap")}
            error={errors.maxDiscountCap}
            errorId={errorId("maxDiscountCap")}
          >
            <input
              id={fieldId("maxDiscountCap")}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.maxDiscountCap}
              onChange={(e) => update("maxDiscountCap", e.target.value)}
              aria-invalid={errors.maxDiscountCap ? true : undefined}
              aria-describedby={
                errors.maxDiscountCap ? errorId("maxDiscountCap") : undefined
              }
              className={inputClass(Boolean(errors.maxDiscountCap))}
            />
          </Field>
        </div>

        <Field
          label="Applicable for"
          htmlFor={fieldId("applicableFor")}
          hint="e.g. New users only, or specific categories."
          error={errors.applicableFor}
          errorId={errorId("applicableFor")}
        >
          <input
            id={fieldId("applicableFor")}
            type="text"
            value={form.applicableFor}
            maxLength={200}
            onChange={(e) => update("applicableFor", e.target.value)}
            className={inputClass(Boolean(errors.applicableFor))}
          />
        </Field>

        <Field
          label="Terms and conditions"
          htmlFor={fieldId("terms")}
          error={errors.terms}
          errorId={errorId("terms")}
        >
          <textarea
            id={fieldId("terms")}
            value={form.terms}
            rows={4}
            maxLength={10000}
            onChange={(e) => update("terms", e.target.value)}
            className={`${inputClass(Boolean(errors.terms))} resize-y`}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Status" htmlFor={fieldId("status")}>
            <select
              id={fieldId("status")}
              value={form.status}
              onChange={(e) => update("status", e.target.value as EntityStatus)}
              className={selectClass(false)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => update("featured", e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-border text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              Featured deal
            </label>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Link
            href="/admin/deals"
            className="inline-flex cursor-pointer items-center rounded-control border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex cursor-pointer items-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create deal"}
          </button>
        </div>
      </form>
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-control border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    hasError ? "border-error" : "border-border"
  }`;
}

function selectClass(hasError: boolean): string {
  return `${inputClass(hasError)} cursor-pointer`;
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-secondary">{hint}</p>}
      {error && errorId && (
        <p id={errorId} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
