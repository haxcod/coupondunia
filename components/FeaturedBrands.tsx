/*
 * FeaturedBrands — the row of circular brand badges from the design. Each badge
 * links to a store-filtered search until dedicated store pages exist.
 */
import Link from 'next/link';

import type { StoreDTO } from '@/lib/catalog';
import { StoreLogo } from '@/components/StoreLogo';

export function FeaturedBrands({ stores }: { stores: StoreDTO[] }) {
  if (stores.length === 0) return null;

  return (
    <ul className="mt-8 flex flex-wrap items-center justify-center gap-6 sm:justify-between sm:gap-4">
      {stores.map((store) => (
        <li key={store.id}>
          <Link
            href={`/search?q=${encodeURIComponent(store.name)}`}
            aria-label={store.name}
            className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-card transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:border-accent hover:shadow-lg"
          >
            <StoreLogo name={store.name} logoUrl={store.logoUrl} size={56} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
