/**
 * `/admin/products` — administrator products list (Task 15.7, Req 16.1–16.3,
 * 16.9, 16.15, 16.16, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout
 * (`app/(admin)/admin/layout.tsx`), which calls `verifySession()` and redirects
 * unauthenticated requests to `/admin/login`. This page is a thin Server
 * Component shell that exports metadata and renders the client-rendered
 * {@link ProductsClient}, which fetches the paginated/searchable/filterable/
 * sortable product list from the session-guarded admin APIs on mount and owns
 * all interactivity — inline toggles, bulk actions with confirm, and CSV export
 * (Req 25.10).
 */
import type { Metadata } from "next";

import ProductsClient from "./ProductsClient";

export const metadata: Metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};

export default function AdminProductsPage() {
  return <ProductsClient />;
}
