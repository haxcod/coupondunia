/**
 * Client-side data access for the admin banners screen (Task 15.9).
 *
 * Thin typed wrappers over the session-guarded admin banner APIs (Task 15.1)
 * and the shared image-upload endpoint (Task 9.4). Every helper translates the
 * standard `{ error: { field?, message } }` envelope into a thrown
 * {@link ApiError} carrying the offending field (when present) so the calling
 * component can surface a per-field validation message (Req 18.4).
 */
import type { EntityStatus, LinkTarget } from "@/lib/models/types";
import type { BannerInput } from "@/lib/validation";

/** Admin-facing banner record returned by the banner APIs (mirrors `BannerDTO`). */
export interface Banner {
  id: string;
  internalName: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  headline: string | null;
  ctaText: string | null;
  linkUrl: string;
  linkTarget: LinkTarget;
  displayOrder: number;
  status: EntityStatus;
}

/** An error carrying the optional field name from the API error envelope. */
export class ApiError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.field = field;
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Read `{ error: { field?, message } }` from a failed response and throw it. */
async function throwApiError(response: Response): Promise<never> {
  let message = "Something went wrong. Please try again.";
  let field: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { field?: string; message?: string };
    };
    if (body.error?.message) message = body.error.message;
    field = body.error?.field;
  } catch {
    // Non-JSON body — keep the generic message.
  }
  throw new ApiError(message, field);
}

/** GET every banner (active + inactive) ordered by ascending display order. */
export async function fetchBanners(): Promise<Banner[]> {
  const response = await fetch("/api/admin/banners", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) await throwApiError(response);
  const body = (await response.json()) as { banners: Banner[] };
  return body.banners ?? [];
}

/** POST a new banner; returns the created record. */
export async function createBanner(input: BannerInput): Promise<Banner> {
  const response = await fetch("/api/admin/banners", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  if (!response.ok) await throwApiError(response);
  const body = (await response.json()) as { banner: Banner };
  return body.banner;
}

/** PUT an existing banner; returns the updated record. */
export async function updateBanner(
  id: string,
  input: BannerInput,
): Promise<Banner> {
  const response = await fetch(`/api/admin/banners/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  if (!response.ok) await throwApiError(response);
  const body = (await response.json()) as { banner: Banner };
  return body.banner;
}

/** DELETE a banner by id. */
export async function deleteBanner(id: string): Promise<void> {
  const response = await fetch(`/api/admin/banners/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) await throwApiError(response);
}

/** Upload an image file and return its resolvable public URL (Req 22.1). */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/admin/upload", {
    method: "POST",
    body: form,
  });
  if (!response.ok) await throwApiError(response);
  const body = (await response.json()) as { url: string };
  return body.url;
}

/** Project a {@link Banner} into the API input payload used by create/update. */
export function toBannerInput(banner: Banner): BannerInput {
  return {
    internalName: banner.internalName,
    imageUrl: banner.imageUrl,
    mobileImageUrl: banner.mobileImageUrl,
    headline: banner.headline,
    ctaText: banner.ctaText,
    linkUrl: banner.linkUrl,
    linkTarget: banner.linkTarget,
    displayOrder: banner.displayOrder,
    status: banner.status,
  };
}
