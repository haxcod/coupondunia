/**
 * `/admin/categories` — administrator categories list (Task 15.6, Req 15.1,
 * 15.2, 15.10, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout,
 * which calls `verifySession()` and redirects unauthenticated requests to
 * `/admin/login`. This page is a thin Server Component shell that exports
 * metadata and renders the client-rendered {@link CategoriesClient}, which
 * fetches the category list from the session-guarded admin API on mount and
 * owns the inline toggles, delete flow, and empty state (Req 25.10).
 */
import type { Metadata } from "next";

import CategoriesClient from "./CategoriesClient";

export const metadata: Metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};

export default function AdminCategoriesPage() {
  return <CategoriesClient />;
}
