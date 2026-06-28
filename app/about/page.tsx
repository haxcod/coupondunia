/**
 * `/about` — static informational page (Req 12.1).
 *
 * Server-rendered static content with per-page SEO via `buildMetadata`
 * (single absolute canonical + Open Graph tags). Header/Footer are provided by
 * the root layout, so this page renders only its own `<main>` content.
 */
import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "About DealSpark",
    description:
      "Learn about DealSpark — how we surface the best deals, coupons, and offers from top stores so you always shop at the right price.",
    path: "/about",
  });
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        About DealSpark
      </h1>
      <p className="mt-4 text-lg text-secondary">
        DealSpark helps shoppers discover genuine savings across thousands of
        products, coupons, and limited-time offers from trusted stores.
      </p>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Our mission</h2>
        <p className="text-secondary">
          We believe great deals should be easy to find and easy to trust. Our
          team curates and verifies offers so you can spend less time hunting
          for discounts and more time enjoying what you buy.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">What we do</h2>
        <p className="text-secondary">
          We bring together deals from a wide range of categories and stores,
          highlight the biggest savings, and surface coupons that actually work.
          Every listing links you straight to the store so you can complete your
          purchase with confidence.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Get in touch
        </h2>
        <p className="text-secondary">
          Have a question, a partnership idea, or a deal you would like us to
          feature? Reach out through our{" "}
          <a
            href="/contact"
            className="font-medium text-accent underline-offset-4 transition-colors duration-200 hover:text-accent-hover hover:underline"
          >
            contact page
          </a>{" "}
          and we will get back to you.
        </p>
      </section>
    </main>
  );
}
