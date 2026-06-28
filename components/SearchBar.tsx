'use client';

/*
 * SearchBar (Client Component) — the interactive search input embedded in the
 * fixed Header (Req 1.1). It is intentionally the *only* client piece of the
 * header: submitting the form navigates to `/search?q=...` so the search
 * results page (a Server Component) can read the query from `searchParams`.
 *
 * Kept tiny on purpose so the rest of the header can stay a Server Component
 * and remain part of the static shell.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export interface SearchBarProps {
  /** Placeholder text shown in the empty search field. */
  placeholder?: string;
  /** Optional extra classes applied to the form element. */
  className?: string;
}

export function SearchBar({
  placeholder = 'Search products, deals, stores...',
  className,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    // An empty query has no meaningful destination; stay put (Req 1.1 search).
    if (trimmed.length === 0) {
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={`relative w-full${className ? ` ${className}` : ''}`}
    >
      <label htmlFor="site-search" className="sr-only">
        Search products, deals, and stores
      </label>
      <input
        id="site-search"
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-control border border-border bg-card pl-4 pr-11 text-sm text-foreground placeholder:text-muted transition-colors duration-200 focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-secondary transition-colors duration-200 hover:text-accent"
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
      </button>
    </form>
  );
}
