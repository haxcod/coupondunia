/**
 * `/admin/deals/new` — create a deal (Task 15.8, Req 17.3–17.9, 25.10).
 *
 * Authentication is enforced by the guarded `(admin)` layout. This thin Server
 * Component shell exports metadata and renders the client-rendered
 * {@link DealForm} in create mode (Req 25.10).
 */
import type { Metadata } from "next";

import DealForm from "../DealForm";

export const metadata: Metadata = {
  title: "New deal",
  robots: { index: false, follow: false },
};

export default function NewDealPage() {
  return <DealForm />;
}
