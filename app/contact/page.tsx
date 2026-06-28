/**
 * `/contact` — contact page (Req 12.2, 12.4, 12.5, 12.6).
 *
 * Server component providing per-page SEO via `buildMetadata` and rendering the
 * interactive client `ContactForm`. Header/Footer are provided by the root
 * layout.
 */
import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

import ContactForm from "./ContactForm";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Contact Us",
    description:
      "Get in touch with the DealSpark team. Send us a question, a partnership idea, or a deal you would like us to feature.",
    path: "/contact",
  });
}

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Contact Us
      </h1>
      <p className="mt-4 text-secondary">
        Have a question or feedback? Fill out the form below and we will get
        back to you as soon as we can.
      </p>

      <ContactForm />
    </main>
  );
}
