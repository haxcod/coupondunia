/*
 * Header (Server Component) — the site-wide fixed header (Req 1.1).
 *
 * Renders the site logo (linking home), the search field, and the primary
 * navigation. On medium-and-up viewports the nav links render inline; below
 * that they collapse into an accessible {@link MobileMenu} toggle. It is a
 * Server Component so it stays part of the static shell; only the search input
 * ({@link SearchBar}) and the mobile menu are client islands.
 *
 * Positioning uses `sticky top-0` set to `--header-height`: sticky keeps the
 * header pinned while scrolling (Req 1.1) *and* reserves its own space in the
 * normal document flow, so page content is never hidden behind it (the
 * ui-ux-pro-max fixed-nav layout rule) without callers needing a manual
 * padding offset.
 *
 * All dynamic data is passed in as props (with sensible defaults) so pages can
 * source the site name/logo from Settings; the component never reads settings
 * itself.
 */
import Link from 'next/link';

import { SearchBar } from './SearchBar';
import { MobileMenu } from './MobileMenu';
import { PRIMARY_NAV_LINKS } from './nav-links';

export interface HeaderProps {
  /** Brand name shown as a wordmark when no logo image is configured. */
  siteName?: string;
  /** Optional logo image URL; falls back to the site-name wordmark. */
  logoUrl?: string | null;
  /** Placeholder text for the search field. */
  searchPlaceholder?: string;
}

export function Header({
  siteName = 'DealSpark',
  logoUrl = null,
  searchPlaceholder = 'Search products, deals, stores...',
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 h-[var(--header-height)] border-b border-border bg-card">
      <div className="mx-auto flex h-full w-full max-w-content items-center gap-3 px-4 sm:gap-4">
        {/* Logo → home */}
        <Link
          href="/"
          aria-label={`${siteName} home`}
          className="flex shrink-0 cursor-pointer items-center gap-2"
        >
          {logoUrl ? (
            // Logo is an admin-uploaded asset of arbitrary aspect ratio; a
            // plain <img> with a height constraint keeps it crisp without
            // remote-loader configuration.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="h-8 w-auto" />
          ) : (
            <span className="text-xl font-bold tracking-tight text-foreground">
              {siteName}
            </span>
          )}
        </Link>

        {/* Search (the sole client island on desktop) */}
        <div className="min-w-0 flex-1">
          <SearchBar placeholder={searchPlaceholder} />
        </div>

        {/* Primary navigation — inline on md+, collapsed into a menu below md */}
        <nav
          aria-label="Primary"
          className="hidden shrink-0 items-center gap-1 md:flex"
        >
          {PRIMARY_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="cursor-pointer whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile collapsible menu (client island) */}
        <MobileMenu links={PRIMARY_NAV_LINKS} />
      </div>
    </header>
  );
}
