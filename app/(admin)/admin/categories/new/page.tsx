/**
 * `/admin/categories/new` — create a category (Task 15.6, Req 15.3–15.9).
 *
 * Thin Server Component shell (auth enforced by the guarded `(admin)` layout)
 * that renders the client-rendered {@link CategoryForm} in create mode.
 */
import type { Metadata } from "next";

import CategoryForm from "../CategoryForm";

export const metadata: Metadata = {
  title: "New category",
  robots: { index: false, follow: false },
};

export default function NewCategoryPage() {
  return <CategoryForm mode="create" />;
}
