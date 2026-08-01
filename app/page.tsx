import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { SearchBar } from "@/components/SearchBar";
import { CouponCard } from "@/components/CouponCard";
import { ProductCard } from "@/components/ProductCard";
import { CategoryTile } from "@/components/CategoryTile";
import { StoreLogo } from "@/components/StoreLogo";
import { BrandStrip } from "@/components/BrandStrip";
import { Newsletter } from "@/components/Newsletter";
import { getHomepageData } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import {
  buildMetadata,
  buildWebSiteJsonLd,
  stringifyJsonLd,
} from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = await getSettings();
  const title = settings.tagline
    ? `${settings.siteName} — ${settings.tagline}`
    : settings.siteName;
  const description =
    settings.defaultMetaDescription ||
    settings.tagline ||
    "Discover the best promo codes, discounts, and cashback offers from your favorite brands. Never pay full price again.";

  return buildMetadata({
    title,
    description,
    path: "/",
    imageUrl: settings.logoUrl,
    siteName: settings.siteName,
    ogType: "website",
  });
}

/* The design's hero photo strip — the designer's own lifestyle shots. */
const HERO_TILES = [
  "/figma/hero-1.webp",
  "/figma/hero-2.webp",
  "/figma/hero-3.webp",
  "/figma/hero-4.webp",
  "/figma/hero-5.webp",
  "/figma/hero-6.webp",
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero — static, rendered in the shell. */}
      <section className="mx-auto w-full max-w-content px-4 pb-6 pt-16 text-center">
        {/* Entrance sequence: headline, then sub-copy, then the search field. */}
        <h1 className="animate-rise mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
          <span className="block text-accent">Save More With Verified</span>
          <span className="block text-foreground">Coupons &amp; Deals</span>
        </h1>
        <p className="animate-rise delay-1 mx-auto mt-6 max-w-2xl text-base text-secondary sm:text-lg">
          Discover the best promo codes, discounts, and cashback offers from your
          favorite brands. Never pay full price again.
        </p>
        <div className="animate-rise delay-2 mx-auto mt-8 max-w-2xl">
          <SearchBar
            cta="Find Deals"
            size="lg"
            placeholder="Search for stores, brands, or categories..."
          />
        </div>

        {/* The photo strip deals itself in left-to-right, like a hand of cards. */}
        <div
          aria-hidden="true"
          className="mt-14 flex items-end justify-center gap-1 overflow-hidden sm:gap-3"
        >
          {HERO_TILES.map((src, index) => (
            <div
              key={src}
              className={`animate-deal-in relative h-28 w-[15%] shrink-0 transition-transform duration-300 hover:-translate-y-2 sm:h-52 ${
                index % 2 === 0 ? "-rotate-2" : "rotate-2"
              }`}
              style={{ animationDelay: `${300 + index * 70}ms` }}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 16vw, 220px"
                priority={index < 3}
                className="object-contain"
              />
            </div>
          ))}
        </div>
      </section>

      <BrandStrip />

      <Suspense fallback={<HomeFallback />}>
        <HomeContent />
      </Suspense>

      <Newsletter />
    </main>
  );
}

async function HomeContent() {
  await connection();
  const [settings, homepage] = await Promise.all([
    getSettings(),
    getHomepageData(),
  ]);

  const { pillRowCategories, featuredProducts, todaysBestCoupons, popularStores } =
    homepage;

  const websiteJsonLd = buildWebSiteJsonLd({ siteName: settings.siteName });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(websiteJsonLd) }}
      />

      {/* Today's Trending Coupons & Deals */}
      {todaysBestCoupons.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <SectionHeading
            title="Today's Trending Coupons & Deals"
            subtitle="Explore our selection of handpicked coupons that cater to your preferences and shopping habits as per categories."
          />
          {/* Real categories, each linking into the filtered deals listing. */}
          <div className="mt-6 flex justify-center gap-6 overflow-x-auto border-b border-border pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              href="/deals"
              className="whitespace-nowrap border-b-2 border-accent pb-3 text-sm font-semibold text-accent"
            >
              All
            </Link>
            {pillRowCategories.slice(0, 7).map((category) => (
              <Link
                key={category.id}
                href={`/deals?category=${encodeURIComponent(category.slug)}`}
                className="whitespace-nowrap border-b-2 border-transparent pb-3 text-sm font-medium text-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
              >
                {category.name}
              </Link>
            ))}
          </div>
          <ul className="reveal-stagger mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {todaysBestCoupons.map((deal) => (
              <li key={deal.id}>
                <CouponCard deal={deal} />
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <Link
              href="/deals"
              className="press rounded-control bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/25"
            >
              Load More
            </Link>
          </div>
        </section>
      ) : null}

      {/* Popular Stores */}
      {popularStores.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <SectionHeading title="Popular Stores" />
          <ul className="reveal-stagger mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {popularStores.map((store) => (
              <li key={store.id}>
                <Link
                  href={`/search?q=${encodeURIComponent(store.name)}`}
                  className="flex h-full flex-col items-center justify-center gap-3 rounded-card border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                >
                  <StoreLogo name={store.name} logoUrl={store.logoUrl} size={48} />
                  <span className="w-full truncate text-center text-xs font-semibold text-foreground">
                    {store.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <Link
              href="/stores"
              className="press rounded-control bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/25"
            >
              View All
            </Link>
          </div>
        </section>
      ) : null}

      {/* Browse By Categories */}
      {pillRowCategories.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <SectionHeading title="Browse By Categories" />
          <ul className="reveal-stagger mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {pillRowCategories.slice(0, 6).map((category) => (
              <li key={category.id}>
                <CategoryTile
                  name={category.name}
                  slug={category.slug}
                  iconUrl={category.iconUrl}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Featured Deals */}
      {featuredProducts.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 py-12">
          <SectionHeading title="Featured Deals" />
          <ul className="reveal-stagger mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
}

/** A centered section heading with an optional supporting line. */
function SectionHeading({ title, subtitle }: SectionHeadingProps) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {/* A short accent rule that draws itself as the section scrolls in. */}
      <span
        aria-hidden="true"
        className="rule-draw mx-auto mt-3 block h-1 w-16 rounded-badge bg-accent"
      />
      {subtitle ? (
        <p className="mx-auto mt-3 max-w-2xl text-sm text-secondary">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** Skeleton streamed in the static shell while homepage data loads. */
function HomeFallback() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 py-12">
      <div className="mx-auto h-8 w-72 skeleton rounded-control" />
      <div className="mx-auto mt-3 h-4 w-96 max-w-full skeleton rounded" />
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-48 skeleton rounded-card border border-border"
          />
        ))}
      </div>
    </div>
  );
}
