/**
 * `app/sitemap.ts` — the Sitemap_Generator metadata route (Task 12.4).
 *
 * Emits the absolute canonical URL of every active Category, Product, and Deal
 * (Req 24.2). When the active count exceeds 50,000 URLs, `generateSitemaps`
 * returns one descriptor per 50,000-URL partition and Next.js exposes them at
 * `/sitemap/[id].xml`, referenced from the `/sitemap.xml` index (Req 24.3).
 *
 * The data loaders throw if the catalog cannot be read or the site origin is
 * unconfigured, so Next.js returns an error response instead of a partial or
 * empty 200 sitemap (Req 24.4). We intentionally do **not** catch those errors.
 *
 * Next 16 note: the `id` passed to the default export is a Promise that
 * resolves to a string (`v16.0.0`), so it must be awaited.
 *
 * Build-time note: `cacheComponents` is enabled, so Next.js would otherwise try
 * to evaluate this route while collecting page data at build time — where there
 * is no database/`MONGODB_URI`. The sitemap is inherently request-time data, so
 * the default `sitemap` handler calls `connection()` to halt prerendering and
 * run the DB-backed loaders only at request time, where they still throw on a
 * real read failure so Next.js returns an error response instead of a
 * partial/empty 200 sitemap (Req 24.4). `generateSitemaps` cannot use
 * `connection()` (Next runs it inside `generateStaticParams` at build, with no
 * request), so it tolerates a missing database at build by falling back to a
 * single descriptor — see its doc comment.
 */
import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import {
  SITEMAP_URL_LIMIT,
  getActiveSitemapEntries,
  getActiveSitemapUrlCount,
  selectSitemapPartition,
  sitemapPartitionCount,
} from '@/lib/sitemap';

/**
 * Decide how many sitemap files to generate. One file while the active URL
 * count is ≤ 50,000; otherwise `ceil(count / 50,000)` files (Req 24.3).
 *
 * Next.js invokes `generateSitemaps` from the generated `generateStaticParams`
 * (at build time, with no HTTP request) *and* from the request-time route
 * handler. We therefore cannot use `connection()` here — it is illegal inside
 * `generateStaticParams`. During `next build` there is no database, so the
 * count read fails; we fall back to a single sitemap descriptor so page-data
 * collection succeeds. The partition's contents are still produced at request
 * time by `sitemap()` below, which calls `connection()` and throws on a genuine
 * read failure (Req 24.4). At request time with a reachable database this
 * returns the true partition list (Req 24.3).
 */
export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const total = await getActiveSitemapUrlCount();
    const count = sitemapPartitionCount(total);
    return Array.from({ length: count }, (_unused, id) => ({ id }));
  } catch {
    return [{ id: 0 }];
  }
}

/**
 * Build the `<urlset>` for sitemap partition `id`. Loads the full ordered set
 * of active-catalog URLs and returns the 50,000-URL window for this partition.
 */
export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  // Defer to request time: the catalog read must not run during build-time
  // page-data collection where there is no database (Req 24.4).
  await connection();
  const partitionId = Number(await id);
  const entries = await getActiveSitemapEntries();
  return selectSitemapPartition(entries, partitionId, SITEMAP_URL_LIMIT).map(
    (entry) => ({
      url: entry.url,
      lastModified: entry.lastModified,
      changeFrequency: 'daily',
      priority: 0.7,
    }),
  );
}
