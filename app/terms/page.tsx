/**
 * `/terms` — static Terms of Service page (Req 12.1).
 *
 * Server-rendered static content with per-page SEO via `buildMetadata`.
 * Header/Footer are provided by the root layout.
 */
import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Terms of Service",
    description:
      "The terms and conditions that govern your use of DealSpark, including acceptable use, third-party links, and limitations of liability.",
    path: "/terms",
  });
}

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-4 text-secondary">
        Please read these terms carefully before using DealSpark. By accessing
        or using the site, you agree to be bound by these terms.
      </p>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Acceptance of terms
        </h2>
        <p className="text-secondary">
          Your use of DealSpark constitutes acceptance of these terms. If you do
          not agree, please discontinue use of the site.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Use of the site</h2>
        <p className="text-secondary">
          DealSpark is provided for personal, non-commercial use. You agree not
          to misuse the site, interfere with its operation, or attempt to access
          it through automated means without permission.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Third-party links and offers
        </h2>
        <p className="text-secondary">
          Deals and coupons may link to third-party stores. We do not control
          those sites and are not responsible for their content, pricing, or
          availability. Offers are subject to change without notice, and final
          prices and terms are determined by the retailer.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Limitation of liability
        </h2>
        <p className="text-secondary">
          DealSpark is provided on an &ldquo;as is&rdquo; basis. We make no
          warranties about the accuracy or completeness of listed offers and are
          not liable for any loss arising from your use of the site or
          third-party stores.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Changes</h2>
        <p className="text-secondary">
          We may update these terms from time to time. Continued use of the site
          after changes take effect constitutes acceptance of the revised terms.
        </p>
      </section>
    </main>
  );
}
