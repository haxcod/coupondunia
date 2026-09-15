'use client';

/*
 * HeroCarousel — Homepage hero banner carousel styled after Couponology.
 *
 * Features:
 * - Widescreen lifestyle/deal banner presentation (aspect ~3.4:1 on desktop, ~2:1 on mobile).
 * - Couponology-style offer overlay: Brand pill + serif discount headline + interactive
 *   "USE CODE:" copyable badge with feedback.
 * - Circular floating prev/next navigation chevrons.
 * - Couponology bottom centered floating white pill with active elongated dot.
 * - Auto-advances every 4s when >1 banner, pauses on hover/touch, disabled on reduced motion.
 * - Fully accessible with role="region", role="tablist", role="tab", aria-roledescription="slide".
 */

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LinkTarget } from '@/lib/models/types';

/** The subset of Banner fields the carousel needs to render a slide. */
export interface HeroBanner {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string | null;
  headline?: string | null;
  ctaText?: string | null;
  linkUrl: string;
  linkTarget: LinkTarget;
  /** Optional brand/store name (e.g. "Redbubble", "Amazon") */
  brandName?: string | null;
  /** Optional brand logo URL */
  brandLogo?: string | null;
  /** Optional coupon code (e.g. "BUBBLE25") */
  couponCode?: string | null;
  /** Optional discount callout badge (e.g. "25% OFF", "TOP DEAL") */
  discountBadge?: string | null;
  /** Optional horizontal overlay alignment */
  overlayAlign?: 'left' | 'right' | 'center';
}

export interface HeroCarouselProps {
  /** Active banners, pre-ordered by ascending display order (Req 1.3, 18.7). */
  banners: HeroBanner[];
  /**
   * Slides visible at once on sm+ viewports. Inner pages support two-up;
   * homepage defaults to 1.
   */
  perView?: 1 | 2;
}

/** Auto-advance interval in milliseconds (Req 1.4). */
const AUTO_ADVANCE_MS = 4000;

/**
 * Returns true only when `value` is a syntactically valid absolute URL using
 * the http or https scheme. Empty or malformed links are treated as inert
 * (Req 1.7, 1.14).
 */
function isActivatableLink(value: string | null | undefined): value is string {
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export default function HeroCarousel({
  banners,
  perView = 1,
}: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const count = banners.length;
  // Derive safe active index without needing a cascading setState effect
  const activeIndex = count > 0 ? currentIndex % count : 0;

  // Track the user's reduced-motion preference (Req 26.10).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (count === 0) return;
      setCurrentIndex(((index % count) + count) % count);
    },
    [count],
  );

  const goNext = useCallback(() => {
    if (count === 0) return;
    setCurrentIndex((prev) => (prev + 1) % count);
  }, [count]);

  const goPrev = useCallback(() => {
    if (count === 0) return;
    setCurrentIndex((prev) => ((prev - 1) % count + count) % count);
  }, [count]);

  // Tracks the X position where a touch gesture began, for swipe detection.
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (count <= 1 || isPaused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [count, isPaused, reducedMotion]);

  // Nothing to render when there are no banners (Req 1.6, 1.14).
  if (count === 0) return null;

  const pause = () => setIsPaused(true);
  const resume = () => setIsPaused(false);
  const hasMultiple = count > 1;

  // Swipe support (mobile)
  const SWIPE_THRESHOLD_PX = 40;
  const handleTouchStart = (event: React.TouchEvent) => {
    pause();
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX !== null && hasMultiple) {
      const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
      if (deltaX <= -SWIPE_THRESHOLD_PX) {
        goNext();
      } else if (deltaX >= SWIPE_THRESHOLD_PX) {
        goPrev();
      }
    }
    resume();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotional banners"
      className="group/carousel relative w-full overflow-hidden bg-[#f4f4f7]"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onFocusCapture={pause}
      onBlurCapture={resume}
    >
      {/* Slide track */}
      <div
        className={`flex transition-transform duration-500 ease-out transform-[translateX(calc(var(--slide-index)*-100%))] ${perView === 2
            ? 'sm:transform-[translateX(calc(var(--slide-index)*-50%))]'
            : ''
          }`}
        style={{ '--slide-index': activeIndex } as React.CSSProperties}
      >
        {banners.map((banner, index) => (
          <Slide
            key={banner.id}
            banner={banner}
            isActive={index === activeIndex}
            position={index + 1}
            total={count}
            perView={perView}
          />
        ))}
      </div>

      {hasMultiple && (
        <>
          {/* Couponology Circular Floating Navigation Arrows */}
          {perView === 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous banner"
                className="absolute left-2.5 sm:left-5 md:left-8 top-1/2 z-20 flex h-8 w-8 sm:h-10 sm:w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/95 text-[#2b2b2b] shadow-md border border-black/5 transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronIcon direction="left" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next banner"
                className="absolute right-2.5 sm:right-5 md:right-8 top-1/2 z-20 flex h-8 w-8 sm:h-10 sm:w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/95 text-[#2b2b2b] shadow-md border border-black/5 transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronIcon direction="right" />
              </button>
            </>
          )}

          {/* Couponology Centered Bottom Pill Indicators */}
          <div
            className={
              perView === 2
                ? 'mt-4 flex items-center justify-center gap-1.5 pb-2'
                : 'absolute bottom-3 sm:bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 shadow-sm border border-black/5 backdrop-blur-xs'
            }
            role="tablist"
            aria-label="Choose banner"
          >
            {banners.map((banner, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={banner.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`Go to banner ${index + 1} of ${count}`}
                  onClick={() => goTo(index)}
                  className={`cursor-pointer transition-all duration-300 ${selected
                      ? 'h-1.5 w-4 sm:w-5 rounded-full bg-[#373737]'
                      : 'h-1.5 w-1.5 rounded-full bg-[#d2d2d7] hover:bg-[#8e8e93]'
                    }`}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

interface SlideProps {
  banner: HeroBanner;
  isActive: boolean;
  position: number;
  total: number;
  perView: 1 | 2;
}

/**
 * Single banner slide matching Couponology's aesthetic.
 */
function Slide({ banner, isActive, position, total, perView }: SlideProps) {
  const [copied, setCopied] = useState(false);
  const activatable = isActivatableLink(banner.linkUrl);
  const altText = banner.headline ?? banner.brandName ?? 'Promotion';

  // Responsive widescreen aspect ratio inspired by Couponology (+10px height adjustment)
  const ratio =
    perView === 2
      ? 'aspect-[16/9]'
      : 'aspect-[2.1/1] sm:aspect-[2.7/1] md:aspect-[3.1/1] lg:aspect-[3.45/1] min-h-[230px] sm:min-h-[290px] md:min-h-[350px] max-h-[470px]';
  const basis =
    perView === 2 ? 'basis-full sm:basis-[calc(50%-0.375rem)]' : 'basis-full';

  // Align overlay: defaults to left, or right if specified
  const alignClass =
    banner.overlayAlign === 'right'
      ? 'items-end text-right'
      : banner.overlayAlign === 'center'
        ? 'items-center text-center'
        : 'items-start text-left';

  const handleCopyCode = (e: React.MouseEvent) => {
    if (!banner.couponCode) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(banner.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const hasOverlay =
    Boolean(banner.headline) ||
    Boolean(banner.brandName) ||
    Boolean(banner.couponCode) ||
    Boolean(banner.ctaText);

  const media = (
    <div className={`relative w-full overflow-hidden ${ratio}`}>
      {/* Background Image */}
      {banner.mobileImageUrl ? (
        <>
          <Image
            src={banner.mobileImageUrl}
            alt={altText}
            fill
            sizes={perView === 2 ? '(max-width: 640px) 100vw, 600px' : '100vw'}
            priority={isActive}
            className="object-cover object-center sm:hidden"
          />
          <Image
            src={banner.imageUrl}
            alt={altText}
            fill
            sizes={perView === 2 ? '(max-width: 640px) 100vw, 600px' : '100vw'}
            priority={isActive}
            className="hidden object-cover object-center sm:block"
          />
        </>
      ) : (
        <Image
          src={banner.imageUrl}
          alt={altText}
          fill
          sizes={perView === 2 ? '(max-width: 640px) 100vw, 600px' : '100vw'}
          priority={isActive}
          className="object-cover object-center"
        />
      )}

      {/* Subtle vignette/gradient for text legibility if overlay exists */}
      {hasOverlay && (
        <div
          className={`absolute inset-0 pointer-events-none ${banner.overlayAlign === 'right'
              ? 'bg-gradient-to-l from-black/40 via-transparent to-transparent'
              : 'bg-gradient-to-r from-black/40 via-transparent to-transparent sm:from-black/30'
            }`}
        />
      )}

      {/* Couponology-Style Offer Overlay Card */}
      {hasOverlay && (
        <div
          className={`absolute inset-0 z-10 flex flex-col justify-center px-6 py-6 sm:px-12 md:px-20 lg:px-28 ${alignClass}`}
        >
          {/* 1. Brand Badge Pill */}
          {banner.brandName && (
            <div className="inline-flex items-center gap-2 rounded bg-white/95 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-[#1e1e1e] shadow-sm backdrop-blur-xs sm:px-3.5 sm:py-1.5 sm:text-sm">
              {banner.brandLogo ? (
                <div className="relative h-4 w-4 shrink-0 sm:h-5 sm:w-5">
                  <Image
                    src={banner.brandLogo}
                    alt={banner.brandName}
                    fill
                    className="object-contain"
                  />
                </div>
              ) : (
                <span className="flex h-4 w-4 sm:h-4.5 sm:w-4.5 items-center justify-center rounded-full bg-[#D92E59] text-[9px] sm:text-[10px] font-black text-white">
                  {banner.brandName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>{banner.brandName}</span>
            </div>
          )}

          {/* 2. Editorial Serif Discount Title */}
          {banner.headline && (
            <div className="mt-2.5 max-w-xl">
              <h2 className="inline-block rounded bg-white/95 px-3 py-1.5 font-serif text-xl font-medium tracking-tight text-[#1e1e1e] shadow-sm backdrop-blur-xs sm:px-4 sm:py-2 sm:text-3xl md:text-4xl">
                {banner.headline}
              </h2>
            </div>
          )}

          {/* 3. Coupon Code or CTA Pill */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {banner.couponCode ? (
              <div
                onClick={handleCopyCode}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleCopyCode(e as unknown as React.MouseEvent);
                  }
                }}
                aria-label={`Copy coupon code: ${banner.couponCode}`}
                className="group/code inline-flex items-center overflow-hidden rounded border border-[#D92E59]/35 bg-white/95 shadow-sm backdrop-blur-xs transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {/* Left tab: USE CODE: */}
                <span className="bg-[#D92E59] px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white">
                  USE CODE:
                </span>
                {/* Right tab: Code + Copy Indicator */}
                <span className="flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 font-mono text-xs sm:text-sm font-bold tracking-wider text-[#1e1e1e] group-hover/code:text-[#D92E59] transition-colors">
                  {banner.couponCode}
                  <span className="ml-1 text-[10px] font-sans font-semibold text-[#D92E59]">
                    {copied ? '✓ COPIED!' : '📋'}
                  </span>
                </span>
              </div>
            ) : banner.ctaText ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-[#D92E59] px-4 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold tracking-wide text-white shadow-sm transition-colors hover:bg-[#be254b]">
                {banner.ctaText}
                <svg
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            ) : null}

            {banner.discountBadge && (
              <span className="rounded bg-black/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-xs sm:text-xs">
                {banner.discountBadge}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const slideLabel = `Banner ${position} of ${total}`;

  if (activatable) {
    const newTab = banner.linkTarget === 'new_tab';
    return (
      <a
        href={banner.linkUrl}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
        aria-roledescription="slide"
        aria-label={slideLabel}
        aria-hidden={!isActive}
        tabIndex={isActive ? undefined : -1}
        className={`group relative block w-full shrink-0 grow-0 cursor-pointer ${basis}`}
      >
        {media}
      </a>
    );
  }

  // Inert slide (non-navigating)
  return (
    <div
      aria-roledescription="slide"
      aria-label={slideLabel}
      aria-hidden={!isActive}
      className={`group relative w-full shrink-0 grow-0 ${basis}`}
    >
      {media}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4 sm:h-5 sm:w-5"
    >
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 12 19" />
      )}
    </svg>
  );
}
