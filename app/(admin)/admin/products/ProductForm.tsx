"use client";

/**
 * Product create/edit form (Task 15.7, Req 16.4–16.14, 16.16, 25.10).
 *
 * Shared by `/admin/products/new` (create) and `/admin/products/[id]/edit`
 * (edit). The admin panel is client-rendered (Req 25.10): the form validates
 * with the shared `productSchema` (the single source of truth, identical to the
 * server, Req 16.4/16.5/16.7), uploads images through `POST /api/admin/upload`,
 * and submits to the session-guarded product APIs.
 *
 *   - Pricing: a live discount-% preview via `computeDiscountPercent`, and the
 *     original-price > current-price rule (Req 16.6/16.7).
 *   - Store: a free-text name auto-created server-side (Req 16.8).
 *   - Images: a required primary image plus up to 4 additional images with
 *     drag-to-reorder (Req 16.11) and client type/size validation (Req 16.12).
 *   - Description: a TipTap rich-text editor (Req 16.13).
 *   - Key features: up to 8 bullet points, each ≤120 chars (Req 16.14).
 *   - Save Draft persists inactive; Publish persists active (Req 16.9/16.10).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { computeDiscountPercent } from "@/lib/pricing";
import { productSchema, validate, type FieldError } from "@/lib/validation";

import RichTextEditor from "./RichTextEditor";
import { Icon } from "./icons";

const MAX_ADDITIONAL_IMAGES = 4;
const MAX_KEY_FEATURES = 8;
const MAX_FEATURE_LENGTH = 120;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface CategoryOption {
  id: string;
  name: string;
}

interface AdminProductDetail {
  id: string;
  title: string;
  store: string;
  categoryId: string;
  currentPrice: number; // paise
  originalPrice: number | null; // paise
  primaryImageUrl: string;
  additionalImages: string[];
  description: string;
  keyFeatures: string[];
  affiliateUrl: string;
  buttonLabel: string;
  featured: boolean;
  status: "active" | "inactive";
}

interface FormState {
  title: string;
  store: string;
  categoryId: string;
  currentPrice: string;
  originalPrice: string;
  primaryImageUrl: string;
  additionalImages: string[];
  description: string;
  keyFeatures: string[];
  affiliateUrl: string;
  buttonLabel: string;
  featured: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  store: "",
  categoryId: "",
  currentPrice: "",
  originalPrice: "",
  primaryImageUrl: "",
  additionalImages: [],
  description: "",
  keyFeatures: [],
  affiliateUrl: "",
  buttonLabel: "",
  featured: false,
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(productId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | "draft" | "publish">(null);
  const [editorReady, setEditorReady] = useState(!isEdit);

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
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // In edit mode, load the existing product.
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/admin/products/${productId}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(await readError(res, "We could not load the product."));
        }
        const { product } = (await res.json()) as { product: AdminProductDetail };
        if (cancelled) return;
        setForm({
          title: product.title,
          store: product.store,
          categoryId: product.categoryId,
          currentPrice: (product.currentPrice / 100).toString(),
          originalPrice:
            product.originalPrice === null
              ? ""
              : (product.originalPrice / 100).toString(),
          primaryImageUrl: product.primaryImageUrl,
          additionalImages: product.additionalImages,
          description: product.description,
          keyFeatures: product.keyFeatures,
          affiliateUrl: product.affiliateUrl,
          buttonLabel: product.buttonLabel,
          featured: product.featured,
        });
        setEditorReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "We could not load the product.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const currentPriceNum = useMemo(() => {
    const n = Number(form.currentPrice);
    return form.currentPrice !== "" && Number.isFinite(n) ? n : null;
  }, [form.currentPrice]);

  const originalPriceNum = useMemo(() => {
    const n = Number(form.originalPrice);
    return form.originalPrice !== "" && Number.isFinite(n) ? n : null;
  }, [form.originalPrice]);

  const discountPreview = useMemo(() => {
    if (currentPriceNum === null || originalPriceNum === null) return null;
    return computeDiscountPercent(currentPriceNum, originalPriceNum);
  }, [currentPriceNum, originalPriceNum]);

  function buildPayload(status: "active" | "inactive") {
    return {
      title: form.title,
      store: form.store,
      categoryId: form.categoryId,
      currentPrice: form.currentPrice === "" ? undefined : Number(form.currentPrice),
      originalPrice: form.originalPrice === "" ? null : Number(form.originalPrice),
      primaryImageUrl: form.primaryImageUrl,
      additionalImages: form.additionalImages,
      description: form.description,
      keyFeatures: form.keyFeatures.map((f) => f.trim()).filter(Boolean),
      affiliateUrl: form.affiliateUrl,
      buttonLabel: form.buttonLabel.trim() === "" ? undefined : form.buttonLabel.trim(),
      featured: form.featured,
      status,
    };
  }

  function applyFieldErrors(fieldErrors: FieldError[]) {
    const next: Record<string, string> = {};
    let general: string | null = null;
    for (const fe of fieldErrors) {
      if (fe.field) {
        if (!next[fe.field]) next[fe.field] = fe.message;
      } else if (!general) {
        general = fe.message;
      }
    }
    setErrors(next);
    setFormError(general);
  }

  async function submit(intent: "draft" | "publish") {
    setSubmitting(intent);
    setFormError(null);
    setErrors({});

    const status = intent === "publish" ? "active" : "inactive";
    const payload = buildPayload(status);

    // Client-side validation against the shared schema (identical to the server).
    const result = validate(productSchema, payload);
    if (!result.success) {
      applyFieldErrors(result.fieldErrors);
      setSubmitting(null);
      // Focus is left to the first inline error; surface a summary too.
      setFormError((prev) => prev ?? "Please correct the highlighted fields.");
      return;
    }

    try {
      const url = isEdit
        ? `/api/admin/products/${productId}`
        : "/api/admin/products";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (!res.ok) {
        // Re-validate the response envelope into a field-scoped error.
        let body: { error?: FieldError } | null = null;
        try {
          body = (await res.json()) as { error?: FieldError };
        } catch {
          /* ignore */
        }
        if (body?.error) {
          applyFieldErrors([body.error]);
        } else {
          setFormError("We could not save the product. Please try again.");
        }
        setSubmitting(null);
        return;
      }
      // Success — return to the list (Req 16.4 success notification surfaced there).
      router.push("/admin/products");
      router.refresh();
    } catch {
      setFormError("We could not save the product. Please try again.");
      setSubmitting(null);
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
        <div role="alert" className="rounded-card border border-error/30 bg-error/10 p-4 text-sm text-error">
          {loadError}
        </div>
        <Link
          href="/admin/products"
          className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  const busy = submitting !== null;

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-6">
        <Link
          href="/admin/products"
          className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-secondary transition-colors duration-200 hover:text-foreground"
        >
          <Icon>
            <polyline points="15 18 9 12 15 6" />
          </Icon>
          Back to products
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {isEdit ? "Edit product" : "New product"}
        </h1>
      </div>

      {formError && (
        <div
          role="alert"
          className="mb-4 rounded-control border border-error/30 bg-error/10 p-3 text-sm text-error"
        >
          {formError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit("publish");
        }}
        className="space-y-6"
        noValidate
      >
        {/* Basic info */}
        <Section title="Basic information">
          <Field label="Title" htmlFor="title" error={errors.title} required>
            <input
              id="title"
              type="text"
              maxLength={200}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={inputClass(errors.title)}
              aria-invalid={Boolean(errors.title)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Store" htmlFor="store" error={errors.store} required hint="A new store is created automatically if the name is new.">
              <input
                id="store"
                type="text"
                maxLength={100}
                value={form.store}
                onChange={(e) => set("store", e.target.value)}
                className={inputClass(errors.store)}
                aria-invalid={Boolean(errors.store)}
              />
            </Field>

            <Field label="Category" htmlFor="categoryId" error={errors.categoryId} required>
              <select
                id="categoryId"
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                className={`${inputClass(errors.categoryId)} cursor-pointer`}
                aria-invalid={Boolean(errors.categoryId)}
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Affiliate URL" htmlFor="affiliateUrl" error={errors.affiliateUrl} required>
            <input
              id="affiliateUrl"
              type="url"
              inputMode="url"
              maxLength={2048}
              placeholder="https://…"
              value={form.affiliateUrl}
              onChange={(e) => set("affiliateUrl", e.target.value)}
              className={inputClass(errors.affiliateUrl)}
              aria-invalid={Boolean(errors.affiliateUrl)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Button label" htmlFor="buttonLabel" error={errors.buttonLabel} hint="Defaults to “VIEW DEAL”.">
              <input
                id="buttonLabel"
                type="text"
                maxLength={50}
                value={form.buttonLabel}
                onChange={(e) => set("buttonLabel", e.target.value)}
                className={inputClass(errors.buttonLabel)}
              />
            </Field>
            <div className="flex items-end">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => set("featured", e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
                Featured product
              </label>
            </div>
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing" description="Prices are in rupees (₹0.01–999,999,999.99).">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Current price (₹)" htmlFor="currentPrice" error={errors.currentPrice} required>
              <input
                id="currentPrice"
                type="number"
                min={0.01}
                step={0.01}
                value={form.currentPrice}
                onChange={(e) => set("currentPrice", e.target.value)}
                className={inputClass(errors.currentPrice)}
                aria-invalid={Boolean(errors.currentPrice)}
              />
            </Field>
            <Field label="Original price (₹)" htmlFor="originalPrice" error={errors.originalPrice} hint="Optional; must exceed the current price.">
              <input
                id="originalPrice"
                type="number"
                min={0.01}
                step={0.01}
                value={form.originalPrice}
                onChange={(e) => set("originalPrice", e.target.value)}
                className={inputClass(errors.originalPrice)}
                aria-invalid={Boolean(errors.originalPrice)}
              />
            </Field>
            <div>
              <span className="block text-sm font-medium text-foreground">
                Discount
              </span>
              <div className="mt-1.5 flex h-[42px] items-center rounded-control border border-border bg-background px-3 text-sm">
                {discountPreview === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="font-semibold text-success">
                    {discountPreview}% off
                  </span>
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* Images */}
        <Section
          title="Images"
          description="JPEG, PNG, or WebP, up to 5 MB each. One primary image is required; up to 4 additional images can be reordered by dragging."
        >
          <PrimaryImage
            value={form.primaryImageUrl}
            error={errors.primaryImageUrl}
            onChange={(url) => set("primaryImageUrl", url)}
          />
          <AdditionalImages
            images={form.additionalImages}
            error={errors.additionalImages}
            onChange={(next) => set("additionalImages", next)}
          />
        </Section>

        {/* Description */}
        <Section title="Description" description="Rich text: bold, italic, headings, and lists.">
          {editorReady ? (
            <RichTextEditor
              value={form.description}
              onChange={(html) => set("description", html)}
            />
          ) : (
            <div className="min-h-[13rem] animate-pulse rounded-control border border-border bg-card" />
          )}
        </Section>

        {/* Key features */}
        <Section title="Key features" description={`Up to ${MAX_KEY_FEATURES} bullet points, each ≤ ${MAX_FEATURE_LENGTH} characters.`}>
          <KeyFeatures
            features={form.keyFeatures}
            error={errors.keyFeatures}
            onChange={(next) => set("keyFeatures", next)}
          />
        </Section>

        {/* Actions */}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
          <Link
            href="/admin/products"
            className="inline-flex cursor-pointer items-center rounded-control border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => void submit("draft")}
            disabled={busy}
            className="inline-flex cursor-pointer items-center rounded-control border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex cursor-pointer items-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- image fields ------------------------------------------------------------

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Unsupported file type. Use JPEG, PNG, or WebP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image exceeds the maximum size of 5 MB.";
  }
  return null;
}

async function uploadImage(file: File): Promise<string> {
  const data = new FormData();
  data.set("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: data });
  if (!res.ok) {
    throw new Error(await readError(res, "Upload failed."));
  }
  const body = (await res.json()) as { url: string };
  return body.url;
}

function PrimaryImage({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="block text-sm font-medium text-foreground">
        Primary image <span className="text-error">*</span>
      </span>
      <div className="mt-1.5 flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-background">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Primary product image preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-muted">
              <Icon className="h-6 w-6">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
              </Icon>
            </span>
          )}
        </div>
        <div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-background focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            <Icon>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </Icon>
            {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="ml-2 cursor-pointer text-sm font-medium text-secondary hover:text-error"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {(localError || error) && (
        <p className="mt-1.5 text-sm text-error">{localError ?? error}</p>
      )}
    </div>
  );
}

function AdditionalImages({
  images,
  error,
  onChange,
}: {
  images: string[];
  error?: string;
  onChange: (next: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_ADDITIONAL_IMAGES - images.length;
    if (remaining <= 0) {
      setLocalError(`You can add at most ${MAX_ADDITIONAL_IMAGES} additional images.`);
      return;
    }
    const chosen = Array.from(files).slice(0, remaining);
    setLocalError(null);
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of chosen) {
        const invalid = validateImageFile(file);
        if (invalid) {
          setLocalError(invalid);
          continue;
        }
        uploaded.push(await uploadImage(file));
      }
      if (uploaded.length) onChange([...images, ...uploaded]);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="mt-5">
      <span className="block text-sm font-medium text-foreground">
        Additional images
        <span className="ml-1 font-normal text-muted">
          ({images.length}/{MAX_ADDITIONAL_IMAGES})
        </span>
      </span>

      {images.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {images.map((url, index) => (
            <li
              key={`${url}-${index}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) reorder(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`group relative h-20 w-20 cursor-grab overflow-hidden rounded-control border border-border bg-background active:cursor-grabbing ${
                dragIndex === index ? "opacity-50" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Additional image ${index + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, i) => i !== index))}
                aria-label={`Remove additional image ${index + 1}`}
                className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-badge bg-black/60 text-white opacity-0 transition-opacity duration-200 hover:bg-error focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Icon className="h-3 w-3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </Icon>
              </button>
            </li>
          ))}
        </ul>
      )}

      {images.length < MAX_ADDITIONAL_IMAGES && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-dashed border-border bg-card px-3 py-2 text-sm font-medium text-secondary transition-colors duration-200 hover:bg-background focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <Icon>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          {busy ? "Uploading…" : "Add images"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      )}

      {(localError || error) && (
        <p className="mt-1.5 text-sm text-error">{localError ?? error}</p>
      )}
    </div>
  );
}

function KeyFeatures({
  features,
  error,
  onChange,
}: {
  features: string[];
  error?: string;
  onChange: (next: string[]) => void;
}) {
  function update(index: number, value: string) {
    onChange(features.map((f, i) => (i === index ? value : f)));
  }
  return (
    <div className="space-y-2">
      {features.map((feature, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            maxLength={MAX_FEATURE_LENGTH}
            value={feature}
            onChange={(e) => update(index, e.target.value)}
            aria-label={`Key feature ${index + 1}`}
            className={inputClass(undefined)}
          />
          <button
            type="button"
            onClick={() => onChange(features.filter((_, i) => i !== index))}
            aria-label={`Remove key feature ${index + 1}`}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control p-2 text-secondary transition-colors duration-200 hover:bg-error/10 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
          </button>
        </div>
      ))}

      {features.length < MAX_KEY_FEATURES && (
        <button
          type="button"
          onClick={() => onChange([...features, ""])}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-dashed border-border bg-card px-3 py-2 text-sm font-medium text-secondary transition-colors duration-200 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Add feature
        </button>
      )}

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

// --- shared layout primitives ------------------------------------------------

function inputClass(error?: string): string {
  return `w-full rounded-control border bg-card px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    error ? "border-error" : "border-border"
  }`;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-secondary">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}
