/**
 * `/admin/dashboard` — administrator dashboard (Task 15.5, Req 14.1–14.7, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout
 * (`app/(admin)/admin/layout.tsx`), which calls `verifySession()` and redirects
 * to `/admin/login` for any unauthenticated request (Req 14.2). This page is a
 * thin Server Component shell that only exports metadata and renders the
 * client-rendered {@link DashboardClient}, which fetches all metrics, charts,
 * and the recent-events feed from the session-guarded admin APIs on mount
 * (Req 25.10).
 */
import type { Metadata } from "next";

import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function AdminDashboardPage() {
  return <DashboardClient />;
}
