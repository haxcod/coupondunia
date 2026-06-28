'use client';

/*
 * MobileMenu (Client Component) — the collapsible primary-navigation menu shown
 * on small viewports where the full inline nav does not fit beside the search
 * field. It is a client island because it owns the open/closed state.
 *
 * Accessibility:
 * - The toggle is a real <button> with `aria-expanded` / `aria-controls` and an
 *   `aria-label` that reflects the action.
 * - The panel closes on Escape, on outside click, and on navigation (link
 *   click) so it never traps focus or lingers after routing.
 * - Hover/focus feedback uses color transitions only (no layout-shifting
 *   transforms), per the project UI rules.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { NavLink } from './nav-links';

export interface MobileMenuProps {
  links: readonly NavLink[];
}

export function MobileMenu({ links }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close the menu whenever the route changes (after a link is followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape and on clicks outside the menu container.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0 md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-control text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* Icon: hamburger / close (SVG, no emoji) */}
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
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-nav-panel"
          aria-label="Primary"
          className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-control border border-border bg-card py-1 shadow-lg"
        >
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== '/' && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`block cursor-pointer px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-background hover:text-accent ${
                  active ? 'text-accent' : 'text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
