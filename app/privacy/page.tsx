/**
 * `/privacy` — static Privacy Policy page (Req 12.1).
 *
 * Server-rendered static content with per-page SEO via `buildMetadata`.
 * Header/Footer are provided by the root layout.
 */
import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Privacy Policy",
    description:
      "How DealSpark collects, uses, and protects your information, including contact submissions, analytics, and your choices.",
    path: "/privacy",
  });
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-4 text-secondary">
        Your privacy matters to us. This policy explains what information we
        collect and how we use it.
      </p>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Information we collect
        </h2>
        <p className="text-secondary">
          When you contact us, we collect the name, email address, subject, and
          message you provide so we can respond to your enquiry. We also collect
          anonymous, aggregated usage data to understand how the site is used
          and to improve it.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          How we use information
        </h2>
        <p className="text-secondary">
          We use the information you submit through the contact form solely to
          respond to your message. Aggregated analytics help us measure which
          deals and pages are most useful so we can improve the experience.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Third-party stores
        </h2>
        <p className="text-secondary">
          When you click through to a store, that store&apos;s own privacy
          policy governs any information you share with it. We encourage you to
          review the policies of the sites you visit.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Your choices</h2>
        <p className="text-secondary">
          You can choose not to submit personal information through the contact
          form. If you would like us to remove a message you have sent, please
          reach out and we will assist you.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Contact</h2>
        <p className="text-secondary">
          Questions about this policy? Use our{" "}
          <a
            href="/contact"
            className="font-medium text-accent underline-offset-4 transition-colors duration-200 hover:text-accent-hover hover:underline"
          >
            contact page
          </a>{" "}
          to get in touch.
        </p>
      </section>
    </main>
  );
}
