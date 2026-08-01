/**
 * `/admin/banners` — administrator banner management (Task 15.9, Req 18.1–18.6, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout
 * (`app/(admin)/admin/layout.tsx`), which calls `verifySession()` and redirects
 * unauthenticated requests to `/admin/login`. This page is a thin Server
 * Component shell that exports metadata and renders the client-rendered
 * {@link BannersClient}, which fetches the banner list from the session-guarded
 * admin API on mount and owns all create/edit/reorder/toggle/delete
 * interactions (Req 25.10).
 */
import type { Metadata } from "next";

import BannersClient from "./BannersClient";

export const metadata: Metadata = {
  title: "Banners",
  robots: { index: false, follow: false },
};

export default function AdminBannersPage() {
  return <BannersClient />;
}
