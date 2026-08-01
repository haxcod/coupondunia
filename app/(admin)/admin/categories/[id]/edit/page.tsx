/**
 * `/admin/categories/[id]/edit` — edit a category (Task 15.6, Req 15.3–15.10).
 *
 * Thin Server Component shell (auth enforced by the guarded `(admin)` layout).
 * The async `params` access is deferred behind a `<Suspense>` boundary so the
 * static admin shell (sidebar chrome) still prerenders without forcing the
 * whole tree to render dynamically (Cache Components / Partial Prerendering).
 * The client-rendered {@link CategoryForm} then fetches the full category from
 * the session-guarded admin API on mount so every editable field round-trips.
 */
import { Suspense } from "react";
import type { Metadata } from "next";

import CategoryForm from "../../CategoryForm";

export const metadata: Metadata = {
  title: "Edit category",
  robots: { index: false, follow: false },
};

/**
 * Provide a single sentinel param so the static admin shell can prerender under
 * Cache Components (an empty set raises `EmptyGenerateStaticParamsError`, and a
 * param-less dynamic route cannot resolve the sidebar's `usePathname` at build).
 * Real category ids are served on demand (`dynamicParams` defaults to true); the
 * sentinel renders only the client form's loading shell and resolves to the
 * friendly "could not load" state if ever requested directly.
 */
const PLACEHOLDER_ID = "__category__";

export function generateStaticParams(): { id: string }[] {
  return [{ id: PLACEHOLDER_ID }];
}

export default function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditCategoryResolver params={params} />
    </Suspense>
  );
}

async function EditCategoryResolver({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CategoryForm mode="edit" categoryId={id} />;
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-2xl">
      <div
        className="h-96 animate-pulse rounded-card border border-border bg-card"
        aria-busy="true"
        aria-label="Loading form"
      />
    </div>
  );
}
