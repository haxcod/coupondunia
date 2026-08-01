/**
 * `/admin/settings` — administrator settings (Task 15.10, Req 20.1–20.10, 25.10).
 *
 * Authentication is enforced one level up by the guarded `(admin)` layout
 * (`app/(admin)/admin/layout.tsx`), which verifies the session and redirects to
 * `/admin/login` for any unauthenticated request. This page is a thin Server
 * Component shell that only exports metadata and renders the client-rendered
 * {@link SettingsClient}, which loads the current values from
 * `GET /api/admin/settings` and persists each form via `PUT /api/admin/settings`
 * (Req 25.10).
 */
import type { Metadata } from "next";

import SettingsClient from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default function AdminSettingsPage() {
  return <SettingsClient />;
}
