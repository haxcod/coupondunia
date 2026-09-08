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
import type { NavCategoryTreeItem } from '@/lib/catalog';
import { CategoryNavIcon } from './CategoryNavIcon';

export interface MobileMenuProps {
  links: readonly NavLink[];
  categories?: NavCategoryTreeItem[];
}

export function MobileMenu({ links, categories = [] }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const pathname = usePathname();

  // Adjust state during render when pathname changes (React recommended pattern)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
    setCategoriesExpanded(false);
    setExpandedCategoryId(null);
  }

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
        // Explicit transform (not the Tailwind translate utility) so the closed
        // drawer is reliably pushed fully off-screen across engines.
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
        className="fixed right-0 top-0 z-50 flex h-full w-80 max-w-[85vw] flex-col bg-card shadow-xl transition-transform duration-300 ease-out md:hidden"
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

        <nav aria-label="Primary" className="flex flex-1 flex-col overflow-y-auto py-2">
          {links.map((link, index) => {
            const active =
              pathname === link.href ||
              (link.href !== '/' && pathname.startsWith(`${link.href}/`));

            const isCategoriesLink = link.label === 'Categories' && categories.length > 0;

            if (isCategoriesLink) {
              return (
                <div key={link.href} className="flex flex-col">
                  <div
                    style={{
                      transitionDelay: open ? `${120 + index * 45}ms` : '0ms',
                    }}
                    className={`flex items-center justify-between px-5 py-3 text-base font-medium transition-all duration-300 ease-out hover:bg-surface ${
                      active ? 'text-accent' : 'text-foreground'
                    } ${open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex-1 hover:text-accent"
                    >
                      {link.label}
                    </Link>
                    <button
                      type="button"
                      aria-label="Toggle categories submenu"
                      onClick={() => setCategoriesExpanded((prev) => !prev)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-brand-soft hover:text-accent"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-4 w-4 transition-transform duration-200 ${
                          categoriesExpanded ? 'rotate-180 text-accent' : ''
                        }`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>

                  {/* Expandable Categories List */}
                  {categoriesExpanded && (
                    <div className="mb-2 ml-4 mr-3 flex flex-col space-y-1 rounded-xl border border-border/80 bg-surface/40 p-2 text-sm">
                      <Link
                        href="/categories"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-accent hover:bg-brand-soft"
                      >
                        <CategoryNavIcon name="all" className="h-3.5 w-3.5" />
                        <span>All Categories &rarr;</span>
                      </Link>

                      {categories.map((cat) => {
                        const hasSubs = cat.subcategories.length > 0;
                        const isSubExpanded = expandedCategoryId === cat.id;

                        return (
                          <div key={cat.id} className="flex flex-col">
                            <div className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-surface">
                              <Link
                                href={`/category/${cat.slug}`}
                                onClick={() => setOpen(false)}
                                className="flex flex-1 items-center gap-2 text-xs font-medium text-foreground hover:text-accent"
                              >
                                {cat.iconUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={cat.iconUrl} alt="" className="h-3.5 w-3.5 object-contain" />
                                ) : (
                                  <CategoryNavIcon name={cat.name} className="h-3.5 w-3.5 text-secondary" />
                                )}
                                <span>{cat.name}</span>
                              </Link>

                              {hasSubs && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCategoryId((prev) =>
                                      prev === cat.id ? null : cat.id,
                                    )
                                  }
                                  className="p-1 text-muted hover:text-accent"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    className={`h-3 w-3 transition-transform ${
                                      isSubExpanded ? 'rotate-180 text-accent' : ''
                                    }`}
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                              )}
                            </div>

                            {/* Subcategories list */}
                            {hasSubs && isSubExpanded && (
                              <div className="ml-5 mt-1 flex flex-col space-y-1 border-l-2 border-accent/20 pl-2">
                                {cat.subcategories.map((sub) => (
                                  <Link
                                    key={sub.id}
                                    href={`/category/${sub.slug}`}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-1.5 py-1 text-[11px] text-secondary transition-colors hover:text-accent"
                                  >
                                    <span className="h-1 w-1 rounded-full bg-accent/60" />
                                    <span>{sub.name}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                /*
                 * Each link eases in behind the drawer once it opens, and resets
                 * while closed so the sequence replays on every open.
                 */
                style={{
                  transitionDelay: open ? `${120 + index * 45}ms` : '0ms',
                }}
                className={`block cursor-pointer px-5 py-3.5 text-base font-medium transition-all duration-300 ease-out hover:bg-surface hover:text-accent ${
                  active ? 'text-accent' : 'text-foreground'
                } ${open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
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
