import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Poppins } from "next/font/google";
import "./globals.css";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { getSettings } from "@/lib/settings";
import { getSiteBaseUrl } from "@/lib/seo";

/*
 * Poppins is the Coupon Saga typeface — the geometric sans used across the
 * design's headings and body. `next/font` self-hosts it with a system fallback
 * stack for graceful degradation. Exposed as `--font-poppins`, which the
 * `--font-sans` token in globals.css consumes.
 */
const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"],
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica",
    "Arial",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  // Resolves relative Open Graph / Twitter image URLs to absolute ones and
  // silences Next's "metadataBase is not set" warning. Sourced from
  // NEXT_PUBLIC_SITE_URL (with a safe fallback) so it is correct per environment.
  metadataBase: new URL(getSiteBaseUrl()),
  title: "Coupon Saga",
  description:
    "Discover the best promo codes, discounts, and cashback offers from your favorite brands.",
};

/**
 * Request-time Header (Req 1.1, 20.5). The site identity (name/logo) lives in
 * the database, which is unavailable during prerender. `connection()` defers
 * this subtree to request time so the cached `getSettings()` read never runs in
 * the build/prerender pass — while `getSettings` keeps its `use cache`/
 * `cacheTag`/`cacheLife` for runtime ISR caching (`connection.md`,
 * `use-cache.md`). It is rendered behind the layout's `<Suspense>` so the
 * static shell can still be prerendered with the default-branded Header.
 */
async function SiteHeader() {
  await connection();
  const settings = await getSettings();
  return <Header siteName={settings.siteName} logoUrl={settings.logoUrl} />;
}

/**
 * Request-time Footer (Req 1.13, 20.5). Sources the site identity from Settings
 * and the nav categories from the cached catalog loader at request time (see
 * {@link SiteHeader}). Rendered behind `<Suspense>` so the static shell
 * prerenders the default-branded Footer first, then streams the real one.
 */
async function SiteFooter() {
  await connection();
  const settings = await getSettings();

  return (
    <Footer
      siteName={settings.siteName}
      tagline={settings.tagline || undefined}
      logoUrl={settings.logoUrl}
      social={settings.social}
      affiliateDisclaimer={settings.defaultAffiliateDisclosure || undefined}
    />
  );
}

/**
 * Static footer placeholder used as the `<Suspense>` fallback for
 * {@link SiteFooter}. Unlike the real {@link Footer}, it must be safe to
 * prerender into the static shell, so it deliberately avoids the request-time
 * `new Date()` copyright year (which Next 16 forbids during prerender) and any
 * database-backed data. It mirrors the footer's background and vertical rhythm
 * to minimize layout shift when the real footer streams in.
 */
function SiteFooterFallback() {
  return (
    <footer
      aria-hidden="true"
      className="mt-auto bg-footer"
    >
      {/* Mirror the CTA band height. */}
      <div className="mx-auto w-full max-w-content px-4 pt-12">
        <div className="h-32 w-full rounded-card bg-white/10 sm:h-28" />
      </div>
      <div className="mx-auto w-full max-w-content px-4 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <div className="h-5 w-32 rounded bg-white/15" />
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/10" />
            </div>
          ))}
        </div>
        <div className="mt-10 h-3 w-full rounded bg-white/10" />
      </div>
      {/* Mirror the bottom bar. */}
      <div className="border-t border-white/15">
        <div className="mx-auto flex w-full max-w-content items-center justify-between px-4 py-6">
          <div className="h-3 w-48 rounded bg-white/10" />
          <div className="hidden h-3 w-40 rounded bg-white/10 sm:block" />
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      {/*
       * Layout shell: global background (#F8F8F6) + foreground tokens, full
       * height flex column so the Footer sits at the bottom. The sticky Header
       * reserves `--header-height` so page content is never hidden behind it.
       *
       * The Header and Footer read database-backed settings/categories, so they
       * are wrapped in `<Suspense>` and deferred to request time via
       * `connection()` (see SiteHeader/SiteFooter). This lets the static shell —
       * including `/_not-found` and every route — prerender WITHOUT a database,
       * streaming the database-backed chrome in at request time. The fallbacks
       * are the same Header/Footer with their built-in defaults, so there is no
       * layout shift when the real data streams in (Req 24.1, 25.8).
       */}
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Suspense fallback={<Header />}>
          <SiteHeader />
        </Suspense>
        {children}
        <Suspense fallback={<SiteFooterFallback />}>
          <SiteFooter />
        </Suspense>
        <BackToTop />
      </body>
    </html>
  );
}
