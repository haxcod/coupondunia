import { Suspense } from "react";
import { connection } from "next/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { getSettings } from "@/lib/settings";
import { getNavCategoryTree } from "@/lib/catalog";

async function SiteHeader() {
  await connection();
  const [settings, categories] = await Promise.all([
    getSettings(),
    getNavCategoryTree(),
  ]);
  return (
    <Header
      siteName={settings.siteName}
      logoUrl={settings.logoUrl}
      categories={categories}
    />
  );
}

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

function SiteFooterFallback() {
  return (
    <footer
      aria-hidden="true"
      className="mt-auto bg-footer"
    >
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
      <div className="border-t border-white/15">
        <div className="mx-auto flex w-full max-w-content items-center justify-between px-4 py-6">
          <div className="h-3 w-48 rounded bg-white/10" />
          <div className="hidden h-3 w-40 rounded bg-white/10 sm:block" />
        </div>
      </div>
    </footer>
  );
}

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<Header />}>
        <SiteHeader />
      </Suspense>
      <main className="flex-1">
        {children}
      </main>
      <Suspense fallback={<SiteFooterFallback />}>
        <SiteFooter />
      </Suspense>
      <BackToTop />
    </div>
  );
}
