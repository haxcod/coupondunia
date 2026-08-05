/*
 * Shared primary-navigation definition used by the desktop header nav and the
 * mobile menu so both surfaces stay in sync. Mirrors the Coupon Saga design
 * header. "Stores" and "Blogs" are new sections; "Today's Deals" points at the
 * existing deals listing.
 */
export interface NavLink {
  label: string;
  href: string;
}

export const PRIMARY_NAV_LINKS: readonly NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Categories', href: '/categories' },
  { label: 'Stores', href: '/stores' },
  { label: "Today's Deals", href: '/deals' },
  { label: 'Blogs', href: '/blogs' },
];
