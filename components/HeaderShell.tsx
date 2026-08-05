'use client';

/*
 * HeaderShell — gives the sticky header a scrolled state: once the page moves
 * past a small threshold the header gains a shadow and a hairline border and its
 * padding tightens slightly, so it reads as lifting off the content.
 *
 * A thin client wrapper on purpose: the header's contents stay server-rendered
 * and are passed in as children. The scroll listener is passive and only flips a
 * boolean, so it never runs layout work per frame.
 */
import { useEffect, useState, type ReactNode } from 'react';

export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-card transition-[box-shadow,border-color,height] duration-300 ease-out ${
        scrolled
          ? 'h-[4rem] border-b border-border shadow-[0_4px_20px_-8px_rgba(39,39,66,0.18)]'
          : 'h-[var(--header-height)] border-b border-transparent'
      }`}
    >
      {children}
    </header>
  );
}
