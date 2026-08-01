'use client';

/*
 * Desktop primary nav (client island). Split out of the server Header so it can
 * read the current path and render the active item's purple underline, matching
 * the Coupon Saga design.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { NavLink } from './nav-links';

export function PrimaryNav({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
      {links.map((link) => {
        const active =
          link.href === '/'
            ? pathname === '/'
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`group/nav relative py-1 text-sm font-medium transition-colors duration-200 hover:text-accent ${
              active ? 'text-accent' : 'text-foreground'
            }`}
          >
            {link.label}
            {/*
              The rule is always present and scales in from the centre, so moving
              between items reads as the underline growing rather than blinking.
              Hovering a non-active item previews it at reduced strength.
            */}
            <span
              aria-hidden="true"
              className={`absolute -bottom-1 left-0 h-0.5 w-full origin-center rounded-badge bg-accent transition-transform duration-300 ease-out ${
                active ? 'scale-x-100' : 'scale-x-0 group-hover/nav:scale-x-100'
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
