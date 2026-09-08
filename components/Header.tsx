/*
 * Header (Server Component) — the site-wide sticky header from the Coupon Saga
 * design: brand lockup on the left, centered primary nav, and search + account
 * actions on the right. Stays a server component (part of the static shell);
 * the active-underline nav and the mobile drawer are the only client islands.
 *
 * Accounts are not part of the backend (user login is out of scope), so the
 * Login / Join Free controls are presentational.
 */
import Link from 'next/link';

import { HeaderSearch } from './HeaderSearch';
import { HeaderShell } from './HeaderShell';
import { Logo } from './Logo';
import { PrimaryNav } from './PrimaryNav';
import { MobileMenu } from './MobileMenu';
import { PRIMARY_NAV_LINKS } from './nav-links';
import type { NavCategoryTreeItem } from '@/lib/catalog';

export interface HeaderProps {
  /** Brand name for the logo alt text; the wordmark itself is the Coupon Saga lockup. */
  siteName?: string;
  /** Optional admin-uploaded logo image; falls back to the Coupon Saga lockup. */
  logoUrl?: string | null;
  /** Active categories with subcategories for the mega menu. */
  categories?: NavCategoryTreeItem[];
}

export function Header({
  siteName = 'Coupon Saga',
  logoUrl = null,
  categories = [],
}: HeaderProps) {
  return (
    <HeaderShell>
      <div className="mx-auto flex h-full w-full max-w-content items-center px-4">
        {/* Left: brand */}
        <div className="flex flex-1 items-center">
          {logoUrl ? (
            <Link href="/" aria-label={`${siteName} home`} className="inline-flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={siteName} className="h-9 w-auto" />
            </Link>
          ) : (
            <Logo />
          )}
        </div>

        {/* Center: primary nav */}
        <PrimaryNav links={PRIMARY_NAV_LINKS} categories={categories} />

        {/* Right: search + accounts */}
        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <HeaderSearch />
          </div>

          <Link
            href="/search"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-control text-foreground transition-all duration-200 hover:text-accent sm:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>

          <MobileMenu links={PRIMARY_NAV_LINKS} categories={categories} />
        </div>
      </div>
    </HeaderShell>
  );
}
