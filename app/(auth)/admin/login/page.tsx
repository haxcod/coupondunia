/**
 * `/admin/login` — administrator login page (Task 14.3, Req 13.2–13.5, 25.10).
 *
 * This page deliberately lives in the `(auth)` route group, OUTSIDE the guarded
 * `(admin)` group, so it is reachable while logged out and never triggers the
 * authoritative redirect in `app/(admin)/admin/layout.tsx`.
 *
 * The shell is a small Server Component (it only renders static chrome + the
 * client form), while {@link LoginForm} owns all interactivity: client-side
 * validation, the `POST /api/admin/auth` call, lockout messaging, and the
 * post-success redirect to `/admin/dashboard` (Req 13.2). This keeps the admin
 * surface client-rendered (Req 25.10) without a top-level `'use client'` page.
 */
import type { Metadata } from "next";

import Image from "next/image";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-card border border-border bg-card p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4">
              <Image
                src="/logo.png"
                alt="Coupon Saga"
                width={120}
                height={45}
                className="h-10 w-auto object-contain"
                priority
              />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              Admin sign in
            </h1>
            <p className="mt-1 text-sm text-secondary">
              Enter your credentials to access the dashboard.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
