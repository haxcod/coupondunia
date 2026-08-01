/**
 * `/admin/analytics` — administrator analytics (Task 15.10, Req 19.1–19.11, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout
 * (`app/(admin)/admin/layout.tsx`), which verifies the session and redirects to
 * `/admin/login` for any unauthenticated request. This page is a thin Server
 * Component shell that only exports metadata and renders the client-rendered
 * {@link AnalyticsClient}, which owns the date-range selector and fetches the
 * report from the session-guarded `GET /api/admin/analytics` on demand
 * (Req 25.10).
 */
import type { Metadata } from "next";

import AnalyticsClient from "./AnalyticsClient";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default function AdminAnalyticsPage() {
  return <AnalyticsClient />;
}
