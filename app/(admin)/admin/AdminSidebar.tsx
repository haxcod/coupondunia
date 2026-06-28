"use client";

/**
 * Admin shell navigation (client) — Task 15.5, Req 25.10, 26.2.
 *
 * Rendered inside the guarded `(admin)` layout, this is the persistent chrome
 * shared by every `/admin/*` page (dashboard, products, deals, categories,
 * banners, analytics, settings). The admin panel is client-rendered (Req 25.10)
 * so navigation highlighting (`usePathname`) and the logout action live here.
 *
 * Logout POSTs `{ action: 'logout' }` to `/api/admin/auth` to invalidate the
 * session cookie (Req 13.7), then redirects to `/admin/login` and refreshes so
 * the guarded server layout re-evaluates the now-absent session.
 *
 * The sidebar uses the dedicated `--color-admin-sidebar` token (Req 26.2). On
 * narrow viewports it collapses into a top bar with an accessible drawer.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

/** Shared 24×24 stroke icon wrapper (ui-ux-pro-max: consistent SVG icons). */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      {children}
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </Icon>
    ),
  },
  {
    href: "/admin/products",
    label: "Products",
    icon: (
      <Icon>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </Icon>
    ),
  },
  {
    href: "/admin/deals",
    label: "Deals",
    icon: (
      <Icon>
        <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </Icon>
    ),
  },
  {
    href: "/admin/categories",
    label: "Categories",
    icon: (
      <Icon>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </Icon>
    ),
  },
  {
    href: "/admin/banners",
    label: "Banners",
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
      </Icon>
    ),
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: (
      <Icon>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </Icon>
    ),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </Icon>
    ),
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      // Even if the network call fails, send the admin back to the login page;
      // the guarded layout will re-check the session on arrival.
    }
    router.push("/admin/login");
    router.refresh();
  }

  const navLinks = (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`flex cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "bg-accent text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const logoutButton = (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="flex w-full cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm font-medium text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </Icon>
      <span>{loggingOut ? "Signing out…" : "Log out"}</span>
    </button>
  );

  const brand = (
    <Link
      href="/admin/dashboard"
      className="flex cursor-pointer items-center gap-2 px-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-accent text-white">
        <Icon>
          <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </Icon>
      </span>
      <span className="text-base font-semibold tracking-tight">DealSpark</span>
    </Link>
  );

  return (
    <>
      {/* Mobile top bar (below lg) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-admin-sidebar px-4 py-3 lg:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="admin-mobile-nav"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex cursor-pointer items-center justify-center rounded-control p-2 text-white transition-colors duration-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {open ? (
            <Icon>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
          ) : (
            <Icon>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </Icon>
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="admin-mobile-nav"
            aria-label="Admin"
            className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-4 overflow-y-auto bg-admin-sidebar py-4"
          >
            <div className="flex items-center justify-between pr-4">{brand}</div>
            <div className="flex-1 px-3">{navLinks}</div>
            <div className="border-t border-white/10 px-3 pt-3">
              {logoutButton}
            </div>
          </nav>
        </div>
      )}

      {/* Desktop persistent sidebar (lg and up) */}
      <nav
        aria-label="Admin"
        className="sticky top-0 z-20 hidden h-screen w-64 shrink-0 flex-col gap-4 bg-admin-sidebar py-5 lg:flex"
      >
        <div className="pb-2">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3">{navLinks}</div>
        <div className="border-t border-white/10 px-3 pt-3">{logoutButton}</div>
      </nav>
    </>
  );
}
