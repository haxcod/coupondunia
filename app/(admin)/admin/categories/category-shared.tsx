/**
 * Shared types, request-body builder, and the SVG icon wrapper used by the
 * admin categories list and create/edit form (Task 15.6).
 *
 * The DTO shapes mirror the admin API:
 *   - {@link AdminCategoryRow} ← `GET /api/admin/categories`
 *   - {@link AdminCategoryDetailView} ← `GET /api/admin/categories/[id]`
 * and {@link buildCategoryBody} produces the `categorySchema`-shaped body sent
 * to `POST /api/admin/categories` and `PUT /api/admin/categories/[id]`.
 */
import type { EntityStatus } from "@/lib/models/types";

/** A row in the admin categories table (`GET /api/admin/categories`). */
export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  parentName: string | null;
  activeProductCount: number;
  showOnHomepage: boolean;
  displayOrder: number;
  status: EntityStatus;
}

/** Full editable category (`GET /api/admin/categories/[id]`). */
export interface AdminCategoryDetailView {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  iconUrl: string | null;
  description: string | null;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  displayOrder: number;
  status: EntityStatus;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** The `categorySchema`-shaped body for create/update requests. */
export interface CategoryRequestBody {
  name: string;
  slug?: string;
  parentId: string | null;
  iconUrl: string | null;
  description: string | null;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  displayOrder: number;
  status: EntityStatus;
  metaTitle: string | null;
  metaDescription: string | null;
}

/**
 * Build the request body from a full category, carrying the existing `slug` so
 * an inline-toggle round-trip keeps the slug stable. Used by the list's inline
 * toggles; the form composes its own body from user input.
 */
export function buildCategoryBody(
  category: AdminCategoryDetailView,
): CategoryRequestBody {
  return {
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    iconUrl: category.iconUrl,
    description: category.description,
    showOnHomepage: category.showOnHomepage,
    homepageSectionTitle: category.homepageSectionTitle,
    displayOrder: category.displayOrder,
    status: category.status,
    metaTitle: category.metaTitle,
    metaDescription: category.metaDescription,
  };
}

/** The default meta title applied when none is entered (Req 15.9). */
export function defaultMetaTitle(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0
    ? `${trimmed} Deals & Coupons | DealSpark`
    : "Deals & Coupons | DealSpark";
}

/** Shared 24×24 stroke icon wrapper (ui-ux-pro-max: consistent SVG icons). */
export function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  );
}
