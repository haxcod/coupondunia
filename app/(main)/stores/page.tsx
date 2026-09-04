import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';

import { StoresAlphabetDirectory } from '@/components/StoresAlphabetDirectory';
import { Newsletter } from '@/components/Newsletter';
import { getAllStores } from '@/lib/catalog';
import { buildMetadata } from '@/lib/seo';

/*
 * `/stores` — store directory by initials (matching Couponology style):
 * an alphabet index (0-9, A-Z) displaying store names organized by initials.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: 'All Stores',
    description:
      'Browse verified coupons, promo codes, and deals by store name initials.',
    path: '/stores',
    siteName: 'Coupon Saga',
    ogType: 'website',
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

export default function StoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="flex-1">
      <Suspense fallback={<StoresSkeleton />}>
        <StoresContent searchParams={searchParams} />
      </Suspense>

      <div className="mt-16">
        <Newsletter />
      </div>
    </main>
  );
}

async function StoresContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const [params, stores] = await Promise.all([
    searchParams,
    getAllStores(),
  ]);

  const initialLetter =
    (Array.isArray(params.letter) ? params.letter[0] : params.letter) ?? 'A';

  return (
    <section className="mx-auto w-full max-w-content px-4 py-12 sm:py-16">
      {/* Hero Header matching Couponology */}
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <span className="text-xs font-extrabold uppercase tracking-wider text-accent">
          Stores Directory
        </span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          Find your <span className="italic text-accent">favorite store</span>
        </h1>
        <p className="mt-3 text-sm text-secondary sm:text-base">
          Browse by store and find verified coupons, promo codes, and exclusive deals.
        </p>
      </div>

      <StoresAlphabetDirectory
        stores={stores}
        initialLetter={initialLetter}
      />
    </section>
  );
}

function StoresSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-content px-4 py-12 sm:py-16">
      <div className="mx-auto h-10 w-64 skeleton rounded-control" />
      <div className="mx-auto mt-3 h-5 w-96 max-w-full skeleton rounded-control" />

      <div className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2">
        {Array.from({ length: 26 }).map((_, index) => (
          <div
            key={index}
            className="h-10 w-10 skeleton rounded-full"
          />
        ))}
      </div>

      <div className="mx-auto my-10 max-w-4xl border-b border-border/60" />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="h-7 skeleton rounded-control"
          />
        ))}
      </div>
    </div>
  );
}
