/**
 * Authoritative guard for all protected `/admin/*` pages (Task 14.2, Req 13.1).
 *
 * `proxy.ts` performs only an *optimistic* cookie-presence redirect; the
 * authoritative check is this Server Component layout calling `verifySession()`
 * and redirecting to `/admin/login` when there is no valid session — so a
 * forged/expired cookie that slips past the optimistic proxy check still cannot
 * reach any protected page.
 *
 * Routing note: the login page lives OUTSIDE this layout's subtree (in the
 * `(auth)` route group at `app/(auth)/admin/login`) so it is reachable while
 * logged out and never triggers a redirect loop. Every other `/admin/*` page is
 * placed under this `(admin)` route group and is therefore gated here.
 *
 * Reading the session cookie via `verifySession()` is dynamic (per-request,
 * never cached — Req 25.10). With Cache Components / Partial Prerendering the
 * cookie access must live inside a `<Suspense>` boundary so the static admin
 * shell (sidebar + chrome) can be prerendered while the authoritative session
 * check streams in. {@link AdminGuard} isolates that dynamic access.
 *
 * Beyond the guard, this layout also OWNS the admin chrome (Task 15.5): the
 * persistent sidebar navigation + logout action ({@link AdminSidebar}) shared
 * by every `/admin/*` page. Individual admin pages render only their own
 * content inside the `<main>` region below.
 */
import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { verifySession } from '@/lib/auth';

import AdminSidebar from './AdminSidebar';

/**
 * Authoritative per-request session gate. Reads the session cookie and
 * redirects unauthenticated requests to `/admin/login`; renders the protected
 * page content otherwise. Kept separate so its dynamic cookie access sits
 * inside the `<Suspense>` boundary below.
 */
async function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();
  if (!session) {
    redirect('/admin/login');
  }
  return <>{children}</>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <AdminSidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<AdminGuardFallback />}>
          <AdminGuard>{children}</AdminGuard>
        </Suspense>
      </main>
    </div>
  );
}

/** Minimal, accessible placeholder shown while the session check streams in. */
function AdminGuardFallback() {
  return (
    <div
      className="mx-auto h-40 max-w-content animate-pulse rounded-card border border-border bg-card"
      aria-hidden="true"
    />
  );
}
