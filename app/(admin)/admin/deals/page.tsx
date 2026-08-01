/**
 * `/admin/deals` — administrator deal management (Task 15.8, Req 17.1–17.12, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout
 * (`app/(admin)/admin/layout.tsx`), which calls `verifySession()` and redirects
 * to `/admin/login` for any unauthenticated request (Req 13.1). This page is a
 * thin Server Component shell that only exports metadata and renders the
 * client-rendered {@link DealsClient}, which fetches the deal list and performs
 * every create/update/delete/bulk action against the session-guarded admin
 * deal APIs (Req 25.10).
 */
import type { Metadata } from "next";

import DealsClient from "./DealsClient";

export const metadata: Metadata = {
  title: "Deals",
  robots: { index: false, follow: false },
};

export default function AdminDealsPage() {
  return <DealsClient />;
}
