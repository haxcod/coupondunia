'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { StoreDTO } from '@/lib/catalog';

interface StoresAlphabetDirectoryProps {
  stores: readonly StoreDTO[];
  initialLetter?: string;
}

const ALPHABET_ROWS = [
  ['0/9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
  ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
];

function getInitialGroup(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '0/9';
  const firstChar = trimmed[0].toUpperCase();
  if (firstChar >= 'A' && firstChar <= 'Z') {
    return firstChar;
  }
  return '0/9';
}

export function StoresAlphabetDirectory({
  stores,
  initialLetter = 'A',
}: StoresAlphabetDirectoryProps) {
  const [selectedLetter, setSelectedLetter] = useState(initialLetter.toUpperCase());
  const [filterQuery, setFilterQuery] = useState('');

  // Group stores by initial
  const storesByGroup = useMemo(() => {
    const map = new Map<string, StoreDTO[]>();
    for (const store of stores) {
      const group = getInitialGroup(store.name);
      const list = map.get(group) ?? [];
      list.push(store);
      map.set(group, list);
    }
    return map;
  }, [stores]);

  // Current stores for the selected letter
  const currentStores = useMemo(() => {
    const list = storesByGroup.get(selectedLetter) ?? [];
    if (!filterQuery.trim()) return list;
    const q = filterQuery.toLowerCase();
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [storesByGroup, selectedLetter, filterQuery]);

  return (
    <div className="w-full">
      {/* Alphabet Pills Bar */}
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2.5">
        {ALPHABET_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
            {row.map((letter) => {
              const count = storesByGroup.get(letter)?.length ?? 0;
              const isSelected = selectedLetter === letter;

              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => {
                    setSelectedLetter(letter);
                    setFilterQuery('');
                  }}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-xs font-semibold transition-all duration-200 sm:h-10 sm:min-w-10 sm:text-sm ${
                    isSelected
                      ? 'bg-foreground text-background shadow-sm'
                      : count > 0
                        ? 'bg-card text-foreground border border-border/80 hover:border-accent hover:text-accent'
                        : 'bg-card/40 text-muted/60 border border-border/40 hover:text-foreground'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`Stores starting with ${letter} (${count} available)`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-auto my-10 max-w-4xl border-b border-border/60" />

      {/* Stores Header & Count */}
      <div className="mb-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <h2 className="text-lg font-bold text-foreground sm:text-xl">
          Stores starting with &ldquo;{selectedLetter}&rdquo;
          <span className="ml-2 text-sm font-normal text-secondary">
            ({currentStores.length} {currentStores.length === 1 ? 'store' : 'stores'})
          </span>
        </h2>

        {/* Quick search input within letter */}
        <div className="relative w-full max-w-xs sm:w-64">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={`Filter ${selectedLetter} stores...`}
            className="h-9 w-full rounded-control border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Store Names Directory List — 3 to 4 columns */}
      {currentStores.length > 0 ? (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {currentStores.map((store) => (
            <li key={store.id} className="min-w-0">
              <Link
                href={`/search?q=${encodeURIComponent(store.name)}`}
                className="group flex items-center gap-2 py-0.5 text-sm font-medium text-foreground transition-colors hover:text-accent"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border transition-colors group-hover:bg-accent" />
                <span className="truncate">{store.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-card border border-border bg-card px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">
            No stores starting with &ldquo;{selectedLetter}&rdquo;
          </p>
          <p className="mt-1.5 text-sm text-secondary">
            Try selecting a different letter from the alphabet bar above.
          </p>
        </div>
      )}
    </div>
  );
}
