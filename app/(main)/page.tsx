import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { CouponCard } from "@/components/CouponCard";
import { ProductCard } from "@/components/ProductCard";
import { CategoryTile } from "@/components/CategoryTile";
import { StoreLogo } from "@/components/StoreLogo";
import { BrandStrip } from "@/components/BrandStrip";
import { Newsletter } from "@/components/Newsletter";
import HeroCarousel, { type HeroBanner } from "@/components/HeroCarousel";
import { getActiveBanners, getHomepageData } from "@/lib/catalog";
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

/* Curated high-resolution banners styled after Couponology */
const DEFAULT_HERO_BANNERS: HeroBanner[] = [
  {
    id: "banner-redbubble",
    brandName: "Redbubble",
    headline: "25% Off Sitewide Code.",
    couponCode: "BUBBLE25",
    ctaText: "Shop Now",
    imageUrl: "/figma/banner-beauty.webp",
    linkUrl: "https://www.redbubble.com",
    linkTarget: "new_tab",
    overlayAlign: "left",
  },
  {
    id: "banner-wildflower",
    brandName: "Wildflower",
    headline: "Get 20% Off Sitewide",
    couponCode: "CNWILD20",
    ctaText: "Shop Cases",
    imageUrl: "/figma/banner-backpack.webp",
    linkUrl: "https://www.wildflowercases.com",
    linkTarget: "new_tab",
    overlayAlign: "left",
  },
  {
    id: "banner-amazon",
    brandName: "Amazon",
    headline: "Great Indian Festival: Up To 90% Off",
    couponCode: "FESTIVAL90",
    ctaText: "Claim Deal",
    imageUrl: "/figma/banner-amazon-festival.webp",
    linkUrl: "https://www.amazon.in",
    linkTarget: "new_tab",
    overlayAlign: "left",
  },
  {
    id: "banner-ajio",
    brandName: "Ajio",
    headline: "Flat 50% Off On Men's Fashion",
    couponCode: "AJIOMEN50",
    ctaText: "Explore Collection",
    imageUrl: "/figma/banner-ajio-menswear.webp",
    linkUrl: "https://www.ajio.com",
    linkTarget: "new_tab",
    overlayAlign: "left",
  },
  {
    id: "banner-flipkart",
    brandName: "Flipkart",
    headline: "Big Billion Days: Extra ₹500 Off",
    couponCode: "FLIP500",
    ctaText: "Grab Coupon",
    imageUrl: "/figma/banner-flipkart-sale.webp",
    linkUrl: "https://www.flipkart.com",
    linkTarget: "new_tab",
    overlayAlign: "left",
  },
  {
    id: "banner-lifestyle",
    brandName: "Lifestyle",
    headline: "Flat 50% Off On Season Clearance",
    couponCode: "LIFE50",
    ctaText: "Shop Sale",
    imageUrl: "/figma/banner-lifestyle-50off.webp",
    linkUrl: "https://www.lifestylestores.com",
    linkTarget: "new_tab",
    overlayAlign: "left",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <Suspense fallback={<HomeFallback />}>
        <HomeContent />
      </Suspense>

      <Newsletter />
    </main>
  );
}

async function HomeContent() {
  await connection();
  const [settings, homepage, dbBanners] = await Promise.all([
    getSettings(),
    getHomepageData(),
    getActiveBanners().catch(() => []),
  ]);

  const { pillRowCategories, featuredProducts, todaysBestCoupons, popularStores } =
    homepage;

  const websiteJsonLd = buildWebSiteJsonLd({ siteName: settings.siteName });

  const banners: HeroBanner[] =
    dbBanners && dbBanners.length > 0
      ? dbBanners.map((b) => ({
          id: b.id,
          imageUrl: b.imageUrl,
          mobileImageUrl: b.mobileImageUrl,
          headline: b.headline ?? null,
          ctaText: b.ctaText ?? null,
          linkUrl: b.linkUrl,
          linkTarget: b.linkTarget,
        }))
      : DEFAULT_HERO_BANNERS;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(websiteJsonLd) }}
      />

      {/* Couponology-Style Full-Width Hero Carousel */}
      <section className="w-full">
        <HeroCarousel banners={banners} />
      </section>

      <BrandStrip />

      {/* Today's Trending Coupons & Deals (Styled with Couponology typography) */}
      {todaysBestCoupons.length > 0 ? (
        <section className="reveal mx-auto w-full max-w-content px-4 pt-10 pb-12">
          <div className="flex flex-col items-center text-center">
            <span className="font-sans text-xs font-extrabold uppercase tracking-wider text-[#D92E59]">
              TOP DEALS
            </span>
            <h2 className="mt-1 text-3xl sm:text-4xl text-[#1e1e1e] tracking-tight">
              <span className="font-serif font-normal">Our Best </span>
              <span className="font-serif italic font-normal">Coupons</span>
            </h2>
            <p className="mt-2.5 max-w-2xl text-sm text-secondary">
              Explore our selection of handpicked coupons that cater to your preferences and shopping habits as per categories.
            </p>
          </div>
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
    <div aria-hidden="true" className="w-full">
      <div className="w-full aspect-[2.2/1] sm:aspect-[2.8/1] md:aspect-[3.2/1] lg:aspect-[3.6/1] min-h-[220px] sm:min-h-[280px] md:min-h-[340px] max-h-[460px] skeleton" />
      <div className="mx-auto w-full max-w-content px-4 py-12">
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
    </div>
  );
}
