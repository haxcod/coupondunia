/*
 * Shared primary-navigation definition used by the desktop header nav and the
 * mobile menu so both surfaces stay in sync. Only routes that actually exist as
 * public pages are listed here.
 */
export interface NavLink {
  label: string;
  href: string;
}

export const PRIMARY_NAV_LINKS: readonly NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Categories', href: '/categories' },
  { label: 'Coupons', href: '/deals' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];
