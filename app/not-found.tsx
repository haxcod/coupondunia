/**
 * `app/not-found.tsx` — the global 404 surface (Req 5.2, 6.2, 8.2).
 *
 * Rendered when a route segment calls `notFound()` and for any unmatched URL.
 * Header/Footer are provided by the root layout, so this renders only its own
 * `<main>` content with a friendly message and links back into the site.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-16 w-16 text-muted"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>

      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-accent">
        404
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-4 text-secondary">
        The page you are looking for does not exist or may have moved. Try
        heading back home or browsing our categories.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex cursor-pointer items-center justify-center rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to home
        </Link>
        <Link
          href="/categories"
          className="inline-flex cursor-pointer items-center justify-center rounded-control border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Browse categories
        </Link>
      </div>
    </main>
  );
}
