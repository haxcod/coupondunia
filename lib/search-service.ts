/**
 * Search_Service (Task 6.1).
 *
 * Implements the public catalog search contract (Req 11.3–11.7, 11.10, 21.1,
 * 21.2) plus anonymous search logging (Req 19.8):
 *
 * - Case-insensitive **substring** matching of a query (≥ 2 characters) across
 *   Product title/description, Store name, Category name, Deal headline, and
 *   Deal coupon code (Req 11.3/11.4/11.5).
 * - Exact Product-title matches are ranked ahead of partial matches (Req 11.6).
 * - Returns `{ products, productCount, deals, dealCount }` where the counts are
 *   the full matching-set sizes and each returned page is capped at ≤ 50 items
 *   (Req 21.1, Property 14).
 * - A query that matches nothing succeeds with empty collections (Req 21.2).
 * - Every search is recorded as an anonymous `SearchLog` (Req 19.8).
 *
 * **Affiliate-URL confidentiality (Req 7.9):** the public summaries returned
 * here deliberately exclude `Product.affiliateUrl` and `Deal.destinationUrl`.
 * Those URLs are only ever revealed by `POST /api/public/click`.
 */
import { connectToDatabase } from '@/lib/db';
import { Product, Deal, Store, Category, SearchLog } from '@/lib/models';
import type { DealType, EntityStatus } from '@/lib/models';
import type { SearchType } from '@/lib/validation';

/** Minimum query length that triggers matching (Req 11 — "at least 2 characters"). */
export const MIN_QUERY_LENGTH = 2;
/** Hard upper bound on the number of items returned per collection per page (Req 21.1). */
export const MAX_RESULTS = 50;
/** Cap stored in `SearchLog.query` (the model allows up to 200 chars). */
const MAX_LOGGED_QUERY_LENGTH = 200;

/**
 * Public, affiliate-URL-free Product summary returned by search (Req 7.9).
 */
export interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  storeName: string;
  storeLogoUrl: string | null;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  primaryImageUrl: string;
}

/**
 * Public, destination-URL-free Deal summary returned by search (Req 7.9).
 */
export interface DealSummary {
  id: string;
  headline: string;
  slug: string;
  storeName: string;
  storeLogoUrl: string | null;
  dealType: DealType;
  couponCode: string | null;
  discountValue: string | null;
  validUntil: Date | null;
}

/** Search request (mirrors the design `SearchQuery` contract). */
export interface SearchQuery {
  q: string;
  /** Which collections to search. Defaults to `'all'`. */
  type?: SearchType;
  /** Zero-based offset into the ranked result set (defaults to 0). */
  offset?: number;
  /** Page size, clamped to `MAX_RESULTS` (defaults to `MAX_RESULTS`). */
  limit?: number;
}

/** Search response (mirrors the design `SearchResults` contract). */
export interface SearchResults {
  products: ProductSummary[];
  productCount: number;
  deals: DealSummary[];
  dealCount: number;
}

/** Escape a user-supplied string so it is treated as a literal in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A populated store reference projected to the fields the summaries need. */
interface PopulatedStore {
  name: string;
  logoUrl: string | null;
}

/** Lean Product shape after store population (only the fields we select). */
interface LeanProduct {
  _id: { toString(): string };
  title: string;
  slug: string;
  storeId: PopulatedStore | null;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  primaryImageUrl: string;
}

/** Lean Deal shape after store population (only the fields we select). */
interface LeanDeal {
  _id: { toString(): string };
  headline: string;
  slug: string;
  storeId: PopulatedStore | null;
  dealType: DealType;
  couponCode: string | null;
  discountValue: string | null;
  validUntil: Date | null;
}

function toProductSummary(doc: LeanProduct): ProductSummary {
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    storeName: doc.storeId?.name ?? '',
    storeLogoUrl: doc.storeId?.logoUrl ?? null,
    currentPrice: doc.currentPrice,
    originalPrice: doc.originalPrice ?? null,
    discountPercent: doc.discountPercent ?? null,
    primaryImageUrl: doc.primaryImageUrl,
  };
}

function toDealSummary(doc: LeanDeal): DealSummary {
  return {
    id: doc._id.toString(),
    headline: doc.headline,
    slug: doc.slug,
    storeName: doc.storeId?.name ?? '',
    storeLogoUrl: doc.storeId?.logoUrl ?? null,
    dealType: doc.dealType,
    couponCode: doc.couponCode ?? null,
    discountValue: doc.discountValue ?? null,
    validUntil: doc.validUntil ?? null,
  };
}

const EMPTY_RESULTS: SearchResults = {
  products: [],
  productCount: 0,
  deals: [],
  dealCount: 0,
};

/** Persist an anonymous search-query log (Req 19.8). Never throws. */
async function logSearch(query: string, resultCount: number): Promise<void> {
  try {
    await SearchLog.create({
      query: query.slice(0, MAX_LOGGED_QUERY_LENGTH),
      resultCount,
    });
  } catch {
    // Logging is best-effort analytics; a failure must not break search.
  }
}

/**
 * Search the active catalog for Products and Deals matching `q`.
 *
 * Matching is case-insensitive substring matching across the searchable fields
 * (Req 11.3–11.5). Products are ranked exact-title-first (Req 11.6); within a
 * rank, more-clicked and newer items come first. Each returned collection is
 * paged by `offset`/`limit` and capped at {@link MAX_RESULTS} (Req 21.1), while
 * `productCount`/`dealCount` report the full matching-set sizes (Property 14).
 */
export async function search(query: SearchQuery): Promise<SearchResults> {
  const q = (query.q ?? '').trim();
  const type: SearchType = query.type ?? 'all';
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const limit = Math.min(
    MAX_RESULTS,
    Math.max(0, Math.trunc(query.limit ?? MAX_RESULTS)),
  );

  // Queries shorter than the minimum match nothing but still succeed and are
  // recorded for analytics (Req 21.2, 19.8).
  if (q.length < MIN_QUERY_LENGTH) {
    await logSearch(q, 0);
    return EMPTY_RESULTS;
  }

  await connectToDatabase();

  const escaped = escapeRegExp(q);
  const contains = new RegExp(escaped, 'i'); // case-insensitive substring
  const exactTitle = new RegExp(`^${escaped}$`, 'i'); // exact title (Req 11.6)

  // Store and Category names are searchable for both Products and Deals, so we
  // resolve the matching store/category ids once and reuse them in both filters.
  const [storeIds, categoryIds] = await Promise.all([
    Store.find({ name: contains }).distinct('_id'),
    Category.find({ name: contains }).distinct('_id'),
  ]);

  const searchProducts = type === 'product' || type === 'all';
  const searchDeals = type === 'deal' || type === 'all';

  const ACTIVE: EntityStatus = 'active';

  // ----- Products -----------------------------------------------------------
  let products: ProductSummary[] = [];
  let productCount = 0;
  if (searchProducts) {
    const productFilter = {
      status: ACTIVE,
      $or: [
        { title: contains },
        { description: contains },
        { storeId: { $in: storeIds } },
        { categoryId: { $in: categoryIds } },
      ],
    };

    const productDocs = await Product.find(productFilter)
      .select('title slug storeId currentPrice originalPrice discountPercent primaryImageUrl')
      .populate('storeId', 'name logoUrl')
      .sort({ clickCount: -1, createdAt: -1 })
      .lean<LeanProduct[]>();

    // Stable partition: exact-title matches first, then partial matches, each
    // preserving the popularity/recency order from the query (Req 11.6).
    const exact: LeanProduct[] = [];
    const partial: LeanProduct[] = [];
    for (const doc of productDocs) {
      (exactTitle.test(doc.title) ? exact : partial).push(doc);
    }
    const ranked = [...exact, ...partial];

    productCount = ranked.length;
    products = ranked.slice(offset, offset + limit).map(toProductSummary);
  }

  // ----- Deals --------------------------------------------------------------
  let deals: DealSummary[] = [];
  let dealCount = 0;
  if (searchDeals) {
    const dealFilter = {
      status: ACTIVE,
      $or: [
        { headline: contains },
        { couponCode: contains },
        { storeId: { $in: storeIds } },
        { categoryId: { $in: categoryIds } },
      ],
    };

    const dealDocs = await Deal.find(dealFilter)
      .select('headline slug storeId dealType couponCode discountValue validUntil')
      .populate('storeId', 'name logoUrl')
      .sort({ clickCount: -1, createdAt: -1 })
      .lean<LeanDeal[]>();

    dealCount = dealDocs.length;
    deals = dealDocs.slice(offset, offset + limit).map(toDealSummary);
  }

  await logSearch(q, productCount + dealCount);

  return { products, productCount, deals, dealCount };
}

/**
 * Return the most popular active products for the search zero-results state
 * (Req 11.12 — "between 4 and 8 popular Products").
 *
 * Ranked by descending click count with a newest-first tiebreak, mirroring the
 * homepage popularity ordering. Like {@link search}, the returned summaries
 * exclude the affiliate URL (Req 7.9). `limit` is clamped to `[0, MAX_RESULTS]`.
 */
export async function getPopularProducts(limit = 8): Promise<ProductSummary[]> {
  const cap = Math.min(MAX_RESULTS, Math.max(0, Math.trunc(limit)));
  if (cap === 0) {
    return [];
  }

  await connectToDatabase();

  const ACTIVE: EntityStatus = 'active';
  const docs = await Product.find({ status: ACTIVE })
    .select('title slug storeId currentPrice originalPrice discountPercent primaryImageUrl')
    .populate('storeId', 'name logoUrl')
    .sort({ clickCount: -1, createdAt: -1 })
    .limit(cap)
    .lean<LeanProduct[]>();

  return docs.map(toProductSummary);
}
