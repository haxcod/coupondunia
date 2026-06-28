/**
 * `/admin/deals/[id]/edit` — edit a deal (Task 15.8, Req 17.3–17.9, 25.10).
 *
 * Thin Server Component shell (auth enforced by the guarded `(admin)` layout).
 * The async `params` access is deferred behind a `<Suspense>` boundary so the
 * static admin shell (sidebar chrome) still prerenders without forcing the
 * whole tree to render dynamically (Cache Components / Partial Prerendering).
 * The client-rendered {@link DealForm} then fetches the full deal from the
 * session-guarded admin API on mount so every editable field round-trips.
 */
import { Suspense } from "react";
import type { Metadata } from "next";

import DealForm from "../../DealForm";

export const metadata: Metadata = {
  title: "Edit deal",
  robots: { index: false, follow: false },
};

/**
 * Provide a single sentinel param so the static admin shell can prerender under
 * Cache Components (an empty set raises `EmptyGenerateStaticParamsError`, and a
 * param-less dynamic route cannot resolve the sidebar's `usePathname` at build).
 * Real deal ids are served on demand (`dynamicParams` defaults to true); the
 * sentinel renders only the client form's loading shell and resolves to the
 * friendly "could not load" state if ever requested directly.
 */
const PLACEHOLDER_ID = "__deal__";

export function generateStaticParams(): { id: string }[] {
  return [{ id: PLACEHOLDER_ID }];
}

export default function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditDealResolver params={params} />
    </Suspense>
  );
}

async function EditDealResolver({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DealForm dealId={id} />;
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-content">
      <div
        className="h-96 animate-pulse rounded-card border border-border bg-card"
        aria-busy="true"
        aria-label="Loading form"
      />
    </div>
  );
}
