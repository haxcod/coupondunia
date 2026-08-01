/**
 * SEO / structured-data builders for DealSpark (Task 12.1).
 *
 * This module is the single source of truth for per-page SEO output:
 *
 *   - {@link buildMetadata} produces a Next.js `Metadata` object carrying exactly
 *     one **absolute** canonical URL (collapsed to the first page for paginated
 *     sets, Req 24.6/24.11), Open Graph title/description/image/url tags each
 *     with a non-empty value, with the image falling back to the designated
 *     default site image when a page has none (Req 24.7/24.8).
 *   - The JSON-LD builders emit Product, Offer, WebSite+SearchAction, and
 *     BreadcrumbList structured data (Req 24.9).
 *   - {@link stringifyJsonLd} serialises a structured-data object for embedding
 *     inside a `<script type="application/ld+json">` tag, escaping `<`, `>`, `&`
 *     (and the JSON-valid line/paragraph separators) so the payload can never
 *     break out of the script element or inject markup. The escaping uses JSON
 *     string unicode escapes, so `JSON.parse` round-trips back to the original
 *     object (Property 26).
 *   - {@link contentAlt} / {@link DECORATIVE_ALT} encode the alt-text rules
 *     (content images carry a 1–125 character description; decorative images
 *     carry an empty alt, Req 24.10).
 *
 * Every function here is **pure** (no database, no Next.js request runtime) so
 * Properties 25 and 26 (Tasks 12.2/12.3) can exercise them across many inputs.
 *
 * ## Affiliate-URL confidentiality (Req 7.9 / 24.1)
 * None of these builders ever accept or emit an affiliate/destination URL. The
 * `url` fields written into metadata and JSON-LD are always **public page**
 * URLs (the canonical page, the site root, a category/product/deal page). The
 * destination URL is revealed only by `POST /api/public/click` and must never
 * reach server-rendered HTML or the RSC payload.
 */
import type { Metadata } from 'next';

// =============================================================================
// SECTION 1 — Site base URL + absolute URL helpers
// =============================================================================

/**
 * Fallback site origin used when `NEXT_PUBLIC_SITE_URL` is not configured. It is
 * an absolute `https://` origin so canonical/OG URLs are always absolute even
 * in local/test environments (Req 24.6).
 */
export const DEFAULT_SITE_URL = 'https://www.dealspark.in';

/** Path of the default Open Graph image route (see Task 12.6). */
export const DEFAULT_OG_IMAGE_PATH = '/opengraph-image';

/** Query parameter that carries the page number for paginated listing sets. */
const PAGE_QUERY_PARAM = 'page';

/**
 * Resolve the configured site origin, normalised to an absolute `https://`
 * origin with no trailing slash. Reads `NEXT_PUBLIC_SITE_URL` and falls back to
 * {@link DEFAULT_SITE_URL}. Throwing on a malformed value would break every
 * page's metadata, so an unparseable env value falls back to the default.
 */
export function getSiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const candidate = configured && configured.length > 0 ? configured : DEFAULT_SITE_URL;
  try {
    const url = new URL(candidate);
    // Drop any path/search/hash and the trailing slash — we want a bare origin.
    return url.origin;
  } catch {
    return new URL(DEFAULT_SITE_URL).origin;
  }
}

/**
 * Resolve a path (or already-absolute URL) into an absolute URL against the
 * given base (defaulting to the configured site origin). An input that is
 * already absolute is returned as-is; a relative path is joined onto the base.
 */
export function toAbsoluteUrl(pathOrUrl: string, base: string = getSiteBaseUrl()): string {
  return new URL(pathOrUrl, `${base}/`).toString();
}

/**
 * Build the canonical absolute URL for a page. For paginated sets the canonical
 * always points to the **first page**, so the `page` query parameter is removed
 * (Req 24.11). The result is an absolute URL (Req 24.6).
 */
export function buildCanonicalUrl(
  pathOrUrl: string,
  base: string = getSiteBaseUrl(),
): string {
  const url = new URL(pathOrUrl, `${base}/`);
  // Collapse paginated sets to the first page (Req 24.11).
  url.searchParams.delete(PAGE_QUERY_PARAM);
  return url.toString();
}

// =============================================================================
// SECTION 2 — Alt-text rules (Req 24.10)
// =============================================================================

/** Empty alt attribute for purely decorative images (Req 24.10). */
export const DECORATIVE_ALT = '';

/** Maximum length of a content-image alt attribute (Req 24.10). */
export const MAX_ALT_LENGTH = 125;

/**
 * Produce a content-image alt attribute that describes the image subject,
 * guaranteed to be between 1 and {@link MAX_ALT_LENGTH} characters (Req 24.10).
 *
 * The primary subject text is trimmed and clamped to 125 characters. When it is
 * empty after trimming, the provided fallback (also clamped) is used so the
 * result is never empty for a content image.
 */
export function contentAlt(subject: string, fallback = 'DealSpark image'): string {
  const primary = subject.trim();
  const chosen = primary.length > 0 ? primary : fallback.trim();
  const safe = chosen.length > 0 ? chosen : 'DealSpark image';
  return safe.slice(0, MAX_ALT_LENGTH);
}

// =============================================================================
// SECTION 3 — Money formatting for structured data
// =============================================================================

/**
 * Convert an integer-paise amount into the decimal rupee string schema.org
 * expects for `price` (e.g. `12345` → `"123.45"`). Money is stored as integer
 * paise across the data layer (`lib/models/types.ts`).
 */
export function paiseToPriceString(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const remainder = Math.abs(paise % 100);
  return `${rupees}.${remainder.toString().padStart(2, '0')}`;
}

// =============================================================================
// SECTION 4 — buildMetadata (canonical + Open Graph, Req 24.6/24.7/24.8/24.11)
// =============================================================================

/** Inputs for {@link buildMetadata}. */
export interface BuildMetadataOptions {
  /** Page `<title>` / `og:title`. Must be a non-empty descriptive string. */
  title: string;
  /** Meta description / `og:description`. Falls back to the title when empty. */
  description: string;
  /**
   * The current page path (may include a `page` query param for paginated
   * listings). The canonical URL is derived from this, collapsed to the first
   * page (Req 24.11). May also be an absolute URL on this site.
   */
  path: string;
  /**
   * Open Graph image. A relative path is made absolute; an absolute URL is used
   * as-is. When absent/empty the default site image is used (Req 24.8).
   */
  imageUrl?: string | null;
  /** Open Graph `og:site_name`. */
  siteName?: string;
  /** Open Graph type (`website` for listings, `article`/`product` for details). */
  ogType?: 'website' | 'article';
  /** Override the site origin (primarily for tests). */
  baseUrl?: string;
  /** Override the default OG image path (primarily for tests). */
  defaultImagePath?: string;
}

/**
 * Build a Next.js `Metadata` object with exactly one absolute canonical URL and
 * a complete set of non-empty Open Graph tags (Req 24.6/24.7/24.8/24.11).
 *
 * Invariants guaranteed for any input:
 *   - `alternates.canonical` is a single absolute URL pointing at the first page
 *     of a paginated set.
 *   - `openGraph.title`, `.description`, `.url`, and `.images[0].url` are all
 *     non-empty; the image defaults to the designated site image when none is
 *     supplied.
 */
export function buildMetadata(options: BuildMetadataOptions): Metadata {
  const base = options.baseUrl ?? getSiteBaseUrl();
  const defaultImagePath = options.defaultImagePath ?? DEFAULT_OG_IMAGE_PATH;

  const title = options.title.trim();
  // og:description must never be empty (Req 24.7); fall back to the title.
  const descriptionRaw = options.description.trim();
  const description = descriptionRaw.length > 0 ? descriptionRaw : title;

  const canonical = buildCanonicalUrl(options.path, base);

  const hasImage =
    typeof options.imageUrl === 'string' && options.imageUrl.trim().length > 0;
  const imageUrl = toAbsoluteUrl(
    hasImage ? (options.imageUrl as string).trim() : defaultImagePath,
    base,
  );

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: options.siteName,
      type: options.ogType ?? 'website',
      images: [{ url: imageUrl }],
    },
  };
}

// =============================================================================
// SECTION 5 — JSON-LD structured data builders (Req 24.9)
// =============================================================================

/** A minimal structured-data object (always carries `@context`/`@type`). */
export type JsonLd = Record<string, unknown>;

const SCHEMA_CONTEXT = 'https://schema.org';

/** Inputs for {@link buildProductJsonLd} (no affiliate URL, Req 7.9/24.1). */
export interface ProductJsonLdInput {
  /** Public product page path or absolute URL (NOT the affiliate URL). */
  path: string;
  title: string;
  description: string;
  storeName: string;
  /** Current price in integer paise. */
  currentPrice: number;
  /** Primary image URL (relative or absolute). */
  primaryImageUrl: string;
  /** Optional additional image URLs. */
  additionalImages?: readonly string[];
  /** Whether the product can currently be purchased (controls availability). */
  inStock?: boolean;
  baseUrl?: string;
}

/**
 * Build `Product` JSON-LD for a product page (Req 24.9). `offers.url` is the
 * public product page — never the affiliate/destination URL (Req 7.9/24.1).
 */
export function buildProductJsonLd(input: ProductJsonLdInput): JsonLd {
  const base = input.baseUrl ?? getSiteBaseUrl();
  const pageUrl = buildCanonicalUrl(input.path, base);
  const images = [input.primaryImageUrl, ...(input.additionalImages ?? [])]
    .filter((src) => typeof src === 'string' && src.trim().length > 0)
    .map((src) => toAbsoluteUrl(src, base));

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Product',
    name: input.title,
    description: input.description,
    image: images,
    brand: { '@type': 'Brand', name: input.storeName },
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'INR',
      price: paiseToPriceString(input.currentPrice),
      availability: `${SCHEMA_CONTEXT}/${
        input.inStock === false ? 'OutOfStock' : 'InStock'
      }`,
    },
  };
}

/** Inputs for {@link buildOfferJsonLd} (no destination URL, Req 7.9/24.1). */
export interface OfferJsonLdInput {
  /** Public deal page path or absolute URL (NOT the destination URL). */
  path: string;
  headline: string;
  storeName: string;
  description?: string | null;
  /** When the deal stops being valid (used for `validThrough`). */
  validUntil?: Date | null;
  /** When the deal becomes valid (used for `availabilityStarts`). */
  validFrom?: Date | null;
  baseUrl?: string;
}

/**
 * Build `Offer` JSON-LD for a deal page (Req 24.9). `url` is the public deal
 * page — never the destination URL (Req 7.9/24.1).
 */
export function buildOfferJsonLd(input: OfferJsonLdInput): JsonLd {
  const base = input.baseUrl ?? getSiteBaseUrl();
  const pageUrl = buildCanonicalUrl(input.path, base);

  const offer: JsonLd = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Offer',
    name: input.headline,
    url: pageUrl,
    seller: { '@type': 'Organization', name: input.storeName },
  };

  if (input.description && input.description.trim().length > 0) {
    offer.description = input.description.trim();
  }
  if (input.validFrom) {
    offer.availabilityStarts = input.validFrom.toISOString();
  }
  if (input.validUntil) {
    offer.validThrough = input.validUntil.toISOString();
  }

  return offer;
}

/** Inputs for {@link buildWebSiteJsonLd}. */
export interface WebSiteJsonLdInput {
  siteName: string;
  /** Path that handles a search query; `{search_term_string}` is appended. */
  searchPath?: string;
  baseUrl?: string;
}

/**
 * Build `WebSite` JSON-LD with a `SearchAction` for the homepage (Req 24.9).
 * The search target is the public `/search` endpoint with the standard
 * `{search_term_string}` placeholder.
 */
export function buildWebSiteJsonLd(input: WebSiteJsonLdInput): JsonLd {
  const base = input.baseUrl ?? getSiteBaseUrl();
  const searchPath = input.searchPath ?? '/search';
  // Build the search target manually so the `{search_term_string}` placeholder
  // is preserved literally (URL encoding would mangle the braces).
  const searchTarget = `${toAbsoluteUrl(searchPath, base).replace(/\/$/, '')}?q={search_term_string}`;

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    name: input.siteName,
    url: toAbsoluteUrl('/', base),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: searchTarget,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** A single breadcrumb entry: a label and the public path/URL it points to. */
export interface BreadcrumbItem {
  name: string;
  /** Public page path or absolute URL for this crumb. */
  path: string;
}

/**
 * Build `BreadcrumbList` JSON-LD for category and product pages (Req 24.9).
 * Positions are 1-based and `item` values are absolute public URLs.
 */
export function buildBreadcrumbListJsonLd(
  items: readonly BreadcrumbItem[],
  baseUrl: string = getSiteBaseUrl(),
): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.path, baseUrl),
    })),
  };
}

// =============================================================================
// SECTION 6 — XSS-safe JSON-LD serialisation (Req 24.9 / Property 26)
// =============================================================================

/**
 * Serialise a structured-data object for embedding inside a
 * `<script type="application/ld+json">` element.
 *
 * `<`, `>`, and `&` are replaced with their JSON unicode escapes (`\u003c`,
 * `\u003e`, `\u0026`) so the payload cannot terminate the script element early
 * or inject markup (e.g. a literal `</script>` becomes `\u003c/script\u003e`).
 * The JSON line/paragraph separators (`\u2028`/`\u2029`), which are valid in
 * JSON but illegal in a JavaScript string literal, are escaped too.
 *
 * Because every replacement is a valid JSON unicode escape, `JSON.parse` of the
 * result reproduces the original object exactly (Property 26 round-trip).
 */
export function stringifyJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
