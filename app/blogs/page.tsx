import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import Image from "next/image";

import HeroCarousel from "@/components/HeroCarousel";
import { CategoryTile } from "@/components/CategoryTile";
import { FeaturedBrands } from "@/components/FeaturedBrands";
import { BrandStrip } from "@/components/BrandStrip";
import { Newsletter } from "@/components/Newsletter";
import { getActiveBanners, getHomepageData } from "@/lib/catalog";
import { buildMetadata } from "@/lib/seo";

/*
 * `/blogs` — the editorial page from the Coupon Saga design: Editor's Picks,
 * "Browse by categories" guide tiles, Latest Articles, Trending Topics, and
 * Popular Store Guides.
 *
 * There is no Blog model in the data layer, so the articles below are the
 * design's own editorial content. Only the banner carousel, the guide tiles, and
 * the store row read live data — when a Blog backend lands, PICKS and ARTICLES
 * are the seam to replace. Card artwork comes from the design file; the picks
 * carry their category badge baked into the image, matching the comp.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Blogs",
    description:
      "Shopping tips, coupon guides, and money-saving advice from the Coupon Saga team.",
    path: "/blogs",
    siteName: "Coupon Saga",
    ogType: "website",
  });
}

const PICKS = [
  {
    title: "10 Hidden Ways to Save Money Online in 2025",
    date: "May 19, 2025",
    readTime: "5 min read",
    image: "/figma/blog-pick-1.webp",
  },
  {
    title: "Top 20 Amazon Coupons You Can Use Right Now",
    date: "May 19, 2025",
    readTime: "5 min read",
    image: "/figma/blog-pick-2.webp",
  },
  {
    title: "How to Stack Coupons & Save Even More",
    date: "May 19, 2025",
    readTime: "5 min read",
    image: "/figma/blog-pick-3.webp",
  },
  {
    title: "Myntra EORS 2025: Dates, Deals & What to Expect",
    date: "May 19, 2025",
    readTime: "5 min read",
    image: "/figma/blog-pick-4.webp",
  },
] as const;

const ARTICLES = [
  {
    category: "Shopping Tips",
    title: "Backpack Essentials for College Students on a Budget",
    date: "May 19, 2025",
    readTime: "5 min read",
    author: "Ananya Sharma",
    image: "/figma/blog-article-1.webp",
  },
  {
    category: "Coupon Guides",
    title: "How to Find and Use Coupon Codes Like a Pro",
    date: "May 19, 2025",
    readTime: "5 min read",
    author: "Rohit Ram",
    image: "/figma/blog-article-2.webp",
  },
  {
    category: "Money Saving",
    title: "Cashback vs Coupons: Which One Saves You More?",
    date: "May 19, 2025",
    readTime: "5 min read",
    author: "Neha Iyer",
    image: "/figma/blog-article-3.webp",
  },
  {
    category: "Season Sales",
    title: "End of Season Sale 2025: Ultimate Shopping Guide",
    date: "May 19, 2025",
    readTime: "5 min read",
    author: "Kapil Singh",
    image: "/figma/blog-article-4.webp",
  },
] as const;

/** Trending Topics — each pill carries its own glyph in the design. */
const TOPICS = [
  { label: "Back to School", icon: "M3 9l9-5 9 5-9 5-9-5Zm0 0v6m4 1v-4.5l5 2.8 5-2.8V16a5 5 0 0 1-10 0Z" },
  { label: "Festival Shopping", icon: "M5 19l4-9 6 6-9 4-1-1Zm6-3l6-6m-3-3 1-2m3 5 2-1m-1 5 2 1" },
  { label: "Black Friday", icon: "M20.6 13.4 12 22l-8-8V4h10l6.6 6.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01" },
  { label: "Holiday Deals", icon: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },
  { label: "Student Discounts", icon: "M22 10 12 5 2 10l10 5 10-5Zm-4 3v4c0 1-3 2-6 2s-6-1-6-2v-4" },
] as const;

const GUIDE_FALLBACK = [
  "Shopping Tips",
  "Coupon Guides",
  "Seasonal Sales",
  "Gift Guides",
  "Lifestyle",
  "Cashback",
] as const;

export default function BlogsPage() {
  return (
    <main className="flex-1">
      <Suspense fallback={<BannerSkeleton />}>
        <BlogBanners />
      </Suspense>

      <BrandStrip />

      {/* Editor's Picks */}
      <section className="reveal mx-auto w-full max-w-content px-4 py-12">
        <SectionHead title="Editor's Picks" heading="h1" viewAllHref="/blogs" />
        <ul className="reveal-stagger mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PICKS.map((pick) => (
            <li key={pick.title}>
              <article className="group flex h-full flex-col">
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-control bg-surface">
                  <Image
                    src={pick.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <h2 className="mt-3 line-clamp-2 text-sm font-bold leading-snug text-foreground">
                  {pick.title}
                </h2>
                <ArticleMeta date={pick.date} readTime={pick.readTime} />
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* Browse by categories */}
      <Suspense fallback={<TilesSkeleton />}>
        <GuideCategories />
      </Suspense>

      {/* Latest Articles */}
      <section className="reveal mx-auto w-full max-w-content px-4 py-12">
        <SectionHead title="Latest Articles" viewAllHref="/blogs" />
        <ul className="reveal-stagger mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ARTICLES.map((article) => (
            <li key={article.title}>
              <article className="group flex h-full flex-col">
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-control bg-surface">
                  <Image
                    src={article.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-accent">
                  {article.category}
                </p>
                <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-foreground">
                  {article.title}
                </h3>
                <ArticleMeta date={article.date} readTime={article.readTime} />
                <p className="mt-3 border-t border-border pt-3 text-xs text-secondary">
                  {article.author}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* Trending Topics */}
      <section className="reveal mx-auto w-full max-w-content px-4 py-8">
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Trending Topics
        </h2>
        <ul className="mt-6 flex flex-wrap gap-3">
          {TOPICS.map((topic) => (
            <li key={topic.label}>
              <Link
                href="/deals"
                className="press inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md hover:shadow-accent/25"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d={topic.icon} />
                </svg>
                {topic.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Popular Store Guides */}
      <Suspense fallback={null}>
        <StoreGuides />
      </Suspense>

      <Newsletter />
    </main>
  );
}

/** Date + read-time line shared by both card styles. */
function ArticleMeta({ date, readTime }: { date: string; readTime: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
      {date}
      <span aria-hidden="true">•</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {readTime}
    </p>
  );
}

interface SectionHeadProps {
  title: string;
  viewAllHref: string;
  heading?: "h1" | "h2";
}

/** Section title with the design's underlined "View All" link on the right. */
function SectionHead({ title, viewAllHref, heading = "h2" }: SectionHeadProps) {
  const Tag = heading;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <Tag className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {title}
      </Tag>
      <Link
        href={viewAllHref}
        className="shrink-0 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-4 transition-colors duration-200 hover:text-accent-hover"
      >
        View All
      </Link>
    </div>
  );
}

async function BlogBanners() {
  await connection();
  const banners = await getActiveBanners();

  if (banners.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-content px-4 pt-6">
      <HeroCarousel banners={banners} perView={2} />
    </section>
  );
}

async function GuideCategories() {
  await connection();
  const homepage = await getHomepageData();
  const categories = homepage.pillRowCategories.slice(0, 6);

  return (
    <section className="reveal mx-auto w-full max-w-content px-4 py-8">
      <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        Browse by categories
      </h2>
      <ul className="reveal-stagger mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {categories.length > 0
          ? categories.map((category) => (
              <li key={category.id}>
                <CategoryTile
                  name={category.name}
                  slug={category.slug}
                  iconUrl={category.iconUrl}
                />
              </li>
            ))
          : GUIDE_FALLBACK.map((name) => (
              <li key={name}>
                <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card px-4 py-6 text-center">
                  <span className="flex h-11 w-11 items-center justify-center text-accent">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-8 w-8"
                      aria-hidden="true"
                    >
                      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4Z" />
                      <path d="M14 4v5h5M8 13h8M8 17h5" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    {name}
                  </span>
                </div>
              </li>
            ))}
      </ul>
    </section>
  );
}

async function StoreGuides() {
  await connection();
  const homepage = await getHomepageData();
  const stores = homepage.popularStores.slice(0, 6);

  if (stores.length === 0) return null;

  return (
    <section className="reveal mx-auto w-full max-w-content px-4 py-12">
      <SectionHead title="Popular Store Guides" viewAllHref="/stores" />
      <FeaturedBrands stores={stores} />
    </section>
  );
}

function BannerSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 pt-6">
      <div className="aspect-[16/9] w-full skeleton rounded-card" />
    </div>
  );
}

function TilesSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 py-8">
      <div className="h-8 w-64 skeleton rounded-control" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-28 skeleton rounded-card border border-border"
          />
        ))}
      </div>
    </div>
  );
}
