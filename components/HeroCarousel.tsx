'use client';

/*
 * HeroCarousel (Task 10.5) — homepage hero banner carousel.
 *
 * Behavior (Req 1.3–1.7, 1.14, 18.7, 26.10):
 * - Renders 1–10 active banners in the order received (caller supplies them
 *   already sorted by ascending display order — Req 1.3, 18.7).
 * - Auto-advances every 4 s only when there is more than one banner AND no
 *   pointer is hovering/touching AND the user has not requested reduced motion
 *   (Req 1.4, 1.5, 26.10).
 * - Pauses auto-advance while hovered/touched (Req 1.5).
 * - Renders nothing when the banner list is empty (Req 1.6/1.14 — the homepage
 *   hides the carousel when zero active banners exist).
 * - A banner with a valid http(s) link is activatable; a banner whose link is
 *   empty or malformed is rendered inert (non-navigating) (Req 1.7, 1.14).
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
}

export interface HeroCarouselProps {
  /** Active banners, pre-ordered by ascending display order (Req 1.3, 18.7). */
  banners: HeroBanner[];
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

export default function HeroCarousel({ banners }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const count = banners.length;

  // Keep the active index in range if the banner list shrinks between renders.
  useEffect(() => {
    if (currentIndex > count - 1) {
      setCurrentIndex(count > 0 ? count - 1 : 0);
    }
  }, [count, currentIndex]);

  // Track the user's reduced-motion preference (Req 26.10). Auto-advance is a
  // non-essential animation, so it is disabled when reduced motion is on.
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

  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  // Auto-advance timer: active only with >1 banner, not paused, and motion
  // allowed (Req 1.4, 1.5, 26.10).
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // Tracks the X position where a touch gesture began, for swipe detection.
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (count <= 1 || isPaused || reducedMotion) return;
    const timer = window.setInterval(() => {
      goNextRef.current();
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [count, isPaused, reducedMotion]);

  // Nothing to render when there are no banners (Req 1.6, 1.14).
  if (count === 0) return null;

  const pause = () => setIsPaused(true);
  const resume = () => setIsPaused(false);
  const hasMultiple = count > 1;

  // Swipe support (mobile): record the start X, then on release advance/rewind
  // when the horizontal travel exceeds a small threshold. Auto-advance is
  // paused during the gesture and resumed afterwards.
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
      className="relative w-full overflow-hidden rounded-card bg-card"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onFocusCapture={pause}
      onBlurCapture={resume}
    >
      {/* Slide track: translate by the active index. The reduced-motion media
          query in globals.css neutralizes this transition automatically. */}
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {banners.map((banner, index) => (
          <Slide
            key={banner.id}
            banner={banner}
            isActive={index === currentIndex}
            position={index + 1}
            total={count}
          />
        ))}
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-card/80 text-foreground shadow transition-colors duration-200 hover:bg-card focus-visible:bg-card sm:left-3 sm:h-10 sm:w-10"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next banner"
            className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-card/80 text-foreground shadow transition-colors duration-200 hover:bg-card focus-visible:bg-card sm:right-3 sm:h-10 sm:w-10"
          >
            <ChevronIcon direction="right" />
          </button>

          {/* Slide indicators */}
          <div
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2"
            role="tablist"
            aria-label="Choose banner"
          >
            {banners.map((banner, index) => {
              const selected = index === currentIndex;
              return (
                <button
                  key={banner.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`Go to banner ${index + 1} of ${count}`}
                  onClick={() => goTo(index)}
                  className={`h-2.5 cursor-pointer rounded-badge transition-all duration-200 ${
                    selected
                      ? 'w-6 bg-accent'
                      : 'w-2.5 bg-muted hover:bg-secondary'
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
}

/**
 * A single banner slide. Renders the responsive image plus optional headline /
 * CTA overlay. When the banner has a valid http(s) link the slide is wrapped in
 * an anchor; otherwise it is inert (Req 1.7, 1.14).
 */
function Slide({ banner, isActive, position, total }: SlideProps) {
  const activatable = isActivatableLink(banner.linkUrl);
  const altText = banner.headline ?? '';

  const media = (
    <div className="relative aspect-[16/9] w-full sm:aspect-[3/1]">
      {banner.mobileImageUrl ? (
        <>
          <Image
            src={banner.mobileImageUrl}
            alt={altText}
            fill
            sizes="100vw"
            priority={isActive}
            className="object-cover sm:hidden"
          />
          <Image
            src={banner.imageUrl}
            alt={altText}
            fill
            sizes="100vw"
            priority={isActive}
            className="hidden object-cover sm:block"
          />
        </>
      ) : (
        <Image
          src={banner.imageUrl}
          alt={altText}
          fill
          sizes="100vw"
          priority={isActive}
          className="object-cover"
        />
      )}

      {(banner.headline || banner.ctaText) && (
        <div className="absolute inset-0 flex flex-col items-start justify-end gap-3 bg-gradient-to-t from-black/55 to-transparent p-6 sm:p-10">
          {banner.headline && (
            <h2 className="max-w-2xl text-xl font-bold text-white drop-shadow sm:text-3xl">
              {banner.headline}
            </h2>
          )}
          {banner.ctaText && (
            <span className="inline-flex items-center rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 group-hover:bg-accent-hover">
              {banner.ctaText}
            </span>
          )}
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
        className="group block w-full shrink-0 grow-0 basis-full cursor-pointer"
      >
        {media}
      </a>
    );
  }

  // Inert slide: empty or malformed link, render non-navigating content
  // (Req 1.7, 1.14).
  return (
    <div
      aria-roledescription="slide"
      aria-label={slideLabel}
      aria-hidden={!isActive}
      className="group w-full shrink-0 grow-0 basis-full"
    >
      {media}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-5 w-5"
    >
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}
