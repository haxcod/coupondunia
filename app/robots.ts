/**
 * `app/robots.ts` — the public `robots.txt` (Task 12.4).
 *
 * Allows crawling of the public site, disallows the admin panel (`/admin`) and
 * the API surface (`/api`), and references the sitemap index so crawlers can
 * discover every active Category/Product/Deal URL (Req 24.5).
 *
 * Unlike the sitemap, `robots.txt` must **always** serve a valid response — a
 * crawler that cannot read `robots.txt` may treat the whole site as disallowed.
 * `getSiteBaseUrl()` throws when `NEXT_PUBLIC_SITE_URL` is unconfigured (e.g.
 * during `next build`), so we fall back to a relative `/sitemap.xml` reference
 * rather than failing the route. The disallow rules — the security-relevant
 * part of Req 24.5 — are always emitted regardless of origin configuration.
 */
import type { MetadataRoute } from 'next';

import { getSiteBaseUrl, joinUrl } from '@/lib/sitemap';

/**
 * Resolve the absolute sitemap URL, falling back to a root-relative path when
 * the site origin is unconfigured so `robots.txt` always serves.
 */
function resolveSitemapUrl(): string {
  try {
    return joinUrl(getSiteBaseUrl(), '/sitemap.xml');
  } catch {
    return '/sitemap.xml';
  }
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: resolveSitemapUrl(),
  };
}
