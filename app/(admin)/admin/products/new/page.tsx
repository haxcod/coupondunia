/**
 * `/admin/products/new` — create a product (Task 15.7, Req 16.4–16.14, 25.10).
 *
 * Authentication is enforced by the guarded `(admin)` layout. This thin Server
 * Component shell exports metadata and renders the client-rendered
 * {@link ProductForm} in create mode (Req 25.10).
 */
import type { Metadata } from "next";

import ProductForm from "../ProductForm";

export const metadata: Metadata = {
  title: "New product",
  robots: { index: false, follow: false },
};

export default function NewProductPage() {
  return <ProductForm />;
}
