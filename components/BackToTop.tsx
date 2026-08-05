'use client';

/*
 * BackToTop — appears once the reader is well down a long page and scrolls back
 * to the top. These pages run long (banner, grids, offers, newsletter), so it
 * saves a lot of flicking on mobile.
 *
 * It stays mounted and animates opacity/transform rather than mounting on demand,
 * so it can fade out as well as in. Scrolling honours `prefers-reduced-motion`
 * by jumping instead of smooth-scrolling.
 */
import { useEffect, useState } from 'react';

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toTop() {
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      // Hidden from assistive tech and pointer events until it is actually shown.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`press fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/25 transition-all duration-300 ease-out hover:bg-accent-hover ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="m6 15 6-6 6 6" />
      </svg>
    </button>
  );
}
