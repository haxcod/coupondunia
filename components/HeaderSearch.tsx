'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="relative flex items-center"
    >
      <label htmlFor="header-search-input" className="sr-only">
        Search
      </label>

      {/* Underline container: compact width keeps the search text near the magnifier */}
      <div className="relative flex items-center">
        <input
          id="header-search-input"
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          autoComplete="off"
          className="h-8 w-28 border-b border-foreground/60 bg-transparent pr-1 text-sm text-foreground placeholder:text-foreground/70 transition-all duration-200 focus:w-40 focus:border-accent focus:outline-none sm:w-32 sm:focus:w-44 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />

        <button
          type="submit"
          aria-label="Submit search"
          className="ml-1 flex h-8 w-8 items-center justify-center text-foreground transition-all duration-200 hover:scale-110 hover:text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4.5 w-4.5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </div>
    </form>
  );
}
