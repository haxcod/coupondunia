'use client';

/*
 * MobileMenu (Client Component) — the collapsible primary navigation shown on
 * small viewports where the full inline nav does not fit beside the search
 * field. It is a client island because it owns the open/closed state.
 *
 * On open it slides in as an app-style drawer from the right edge (right → left)
 * over a dimming overlay; closing slides it back out. The drawer stays mounted
 * so the transform can animate both ways; the reduced-motion rule in globals.css
 * neutralizes the slide for users who prefer reduced motion.
 *
 * Accessibility:
 * - The toggle is a real <button> with `aria-expanded` / `aria-controls` and an
 *   `aria-label` that reflects the action.
 * - The panel closes on Escape, on overlay click, and on navigation (link
 *   click) so it never lingers after routing.
 * - While closed the drawer is `inert`, so its links are removed from the tab
 *   order and the accessibility tree.
 * - Body scroll is locked while the drawer is open.
 * - Hover/focus feedback uses color transitions only (no layout-shifting
 *   transforms), per the project UI rules.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { NavLink } from './nav-links';

export interface MobileMenuProps {
  links: readonly NavLink[];
}

export function MobileMenu({ links }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the menu whenever the route changes (after a link is followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape and lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="shrink-0 md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-control text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Dimming overlay — fades with the drawer. */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Slide-in drawer (right → left). Stays mounted so it can animate both
          ways; `inert` while closed removes it from tab order + a11y tree. */}
      <aside
        id="mobile-nav-panel"
        aria-label="Primary"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-72 max-w-[80vw] flex-col bg-card shadow-xl transition-transform duration-300 ease-out md:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold text-foreground">Menu</span>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-control text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav aria-label="Primary" className="flex flex-col py-2">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== '/' && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`block cursor-pointer px-5 py-3.5 text-base font-medium transition-colors duration-200 hover:bg-background hover:text-accent ${
                  active ? 'text-accent' : 'text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
