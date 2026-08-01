'use client';

/*
 * SearchBar (Client Component) — submits to /search?q=... so the results page (a
 * Server Component) can read the query. Two looks: the default icon-button field,
 * and a `cta` variant that pairs the field with a labelled "Find Deals" button
 * for the homepage hero.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export interface SearchBarProps {
  placeholder?: string;
  className?: string;
  /** When set, render a labelled submit button (e.g. "Find Deals") instead of the icon. */
  cta?: string;
  /** `lg` is the taller hero field. */
  size?: 'md' | 'lg';
}

export function SearchBar({
  placeholder = 'Search products, deals, stores...',
  className,
  cta,
  size = 'md',
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const fieldHeight = size === 'lg' ? 'h-14' : 'h-11';

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={`flex w-full items-center gap-2 ${className ?? ''}`}
    >
      <label htmlFor="site-search" className="sr-only">
        Search products, deals, and stores
      </label>
      <div className="relative flex-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          id="site-search"
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={`${fieldHeight} w-full rounded-control border border-border bg-card pl-11 pr-4 text-sm text-foreground placeholder:text-muted transition-colors duration-200 focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none`}
        />
      </div>

      {cta ? (
        <button
          type="submit"
          className={`${fieldHeight} shrink-0 rounded-control bg-accent px-6 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover`}
        >
          {cta}
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Search"
          className={`${fieldHeight} flex aspect-square shrink-0 items-center justify-center rounded-control bg-accent text-white transition-colors duration-200 hover:bg-accent-hover`}
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
      )}
    </form>
  );
}
