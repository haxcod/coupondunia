'use client';

/*
 * SearchBar (Client Component) — submits to /search?q=... so the results page (a
 * Server Component) can read the query. Two looks: the default icon-button field,
 * and a `cta` variant that pairs the field with a labelled "Find Deals" button
 * for the homepage hero.
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

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
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    
    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    });
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
          disabled={isPending}
          className={`${fieldHeight} w-full rounded-control border border-border bg-card pl-11 pr-4 text-sm text-foreground placeholder:text-muted transition-colors duration-200 focus:border-accent focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none`}
        />
      </div>

      {cta ? (
        <button
          type="submit"
          disabled={isPending}
          className={`${fieldHeight} shrink-0 rounded-control bg-accent px-6 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover disabled:opacity-80 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Searching...</span>
            </>
          ) : (
            cta
          )}
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Search"
          disabled={isPending}
          className={`${fieldHeight} flex aspect-square shrink-0 items-center justify-center rounded-control bg-accent text-white transition-colors duration-200 hover:bg-accent-hover disabled:opacity-80 disabled:cursor-not-allowed`}
        >
          {isPending ? (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
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
          )}
        </button>
      )}
    </form>
  );
}
