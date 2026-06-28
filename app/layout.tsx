import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Inter } from "next/font/google";
import "./globals.css";

import { Header } from "@/components/Header";
import { Footer, type FooterColumn } from "@/components/Footer";
import { getSettings } from "@/lib/settings";
import { getNavCategories } from "@/lib/catalog";

/*
 * Inter is the site typeface (Req 26.3). `next/font` self-hosts the font and
 * provides an automatic system sans-serif fallback (Req 26.4); the explicit
 * `fallback` stack guarantees a graceful degrade if Inter fails to load.
 * The font is exposed as the `--font-inter` CSS variable consumed by the
 * `--font-sans` design token in globals.css.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
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
  title: "DealSpark",
  description: "Discover the best deals, coupons, and offers from top stores.",
};

/**
 * Build the footer navigation columns (Req 1.13). The first two columns are the
 * fixed Company / Legal links; the third surfaces the most prominent active
 * categories (falling back to a static Browse column when none exist yet).
 */
function buildFooterColumns(
  categories: { name: string; slug: string }[],
): FooterColumn[] {
  const columns: FooterColumn[] = [
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
      ],
    },
  ];

  if (categories.length > 0) {
    columns.push({
      title: "Top Categories",
      links: categories.slice(0, 6).map((category) => ({
        label: category.name,
        href: `/category/${category.slug}`,
      })),
    });
  } else {
    columns.push({
      title: "Browse",
      links: [
        { label: "All Categories", href: "/categories" },
        { label: "All Coupons", href: "/deals" },
      ],
    });
  }

  return columns;
}

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
  const [settings, navCategories] = await Promise.all([
    getSettings(),
    getNavCategories(),
  ]);

  const footerColumns = buildFooterColumns(navCategories);

  return (
    <Footer
      siteName={settings.siteName}
      tagline={settings.tagline || undefined}
      logoUrl={settings.logoUrl}
      social={settings.social}
      columns={footerColumns}
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
      className="mt-auto bg-footer text-foreground"
    >
      <div className="mx-auto w-full max-w-content px-4 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-border" />
              <div className="h-3 w-24 animate-pulse rounded bg-border" />
              <div className="h-3 w-20 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>
        <div className="mt-10 h-3 w-full animate-pulse rounded border-t border-border bg-border pt-6" />
        <div className="mt-4 h-3 w-48 animate-pulse rounded bg-border" />
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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
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
      </body>
    </html>
  );
}
