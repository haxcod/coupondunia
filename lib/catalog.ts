/**
 * Catalog service — cached public read helpers and pure listing comparators.
 *
 * This module is the read side of the catalog (Task 7.1). It has two clearly
 * separated halves:
 *
 *   1. **Pure listing comparators + sort/cap helpers** (no database, no Next.js
 *      runtime). These encode the ordering rules from the requirements
 *      (category ordering, the five product sort modes, deals-by-newest,
 *      top-N-by-clicks) and the per-section item caps. They are exported on
 *      their own so they can be exercised exhaustively by property tests
 *      (Property 18 / Task 7.2) without touching MongoDB.
 *
 *   2. **Cached `use cache` data loaders** that read the active catalog from
 *      MongoDB, project it into affiliate-URL-free DTOs, and tag/limit the
 *      result so the static shell can be prerendered and revalidated on demand
 *      (Req 25.8/25.9). Per the design caching windows:
 *        - homepage / category / deal reads → 300s revalidate
 *        - product reads                     → 600s revalidate
 *
 * **Affiliate-URL confidentiality (Req 7.9 / Property 11).** The public DTOs
 * returned here never carry `Product.affiliateUrl` or `Deal.destinationUrl`.
 * The loaders read those columns only to derive a boolean (`hasAffiliateUrl` /
 * `hasDestinationUrl`) used by the cards to disable a CTA (Req 2.9); the URL
 * string itself is dropped before the value leaves this module, so it can never
 * appear in server-rendered HTML or the RSC payload. The URL is revealed only
 * by `POST /api/public/click`.
 *
 * > Mutations, case-sensitive slug resolution, and `revalidateTag` wiring are
 * > added to this module by Task 7.3. Keep that "MUTATIONS" section below the
 * > read helpers.
 */
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import type { SortOrder, Types } from 'mongoose';

import { connectToDatabase, mongoose } from '@/lib/db';
import {
  CACHE_TAGS,
  categoryTag,
  dealTag,
  productTag,
  bannerRevalidationTags,
  categoryRevalidationTags,
  dealRevalidationTags,
  productRevalidationTags,
} from '@/lib/cache-tags';
import { Banner, Category, Deal, Product, Store } from '@/lib/models';
import type {
  DealType,
  EntityStatus,
  IBanner,
  IStore,
  LinkTarget,
} from '@/lib/models';
import {
  ensureUniqueSlug,
  generateSlug,
  storeScopedSlug,
  type SlugExistsPredicate,
} from '@/lib/slug';
import { computeDiscountPercent } from '@/lib/pricing';
import type {
  BannerInput,
  CategoryInput,
  DealInput,
  ProductInput,
} from '@/lib/validation';

// =============================================================================
// SECTION 1 — Public DTO types (affiliate/destination URLs excluded, Req 7.9)
// =============================================================================

/** A store, projected for the "Popular Stores" strip and card store labels. */
export interface StoreDTO {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/** A category projected for pill rows and the `/categories` grid. */
export interface CategoryCardDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  /** Count of active products in the category (Req 4.4) — a non-negative integer. */
  activeProductCount: number;
  displayOrder: number;
}

/** A category projected for the `/category/[slug]` detail header (Req 5.1). */
export interface CategoryDetailDTO extends CategoryCardDTO {
  parentId: string | null;
  description: string | null;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** A product projected for cards/listings. Never carries the affiliate URL. */
export interface ProductCardDTO {
  id: string;
  title: string;
  slug: string;
  storeName: string;
  storeLogoUrl: string | null;
  /** Current price in integer paise. */
  currentPrice: number;
  /** Original price in integer paise, or null. */
  originalPrice: number | null;
  discountPercent: number | null;
  primaryImageUrl: string;
  /**
   * Whether the product has a non-empty affiliate URL, so a card can render its
   * CTA disabled when false (Req 2.9). The URL itself is intentionally absent.
   */
  hasAffiliateUrl: boolean;
}

/** A product projected for the `/product/[slug]` detail page (Req 6). */
export interface ProductDetailDTO extends ProductCardDTO {
  categoryId: string;
  description: string;
  keyFeatures: string[];
  additionalImages: string[];
  buttonLabel: string;
  offerExpiresAt: Date | null;
  lastVerifiedAt: Date;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: Date;
}

/** A deal projected for coupon cards/listings. Never carries the destination URL. */
export interface DealCardDTO {
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

/** A deal projected for the `/deal/[slug]` detail page (Req 8). */
export interface DealDetailDTO extends DealCardDTO {
  categoryId: string;
  /** Owning store id, used to load same-store related content (Req 8.9). */
  storeId: string;
  /** Owning store slug (empty when unavailable). */
  storeSlug: string;
  terms: string | null;
  howToUseSteps: string[];
  validFrom: Date | null;
  buttonLabel: string | null;
  minOrderValue: number | null;
  maxDiscountCap: number | null;
  applicableFor: string | null;
  /** Whether the deal has a non-empty destination URL (the URL itself is absent). */
  hasDestinationUrl: boolean;
  createdAt: Date;
}

/** One homepage "category-wise" section: a category plus its sampled products (Req 1.10). */
export interface CategorySection {
  category: CategoryCardDTO;
  products: ProductCardDTO[];
}

/** Everything the homepage needs in a single cached read (Req 1). */
export interface HomepageData {
  /** Up to 10 categories for the pill row (Req 1.8). */
  pillRowCategories: CategoryCardDTO[];
  /** Up to 8 featured products; empty when none are featured (Req 1.9/1.15). */
  featuredProducts: ProductCardDTO[];
  /** Category-wise sections, each with 4–6 products (Req 1.10). */
  categorySections: CategorySection[];
  /** 6–8 featured deals; empty unless at least 6 exist (Req 1.11). */
  todaysBestCoupons: DealCardDTO[];
  /** Up to 12 stores for the "Popular Stores" strip (Req 1.12). */
  popularStores: StoreDTO[];
}

// =============================================================================
// SECTION 2 — Section caps and product sort-mode vocabulary
// =============================================================================

/**
 * Per-section item caps from Requirement 1, 10, 11, and 14. Loaders and the
 * `capSection` helper use these so a section never renders more than its cap.
 */
export const SECTION_CAPS = {
  /** Homepage category pill row (Req 1.8). */
  homepageCategoryPills: 10,
  /** Featured products section (Req 1.9). */
  featuredProducts: 8,
  /** Minimum active products for a homepage category-wise section (Req 1.10). */
  categorySectionMin: 4,
  /** Maximum products rendered in a homepage category-wise section (Req 1.10). */
  categorySectionMax: 6,
  /** Minimum featured deals required to show "Today's Best Coupons" (Req 1.11). */
  todaysBestCouponsMin: 6,
  /** Maximum deals in "Today's Best Coupons" (Req 1.11). */
  todaysBestCouponsMax: 8,
  /** Popular stores strip (Req 1.12). */
  popularStores: 12,
  /** Same-store related Deals/Products on the deal detail page (Req 8.9). */
  relatedStoreItems: 4,
  /** Dashboard top-products / top-deals charts (Req 14.4). */
  topProducts: 10,
  topDeals: 10,
  /** "Load More" page size for deals/products/search listings (Req 10.2, 5.11, 11.8). */
  listingPageSize: 20,
} as const;

// =============================================================================
// SECTION 3 — Pure listing comparators + sort/cap helpers (re-exported)
// =============================================================================
//
// The sort-mode vocabulary, comparators, and sort/cap helpers now live in the
// database-free `lib/product-sort` module so Client Components (the category
// `SortControl` / product browser) can import them without pulling Mongoose
// into the client bundle. They are imported here for the loaders' own use and
// re-exported so existing server-side consumers and tests can keep importing
// them from `@/lib/catalog` unchanged.

import {
  PRODUCT_SORT_MODES,
  DEFAULT_PRODUCT_SORT_MODE,
  PRODUCT_SORT_LABELS,
  compareCategoriesByProductCountThenDisplayOrder,
  compareCategoriesByProductCountThenName,
  compareProductsBy,
  compareByNewest,
  compareByClicksThenRecency,
  sortBy,
  capSection,
  sortAndCap,
  topByClicks,
} from '@/lib/product-sort';
import type {
  ProductSortMode,
  Comparator,
  CategoryOrderItem,
  ProductSortItem,
  CreatedAtItem,
  ClickRankItem,
} from '@/lib/product-sort';

export {
  PRODUCT_SORT_MODES,
  DEFAULT_PRODUCT_SORT_MODE,
  PRODUCT_SORT_LABELS,
  compareCategoriesByProductCountThenDisplayOrder,
  compareCategoriesByProductCountThenName,
  compareProductsBy,
  compareByNewest,
  compareByClicksThenRecency,
  sortBy,
  capSection,
  sortAndCap,
  topByClicks,
};
export type {
  ProductSortMode,
  Comparator,
  CategoryOrderItem,
  ProductSortItem,
  CreatedAtItem,
  ClickRankItem,
};

// =============================================================================
// SECTION 5 — Lean document shapes + projections (DB → public DTOs)
// =============================================================================

/** A populated store reference, projected to the fields the DTOs need. */
interface PopulatedStoreRef {
  /** Always present on a populated ref (Mongoose includes `_id` by default). */
  _id?: Types.ObjectId;
  name: string;
  /** Only present when the detail projection selects `slug`. */
  slug?: string;
  logoUrl: string | null;
}

interface LeanCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  iconUrl: string | null;
  displayOrder: number;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
}

interface LeanCategoryDetail extends LeanCategory {
  parentId: Types.ObjectId | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface LeanProductCard {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  storeId: PopulatedStoreRef | null;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  primaryImageUrl: string;
  /** Read to derive `hasAffiliateUrl`; never copied into the DTO (Req 7.9). */
  affiliateUrl: string;
}

interface LeanProductDetail extends LeanProductCard {
  categoryId: Types.ObjectId;
  description: string;
  keyFeatures: string[];
  additionalImages: string[];
  buttonLabel: string;
  offerExpiresAt: Date | null;
  lastVerifiedAt: Date;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: Date;
}

interface LeanDealCard {
  _id: Types.ObjectId;
  headline: string;
  slug: string;
  storeId: PopulatedStoreRef | null;
  dealType: DealType;
  couponCode: string | null;
  discountValue: string | null;
  validUntil: Date | null;
}

interface LeanDealDetail extends LeanDealCard {
  categoryId: Types.ObjectId;
  terms: string | null;
  howToUseSteps: string[];
  validFrom: Date | null;
  buttonLabel: string | null;
  minOrderValue: number | null;
  maxDiscountCap: number | null;
  applicableFor: string | null;
  /** Read to derive `hasDestinationUrl`; never copied into the DTO (Req 7.9). */
  destinationUrl: string;
  createdAt: Date;
}

interface LeanStore {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/** Field projections. Affiliate/destination URLs are selected only to derive a boolean. */
const PRODUCT_CARD_FIELDS =
  'title slug storeId currentPrice originalPrice discountPercent primaryImageUrl affiliateUrl';
const PRODUCT_DETAIL_FIELDS = `${PRODUCT_CARD_FIELDS} categoryId description keyFeatures additionalImages buttonLabel offerExpiresAt lastVerifiedAt metaTitle metaDescription createdAt`;
const DEAL_CARD_FIELDS =
  'headline slug storeId dealType couponCode discountValue validUntil';
const DEAL_DETAIL_FIELDS = `${DEAL_CARD_FIELDS} categoryId terms howToUseSteps validFrom buttonLabel minOrderValue maxDiscountCap applicableFor destinationUrl createdAt`;

function isNonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function toStoreDTO(doc: LeanStore): StoreDTO {
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    logoUrl: doc.logoUrl ?? null,
  };
}

function toCategoryCard(doc: LeanCategory, activeProductCount: number): CategoryCardDTO {
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    iconUrl: doc.iconUrl ?? null,
    activeProductCount,
    displayOrder: doc.displayOrder,
  };
}

function toCategoryDetail(
  doc: LeanCategoryDetail,
  activeProductCount: number,
): CategoryDetailDTO {
  return {
    ...toCategoryCard(doc, activeProductCount),
    parentId: doc.parentId ? String(doc.parentId) : null,
    description: doc.description ?? null,
    showOnHomepage: doc.showOnHomepage,
    homepageSectionTitle: doc.homepageSectionTitle ?? null,
    metaTitle: doc.metaTitle ?? null,
    metaDescription: doc.metaDescription ?? null,
  };
}

function toProductCard(doc: LeanProductCard): ProductCardDTO {
  return {
    id: String(doc._id),
    title: doc.title,
    slug: doc.slug,
    storeName: doc.storeId?.name ?? '',
    storeLogoUrl: doc.storeId?.logoUrl ?? null,
    currentPrice: doc.currentPrice,
    originalPrice: doc.originalPrice ?? null,
    discountPercent: doc.discountPercent ?? null,
    primaryImageUrl: doc.primaryImageUrl,
    hasAffiliateUrl: isNonEmpty(doc.affiliateUrl),
  };
}

function toProductDetail(doc: LeanProductDetail): ProductDetailDTO {
  return {
    ...toProductCard(doc),
    categoryId: String(doc.categoryId),
    description: doc.description,
    keyFeatures: doc.keyFeatures ?? [],
    additionalImages: doc.additionalImages ?? [],
    buttonLabel: doc.buttonLabel,
    offerExpiresAt: doc.offerExpiresAt ?? null,
    lastVerifiedAt: doc.lastVerifiedAt,
    metaTitle: doc.metaTitle ?? null,
    metaDescription: doc.metaDescription ?? null,
    createdAt: doc.createdAt,
  };
}

function toDealCard(doc: LeanDealCard): DealCardDTO {
  return {
    id: String(doc._id),
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

function toDealDetail(doc: LeanDealDetail): DealDetailDTO {
  return {
    ...toDealCard(doc),
    categoryId: String(doc.categoryId),
    storeId: doc.storeId?._id ? String(doc.storeId._id) : '',
    storeSlug: doc.storeId?.slug ?? '',
    terms: doc.terms ?? null,
    howToUseSteps: doc.howToUseSteps ?? [],
    validFrom: doc.validFrom ?? null,
    buttonLabel: doc.buttonLabel ?? null,
    minOrderValue: doc.minOrderValue ?? null,
    maxDiscountCap: doc.maxDiscountCap ?? null,
    applicableFor: doc.applicableFor ?? null,
    hasDestinationUrl: isNonEmpty(doc.destinationUrl),
    createdAt: doc.createdAt,
  };
}

// =============================================================================
// SECTION 6 — MUTATIONS, case-sensitive slug resolution, on-demand revalidation
// =============================================================================
//
// The write side of the catalog (Task 7.3). Every create/update/delete:
//   1. derives a unique, canonical slug (Req 23.1–23.4) — store-scoped for
//      products/deals (Req 24.12);
//   2. auto-creates the backing `Store` by **case-insensitive** name match,
//      reusing an existing store when one already exists (Req 16.8);
//   3. computes the integer discount percent for products (Req 16.6);
//   4. enforces the category-delete dependency guard (Req 15.10); and
//   5. after the write commits, invalidates the affected cache tags via
//      `revalidateTag(...)` so public pages refresh on demand (Req 25.8).
//
// Slug resolution (`resolveActive*`) is **case-sensitive** and matches only
// `active` records, returning a single entry or `null` for not-found
// (Req 23.5/23.6, 5.2, 6.2, 8.2).

/** Admin-facing banner projection returned by banner mutations. */
export interface BannerDTO {
  id: string;
  internalName: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  headline: string | null;
  ctaText: string | null;
  linkUrl: string;
  linkTarget: LinkTarget;
  displayOrder: number;
  status: EntityStatus;
}

/** Projection for resolving a single active category to its detail DTO. */
const CATEGORY_DETAIL_FIELDS =
  'name slug iconUrl displayOrder showOnHomepage homepageSectionTitle parentId description metaTitle metaDescription';

// -----------------------------------------------------------------------------
// 6.0 — small shared helpers
// -----------------------------------------------------------------------------

/** Escape a string for safe interpolation into a MongoDB `$regex` literal. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert a rupee amount (≤2 decimals) into the integer paise the DB stores. */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert an optional rupee amount to integer paise, preserving null/absence. */
function toPaiseOrNull(rupees: number | null | undefined): number | null {
  return rupees === null || rupees === undefined ? null : toPaise(rupees);
}

/** Coerce a hex id string into an ObjectId for ref fields. */
function toObjectId(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

/**
 * Invalidate a set of cache tags after a mutation commits (Req 25.8). Duplicate
 * tags are collapsed. `revalidateTag` is only valid inside a request/render
 * scope; when these mutations run outside one (seed scripts, unit tests) the
 * call throws and is intentionally ignored — the time-based ISR window still
 * refreshes those callers.
 */
function revalidateTags(tags: readonly string[]): void {
  for (const tag of new Set(tags)) {
    try {
      // Next.js 16 requires a cache-life profile; `'max'` purges with
      // stale-while-revalidate semantics (recommended for on-demand purges).
      revalidateTag(tag, 'max');
    } catch {
      // Not inside a request/render scope — safe to ignore (see doc above).
    }
  }
}

/** Slug-collision predicate for the products collection, optionally excluding a doc. */
function productSlugExists(excludeId?: string): SlugExistsPredicate {
  return async (slug) => {
    const filter: Record<string, unknown> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    return (await Product.exists(filter).exec()) !== null;
  };
}

/** Slug-collision predicate for the deals collection, optionally excluding a doc. */
function dealSlugExists(excludeId?: string): SlugExistsPredicate {
  return async (slug) => {
    const filter: Record<string, unknown> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    return (await Deal.exists(filter).exec()) !== null;
  };
}

/** Slug-collision predicate for the categories collection, optionally excluding a doc. */
function categorySlugExists(excludeId?: string): SlugExistsPredicate {
  return async (slug) => {
    const filter: Record<string, unknown> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    return (await Category.exists(filter).exec()) !== null;
  };
}

/** Slug-collision predicate for the stores collection. */
function storeSlugExists(): SlugExistsPredicate {
  return async (slug) => (await Store.exists({ slug }).exec()) !== null;
}

/**
 * Find a store by **case-insensitive** exact name, creating it (with a unique
 * slug) when none exists (Req 16.8). Names are compared after trimming.
 */
async function resolveOrCreateStore(name: string): Promise<IStore> {
  const trimmed = name.trim();
  const existing = await Store.findOne({
    name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: 'i' },
  }).exec();
  if (existing) {
    return existing;
  }
  const slug = await ensureUniqueSlug(trimmed, storeSlugExists());
  return Store.create({ name: trimmed, slug, logoUrl: null });
}

// -----------------------------------------------------------------------------
// 6.1 — re-load helpers (return populated/counted detail DTOs after a write)
// -----------------------------------------------------------------------------

async function loadProductDetail(id: Types.ObjectId): Promise<ProductDetailDTO> {
  const doc = await Product.findById(id)
    .select(PRODUCT_DETAIL_FIELDS)
    .populate('storeId', 'name logoUrl')
    .lean()
    .exec();
  if (!doc) {
    throw new Error(`Product ${String(id)} could not be re-loaded after mutation.`);
  }
  return toProductDetail(doc as unknown as LeanProductDetail);
}

async function loadDealDetail(id: Types.ObjectId): Promise<DealDetailDTO> {
  const doc = await Deal.findById(id)
    .select(DEAL_DETAIL_FIELDS)
    .populate('storeId', 'name slug logoUrl')
    .lean()
    .exec();
  if (!doc) {
    throw new Error(`Deal ${String(id)} could not be re-loaded after mutation.`);
  }
  return toDealDetail(doc as unknown as LeanDealDetail);
}

async function categoryDetailFromDoc(
  doc: LeanCategoryDetail,
): Promise<CategoryDetailDTO> {
  const activeProductCount = await Product.countDocuments({
    categoryId: doc._id,
    status: 'active',
  }).exec();
  return toCategoryDetail(doc, activeProductCount);
}

async function loadCategoryDetail(id: Types.ObjectId): Promise<CategoryDetailDTO> {
  const doc = await Category.findById(id)
    .select(CATEGORY_DETAIL_FIELDS)
    .lean()
    .exec();
  if (!doc) {
    throw new Error(`Category ${String(id)} could not be re-loaded after mutation.`);
  }
  return categoryDetailFromDoc(doc as unknown as LeanCategoryDetail);
}

function toBannerDTO(doc: IBanner): BannerDTO {
  return {
    id: String(doc._id),
    internalName: doc.internalName,
    imageUrl: doc.imageUrl,
    mobileImageUrl: doc.mobileImageUrl ?? null,
    headline: doc.headline ?? null,
    ctaText: doc.ctaText ?? null,
    linkUrl: doc.linkUrl,
    linkTarget: doc.linkTarget,
    displayOrder: doc.displayOrder,
    status: doc.status,
  };
}

// -----------------------------------------------------------------------------
// 6.2 — Case-sensitive, active-only slug resolution (Req 23.5/23.6, 5.2/6.2/8.2)
// -----------------------------------------------------------------------------

/**
 * Resolve an **active** product by its exact (case-sensitive) slug, or `null`
 * when no active product matches (Req 6.2, 23.5/23.6). MongoDB's default binary
 * collation makes the slug match case-sensitive.
 */
export async function resolveActiveProduct(
  slug: string,
): Promise<ProductDetailDTO | null> {
  await connectToDatabase();
  const doc = await Product.findOne({ slug, status: 'active' })
    .select(PRODUCT_DETAIL_FIELDS)
    .populate('storeId', 'name logoUrl')
    .lean()
    .exec();
  return doc ? toProductDetail(doc as unknown as LeanProductDetail) : null;
}

/**
 * Resolve an **active** deal by its exact (case-sensitive) slug, or `null` when
 * no active deal matches (Req 8.2, 23.5/23.6).
 */
export async function resolveActiveDeal(
  slug: string,
): Promise<DealDetailDTO | null> {
  await connectToDatabase();
  const doc = await Deal.findOne({ slug, status: 'active' })
    .select(DEAL_DETAIL_FIELDS)
    .populate('storeId', 'name slug logoUrl')
    .lean()
    .exec();
  return doc ? toDealDetail(doc as unknown as LeanDealDetail) : null;
}

/**
 * Resolve an **active** category by its exact (case-sensitive) slug, or `null`
 * when no active category matches (Req 5.2, 23.5/23.6).
 */
export async function resolveActiveCategory(
  slug: string,
): Promise<CategoryDetailDTO | null> {
  await connectToDatabase();
  const doc = await Category.findOne({ slug, status: 'active' })
    .select(CATEGORY_DETAIL_FIELDS)
    .lean()
    .exec();
  return doc
    ? categoryDetailFromDoc(doc as unknown as LeanCategoryDetail)
    : null;
}

// -----------------------------------------------------------------------------
// 6.3 — Category mutations
// -----------------------------------------------------------------------------

export async function createCategory(
  input: CategoryInput,
): Promise<CategoryDetailDTO> {
  await connectToDatabase();
  const slug = await ensureUniqueSlug(
    input.slug ?? generateSlug(input.name),
    categorySlugExists(),
  );
  const created = await Category.create({
    name: input.name,
    slug,
    parentId: input.parentId ? toObjectId(input.parentId) : null,
    iconUrl: input.iconUrl ?? null,
    description: input.description ?? null,
    showOnHomepage: input.showOnHomepage,
    homepageSectionTitle: input.homepageSectionTitle ?? null,
    displayOrder: input.displayOrder,
    status: input.status,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
  });
  revalidateTags(categoryRevalidationTags(slug));
  return loadCategoryDetail(created._id);
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<CategoryDetailDTO> {
  await connectToDatabase();
  const existing = await Category.findById(id).exec();
  if (!existing) {
    throw new Error(`Category ${id} not found.`);
  }
  const previousSlug = existing.slug;
  const slug = await ensureUniqueSlug(
    input.slug ?? generateSlug(input.name),
    categorySlugExists(id),
  );
  existing.set({
    name: input.name,
    slug,
    parentId: input.parentId ? toObjectId(input.parentId) : null,
    iconUrl: input.iconUrl ?? null,
    description: input.description ?? null,
    showOnHomepage: input.showOnHomepage,
    homepageSectionTitle: input.homepageSectionTitle ?? null,
    displayOrder: input.displayOrder,
    status: input.status,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
  });
  await existing.save();
  revalidateTags([...categoryRevalidationTags(slug), categoryTag(previousSlug)]);
  return loadCategoryDetail(existing._id);
}

/**
 * Delete a category, first enforcing the dependency guard (Req 15.10): the
 * delete is rejected with `CategoryHasDependentsError` while child categories or
 * products still reference it. A no-op when the id does not exist.
 */
export async function deleteCategory(id: string): Promise<void> {
  await connectToDatabase();
  const existing = await Category.findById(id).exec();
  if (!existing) {
    return;
  }
  await Category.assertDeletable(existing._id);
  const slug = existing.slug;
  await existing.deleteOne();
  revalidateTags(categoryRevalidationTags(slug));
}

// -----------------------------------------------------------------------------
// 6.4 — Product mutations
// -----------------------------------------------------------------------------

export async function createProduct(
  input: ProductInput,
): Promise<ProductDetailDTO> {
  await connectToDatabase();
  const store = await resolveOrCreateStore(input.store);
  const slug = await ensureUniqueSlug(
    input.slug ?? storeScopedSlug(store.name, input.title),
    productSlugExists(),
  );
  const created = await Product.create({
    title: input.title,
    slug,
    storeId: store._id,
    categoryId: toObjectId(input.categoryId),
    currentPrice: toPaise(input.currentPrice),
    originalPrice: toPaiseOrNull(input.originalPrice),
    discountPercent: computeDiscountPercent(
      input.currentPrice,
      input.originalPrice ?? null,
    ),
    primaryImageUrl: input.primaryImageUrl,
    additionalImages: input.additionalImages,
    description: input.description,
    keyFeatures: input.keyFeatures,
    affiliateUrl: input.affiliateUrl,
    buttonLabel: input.buttonLabel,
    offerExpiresAt: input.offerExpiresAt ?? null,
    featured: input.featured,
    status: input.status,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
  });
  revalidateTags(productRevalidationTags(slug));
  return loadProductDetail(created._id);
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<ProductDetailDTO> {
  await connectToDatabase();
  const existing = await Product.findById(id).exec();
  if (!existing) {
    throw new Error(`Product ${id} not found.`);
  }
  const previousSlug = existing.slug;
  const store = await resolveOrCreateStore(input.store);
  const slug = await ensureUniqueSlug(
    input.slug ?? storeScopedSlug(store.name, input.title),
    productSlugExists(id),
  );
  existing.set({
    title: input.title,
    slug,
    storeId: store._id,
    categoryId: toObjectId(input.categoryId),
    currentPrice: toPaise(input.currentPrice),
    originalPrice: toPaiseOrNull(input.originalPrice),
    discountPercent: computeDiscountPercent(
      input.currentPrice,
      input.originalPrice ?? null,
    ),
    primaryImageUrl: input.primaryImageUrl,
    additionalImages: input.additionalImages,
    description: input.description,
    keyFeatures: input.keyFeatures,
    affiliateUrl: input.affiliateUrl,
    buttonLabel: input.buttonLabel,
    offerExpiresAt: input.offerExpiresAt ?? null,
    featured: input.featured,
    status: input.status,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
  });
  await existing.save();
  revalidateTags([...productRevalidationTags(slug), productTag(previousSlug)]);
  return loadProductDetail(existing._id);
}

export async function deleteProduct(id: string): Promise<void> {
  await connectToDatabase();
  const existing = await Product.findById(id).exec();
  if (!existing) {
    return;
  }
  const slug = existing.slug;
  await existing.deleteOne();
  revalidateTags(productRevalidationTags(slug));
}

// -----------------------------------------------------------------------------
// 6.5 — Deal mutations
// -----------------------------------------------------------------------------

export async function createDeal(input: DealInput): Promise<DealDetailDTO> {
  await connectToDatabase();
  const store = await resolveOrCreateStore(input.store);
  const slug = await ensureUniqueSlug(
    input.slug ?? storeScopedSlug(store.name, input.headline),
    dealSlugExists(),
  );
  const created = await Deal.create({
    headline: input.headline,
    slug,
    storeId: store._id,
    categoryId: toObjectId(input.categoryId),
    dealType: input.dealType,
    couponCode: input.couponCode ?? null,
    destinationUrl: input.destinationUrl,
    discountValue: input.discountValue ?? null,
    buttonLabel: input.buttonLabel ?? null,
    terms: input.terms ?? null,
    howToUseSteps: input.howToUseSteps,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    minOrderValue: toPaiseOrNull(input.minOrderValue),
    maxDiscountCap: toPaiseOrNull(input.maxDiscountCap),
    applicableFor: input.applicableFor ?? null,
    featured: input.featured,
    status: input.status,
  });
  revalidateTags(dealRevalidationTags(slug));
  return loadDealDetail(created._id);
}

export async function updateDeal(
  id: string,
  input: DealInput,
): Promise<DealDetailDTO> {
  await connectToDatabase();
  const existing = await Deal.findById(id).exec();
  if (!existing) {
    throw new Error(`Deal ${id} not found.`);
  }
  const previousSlug = existing.slug;
  const store = await resolveOrCreateStore(input.store);
  const slug = await ensureUniqueSlug(
    input.slug ?? storeScopedSlug(store.name, input.headline),
    dealSlugExists(id),
  );
  existing.set({
    headline: input.headline,
    slug,
    storeId: store._id,
    categoryId: toObjectId(input.categoryId),
    dealType: input.dealType,
    couponCode: input.couponCode ?? null,
    destinationUrl: input.destinationUrl,
    discountValue: input.discountValue ?? null,
    buttonLabel: input.buttonLabel ?? null,
    terms: input.terms ?? null,
    howToUseSteps: input.howToUseSteps,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    minOrderValue: toPaiseOrNull(input.minOrderValue),
    maxDiscountCap: toPaiseOrNull(input.maxDiscountCap),
    applicableFor: input.applicableFor ?? null,
    featured: input.featured,
    status: input.status,
  });
  await existing.save();
  revalidateTags([...dealRevalidationTags(slug), dealTag(previousSlug)]);
  return loadDealDetail(existing._id);
}

export async function deleteDeal(id: string): Promise<void> {
  await connectToDatabase();
  const existing = await Deal.findById(id).exec();
  if (!existing) {
    return;
  }
  const slug = existing.slug;
  await existing.deleteOne();
  revalidateTags(dealRevalidationTags(slug));
}

// -----------------------------------------------------------------------------
// 6.6 — Banner mutations (no slug; revalidate banners + homepage carousel)
// -----------------------------------------------------------------------------

export async function createBanner(input: BannerInput): Promise<BannerDTO> {
  await connectToDatabase();
  const created = await Banner.create({
    internalName: input.internalName,
    imageUrl: input.imageUrl,
    mobileImageUrl: input.mobileImageUrl ?? null,
    headline: input.headline ?? null,
    ctaText: input.ctaText ?? null,
    linkUrl: input.linkUrl,
    linkTarget: input.linkTarget,
    displayOrder: input.displayOrder,
    status: input.status,
  });
  revalidateTags(bannerRevalidationTags());
  return toBannerDTO(created);
}

export async function updateBanner(
  id: string,
  input: BannerInput,
): Promise<BannerDTO> {
  await connectToDatabase();
  const existing = await Banner.findById(id).exec();
  if (!existing) {
    throw new Error(`Banner ${id} not found.`);
  }
  existing.set({
    internalName: input.internalName,
    imageUrl: input.imageUrl,
    mobileImageUrl: input.mobileImageUrl ?? null,
    headline: input.headline ?? null,
    ctaText: input.ctaText ?? null,
    linkUrl: input.linkUrl,
    linkTarget: input.linkTarget,
    displayOrder: input.displayOrder,
    status: input.status,
  });
  await existing.save();
  revalidateTags(bannerRevalidationTags());
  return toBannerDTO(existing);
}

export async function deleteBanner(id: string): Promise<void> {
  await connectToDatabase();
  const existing = await Banner.findById(id).exec();
  if (!existing) {
    return;
  }
  await existing.deleteOne();
  revalidateTags(bannerRevalidationTags());
}

// =============================================================================
// SECTION 7 — Cached public read loaders (`use cache` + cacheLife + cacheTag)
// =============================================================================
//
// Thin cached read helpers consumed by the public pages. They read the active
// catalog from MongoDB, project it into affiliate-URL-free DTOs, order it with
// the pure comparators above, and tag the result so admin mutations can
// invalidate it on demand (Req 25.8/25.9). Category reads use the 300s ISR
// window from the design caching table.

/**
 * Load every **active** category together with its count of active products,
 * ordered for the `/categories` listing page (Req 4.2/4.3/4.4):
 *   - only `status: 'active'` categories are returned (Req 4.2);
 *   - ordering is descending active-product count, then ascending name (Req 4.3);
 *   - each card carries the category name, slug, icon URL (or null), and a
 *     non-negative `activeProductCount` (Req 4.4).
 *
 * The result is cached on a 300s revalidation window and tagged with the
 * `categories` collection tag so a category/product mutation refreshes it.
 */
export async function getActiveCategoriesWithCounts(): Promise<CategoryCardDTO[]> {
  'use cache';
  // Category listings refresh on a 300s ISR window (design caching table, Req 25.8).
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag(CACHE_TAGS.categories);

  await connectToDatabase();

  const [categories, counts] = await Promise.all([
    Category.find({ status: 'active' })
      .select('name slug iconUrl displayOrder showOnHomepage homepageSectionTitle')
      .lean()
      .exec(),
    Product.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const countByCategory = new Map<string, number>();
  for (const row of counts) {
    if (row._id != null) {
      countByCategory.set(String(row._id), row.count);
    }
  }

  const cards = (categories as unknown as LeanCategory[]).map((doc) =>
    toCategoryCard(doc, countByCategory.get(String(doc._id)) ?? 0),
  );

  return sortBy(cards, compareCategoriesByProductCountThenName);
}

/**
 * Load every **active** deal projected as an affiliate-URL-free coupon-card DTO,
 * ordered for the `/deals` listing page by descending creation date (Req 10.1).
 *
 * The full ordered list is returned in one cached read; the page slices it into
 * 20-item "Load More" pages client-side via `lib/paging`. Ordering uses the pure
 * {@link compareByNewest} comparator over each deal's `createdAt`, so the result
 * is the same total order the comparator/paging property tests exercise.
 *
 * The result is cached on a 300s revalidation window (design caching table,
 * Req 25.8) and tagged with the `deals` collection tag so any deal mutation
 * refreshes it on demand. The destination URL is never selected or projected
 * here (Req 7.9).
 */
export async function getActiveDealCards(): Promise<DealCardDTO[]> {
  'use cache';
  // Deal listings refresh on a 300s ISR window (design caching table, Req 25.8).
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag(CACHE_TAGS.deals);

  await connectToDatabase();

  const docs = await Deal.find({ status: 'active' })
    .select(`${DEAL_CARD_FIELDS} createdAt`)
    .populate('storeId', 'name logoUrl')
    .lean()
    .exec();

  // Sort newest-first with the shared comparator, then drop `createdAt` by
  // projecting each lean doc into the public coupon-card DTO.
  const cards = docs as unknown as (LeanDealCard & { createdAt: Date })[];
  return sortBy(cards, compareByNewest).map(toDealCard);
}

/** A category projected as a tag (name + slug) on a detail header (Req 8.1). */
export interface CategoryTagDTO {
  name: string;
  slug: string;
}

/**
 * Auxiliary content for the `/deal/[slug]` page (Req 8.1/8.9): the deal's active
 * Category rendered as a tag, up to 4 OTHER active Deals from the same Store
 * (newest first), and up to 4 active Products from the same Store (newest
 * first). All DTOs are affiliate-URL-free (Req 7.9).
 */
export interface DealPageExtras {
  categoryTags: CategoryTagDTO[];
  relatedDeals: DealCardDTO[];
  relatedProducts: ProductCardDTO[];
}

/**
 * Cached loader for the deal-detail page's auxiliary content. Tagged with the
 * deals/products/categories collection tags so a mutation to any of them
 * refreshes it, and refreshed on the 300s deal-page ISR window (Req 25.8). The
 * current deal is excluded from the related-deals list (Req 8.9).
 */
export async function getDealPageExtras(args: {
  dealId: string;
  storeId: string;
  categoryId: string;
}): Promise<DealPageExtras> {
  'use cache';
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag(CACHE_TAGS.deals, CACHE_TAGS.products, CACHE_TAGS.categories);

  await connectToDatabase();

  // An unparseable store id (e.g. an empty string) means we cannot key the
  // same-store queries; return no related content rather than throwing.
  if (args.storeId.trim().length === 0) {
    return { categoryTags: [], relatedDeals: [], relatedProducts: [] };
  }

  const storeObjectId = toObjectId(args.storeId);

  const [categoryDoc, dealDocs, productDocs] = await Promise.all([
    args.categoryId.trim().length > 0
      ? Category.findOne({ _id: toObjectId(args.categoryId), status: 'active' })
          .select('name slug')
          .lean()
          .exec()
      : Promise.resolve(null),
    Deal.find({
      storeId: storeObjectId,
      status: 'active',
      _id: { $ne: toObjectId(args.dealId) },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(SECTION_CAPS.relatedStoreItems)
      .select(DEAL_CARD_FIELDS)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
    Product.find({ storeId: storeObjectId, status: 'active' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(SECTION_CAPS.relatedStoreItems)
      .select(PRODUCT_CARD_FIELDS)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
  ]);

  const category = categoryDoc as unknown as CategoryTagDTO | null;

  return {
    categoryTags: category ? [{ name: category.name, slug: category.slug }] : [],
    relatedDeals: (dealDocs as unknown as LeanDealCard[]).map(toDealCard),
    relatedProducts: (productDocs as unknown as LeanProductCard[]).map(toProductCard),
  };
}

/**
 * Every active deal slug, for `/deal/[slug]`'s `generateStaticParams` (Req 8.1).
 * A direct (uncached) read; callers wrap it in try/catch so a build without a
 * database degrades to an empty prerender set (see `app/sitemap.ts`).
 */
export async function getActiveDealSlugs(): Promise<string[]> {
  await connectToDatabase();
  const docs = await Deal.find({ status: 'active' }).select('slug').lean().exec();
  return (docs as unknown as { slug: string }[]).map((doc) => doc.slug);
}

// -----------------------------------------------------------------------------
// Category detail listing (Req 5) — products + subcategories + stores + coupons
// -----------------------------------------------------------------------------

/** A selectable id/name pair for subcategory pills and store checkboxes (Req 5.3/5.6). */
export interface CategoryFilterOption {
  id: string;
  name: string;
}

/**
 * A product projected for the `/category/[slug]` listing. It carries the extra
 * fields the in-browser filter/sort controls need beyond a plain card:
 *   - `categoryId` / `storeId` for subcategory + store filtering (Req 5.6);
 *   - `viewCount` for "Most Popular" and `createdAt` for "Newest" (Req 5.5).
 * The affiliate URL is still never present (Req 7.9).
 */
export interface CategoryListingProductDTO extends ProductCardDTO {
  categoryId: string;
  storeId: string;
  viewCount: number;
  createdAt: Date;
}

/** Everything the category detail page renders below its header (Req 5.1–5.14). */
export interface CategoryListingData {
  /** Active subcategories of the category, for the subcategory pills (Req 5.3). */
  subcategories: CategoryFilterOption[];
  /** Distinct stores among the listing products, for the store filter (Req 5.6). */
  stores: CategoryFilterOption[];
  /**
   * Every active product in the category and its active subcategories, in no
   * particular order — the page sorts/filters/pages it in-browser (Req 5.5/5.11).
   */
  products: CategoryListingProductDTO[];
  /** Active deals tagged to the category/subcategories, newest-first (Req 5.13). */
  coupons: DealCardDTO[];
}

/** A populated store ref that also carries its id (for the store filter). */
interface PopulatedStoreRefWithId extends PopulatedStoreRef {
  _id: Types.ObjectId;
}

interface LeanCategoryProduct extends Omit<LeanProductCard, 'storeId'> {
  storeId: PopulatedStoreRefWithId | null;
  categoryId: Types.ObjectId;
  viewCount: number;
  createdAt: Date;
}

function toCategoryListingProduct(
  doc: LeanCategoryProduct,
): CategoryListingProductDTO {
  return {
    ...toProductCard(doc as unknown as LeanProductCard),
    categoryId: String(doc.categoryId),
    storeId: doc.storeId?._id ? String(doc.storeId._id) : '',
    viewCount: doc.viewCount,
    createdAt: doc.createdAt,
  };
}

/**
 * Resilient, uncached read of every active category slug, used by the
 * `/category/[slug]` `generateStaticParams`. It is intentionally *not* a
 * `use cache` loader: `generateStaticParams` runs during `next build` where no
 * database is available, so the caller wraps this in try/catch and prerenders
 * on demand when it throws (see `app/sitemap.ts` for the same pattern).
 */
export async function getActiveCategorySlugs(): Promise<string[]> {
  await connectToDatabase();
  const docs = await Category.find({ status: 'active' })
    .select('slug')
    .lean()
    .exec();
  return (docs as unknown as { slug: string }[]).map((doc) => doc.slug);
}

/**
 * Load the full category-detail dataset for the resolved category `categoryId`
 * (Req 5.1–5.14): its active subcategories, the distinct stores among its
 * products, every active product in the category and its active subcategories
 * (affiliate-URL-free), and the active deals tagged to the category for the
 * "Coupons for [Category]" section.
 *
 * The product list is returned unsorted; the page applies the selected sort
 * (`compareProductsBy`), the active filters (`matchesFilters`), and 20-per-page
 * "Load More" paging in the browser, so this single cached read backs every
 * filter/sort/page permutation without another round-trip.
 *
 * Cached on the 300s category ISR window (design caching table, Req 25.8) and
 * tagged with the `categories`, `products`, and `deals` collection tags so any
 * relevant admin mutation refreshes it on demand.
 */
export async function getCategoryListing(
  categoryId: string,
): Promise<CategoryListingData> {
  'use cache';
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.products, CACHE_TAGS.deals);

  await connectToDatabase();
  const rootId = toObjectId(categoryId);

  // Active subcategories, ordered for the pill row (Req 5.3).
  const subcategoryDocs = await Category.find({
    parentId: rootId,
    status: 'active',
  })
    .select('name slug displayOrder')
    .sort({ displayOrder: 1, name: 1 })
    .lean()
    .exec();

  const subcategoryRows = subcategoryDocs as unknown as {
    _id: Types.ObjectId;
    name: string;
  }[];
  const categoryIds = [rootId, ...subcategoryRows.map((doc) => doc._id)];

  const [productDocs, dealDocs] = await Promise.all([
    Product.find({ categoryId: { $in: categoryIds }, status: 'active' })
      .select(`${PRODUCT_CARD_FIELDS} categoryId viewCount createdAt`)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
    Deal.find({ categoryId: { $in: categoryIds }, status: 'active' })
      .select(`${DEAL_CARD_FIELDS} createdAt`)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
  ]);

  const productRows = productDocs as unknown as LeanCategoryProduct[];
  const products = productRows.map(toCategoryListingProduct);

  // Distinct stores among the listing products, ordered by name (Req 5.6).
  const storeNameById = new Map<string, string>();
  for (const doc of productRows) {
    if (doc.storeId?._id) {
      storeNameById.set(String(doc.storeId._id), doc.storeId.name);
    }
  }
  const stores: CategoryFilterOption[] = [...storeNameById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => compareNameAsc(a.name, b.name));

  const subcategories: CategoryFilterOption[] = subcategoryRows.map((doc) => ({
    id: String(doc._id),
    name: doc.name,
  }));

  // "Coupons for [Category]": active deals tagged to the category, newest first
  // (Req 5.13). The destination URL is never projected (Req 7.9).
  const coupons = sortBy(
    dealDocs as unknown as (LeanDealCard & { createdAt: Date })[],
    compareByNewest,
  ).map(toDealCard);

  return { subcategories, stores, products, coupons };
}

// =============================================================================
// SECTION 7 — Cached public read loaders (homepage + shared navigation)
// =============================================================================
//
// The homepage (Task 11.1) and the shared Header/Footer shell are prerendered
// into the static shell and refreshed via ISR (Req 25.8). Every loader here is
// wrapped in a `use cache` boundary with the `homepage` cache-life profile
// (300s revalidate, defined in `next.config.ts`) and tagged so admin mutations
// invalidate them on demand. Reads use the affiliate-URL-free DTO projections
// from Section 5, so destination/affiliate URLs never reach the rendered output
// (Req 7.9).

/** A banner projected for the homepage hero carousel (Req 1.3, 18.7). */
export interface ActiveBannerDTO {
  id: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  headline: string | null;
  ctaText: string | null;
  linkUrl: string;
  linkTarget: LinkTarget;
}

/** A minimal active category link for the Header/Footer navigation. */
export interface NavCategory {
  name: string;
  slug: string;
}

interface LeanBanner {
  _id: Types.ObjectId;
  imageUrl: string;
  mobileImageUrl: string | null;
  headline: string | null;
  ctaText: string | null;
  linkUrl: string;
  linkTarget: LinkTarget;
}

const BANNER_CARD_FIELDS =
  'imageUrl mobileImageUrl headline ctaText linkUrl linkTarget displayOrder';
const CATEGORY_CARD_FIELDS =
  'name slug iconUrl displayOrder showOnHomepage homepageSectionTitle';

/**
 * Cache-life window for homepage / shared-navigation reads (Req 25.8): a 300s
 * background revalidate, with `expire` kept well above 5 minutes so the entry
 * stays prerenderable rather than becoming a dynamic hole.
 */
const HOMEPAGE_CACHE_LIFE = {
  stale: 300,
  revalidate: 300,
  expire: 86_400,
} as const;

/** Locale-independent ascending string comparison by code point. */
function compareNameAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function toActiveBanner(doc: LeanBanner): ActiveBannerDTO {
  return {
    id: String(doc._id),
    imageUrl: doc.imageUrl,
    mobileImageUrl: doc.mobileImageUrl ?? null,
    headline: doc.headline ?? null,
    ctaText: doc.ctaText ?? null,
    linkUrl: doc.linkUrl ?? '',
    linkTarget: doc.linkTarget,
  };
}

/**
 * Active product counts grouped by category id (Req 1.8/1.10, 4.3). Returns a
 * map of `categoryId → count` for active products only.
 */
async function activeProductCountByCategory(): Promise<Map<string, number>> {
  const rows = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { status: 'active' } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]).exec();
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row._id), row.count);
  }
  return map;
}

// -----------------------------------------------------------------------------
// 7.1 — Active hero banners (Req 1.3, 1.6, 18.7)
// -----------------------------------------------------------------------------

/** Uncached read: active banners ordered by ascending display order, max 10. */
async function loadActiveBanners(): Promise<ActiveBannerDTO[]> {
  await connectToDatabase();
  const docs = await Banner.find({ status: 'active' })
    .sort({ displayOrder: 1, _id: 1 })
    .limit(10)
    .select(BANNER_CARD_FIELDS)
    .lean()
    .exec();
  return (docs as unknown as LeanBanner[]).map(toActiveBanner);
}

/**
 * Cached active-banner loader for the homepage hero carousel. Tagged with both
 * the `banners` and `homepage` collection tags so a banner mutation refreshes
 * the carousel (Req 25.8). Returns an empty array when no active banners exist,
 * so the homepage hides the carousel (Req 1.6).
 */
export async function getActiveBanners(): Promise<ActiveBannerDTO[]> {
  'use cache';
  cacheTag(CACHE_TAGS.banners, CACHE_TAGS.homepage);
  cacheLife(HOMEPAGE_CACHE_LIFE);
  return loadActiveBanners();
}

// -----------------------------------------------------------------------------
// 7.2 — Active navigation categories (Header/Footer)
// -----------------------------------------------------------------------------

/** Uncached read: active categories ordered for navigation (Req 1.8/4.3). */
async function loadNavCategories(): Promise<NavCategory[]> {
  await connectToDatabase();
  const [docs, countMap] = await Promise.all([
    Category.find({ status: 'active' })
      .select('name slug displayOrder')
      .lean()
      .exec(),
    activeProductCountByCategory(),
  ]);
  return (docs as unknown as LeanCategory[])
    .map((doc) => ({
      name: doc.name,
      slug: doc.slug,
      displayOrder: doc.displayOrder,
      activeProductCount: countMap.get(String(doc._id)) ?? 0,
    }))
    .sort(compareCategoriesByProductCountThenDisplayOrder)
    .map((c) => ({ name: c.name, slug: c.slug }));
}

/**
 * Cached active-category list for the shared Header/Footer navigation. Tagged
 * with `categories` + `homepage` so a category mutation refreshes the nav.
 */
export async function getNavCategories(): Promise<NavCategory[]> {
  'use cache';
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.homepage);
  cacheLife(HOMEPAGE_CACHE_LIFE);
  return loadNavCategories();
}

// -----------------------------------------------------------------------------
// 7.3 — Homepage data (Req 1.8–1.12, 1.15)
// -----------------------------------------------------------------------------

/** Uncached read assembling everything the homepage renders in one pass. */
async function loadHomepageData(): Promise<HomepageData> {
  await connectToDatabase();

  const [
    categoryDocs,
    countMap,
    featuredDocs,
    featuredDealDocs,
    popularStoreRows,
  ] = await Promise.all([
    Category.find({ status: 'active' })
      .select(CATEGORY_CARD_FIELDS)
      .lean()
      .exec(),
    activeProductCountByCategory(),
    Product.find({ status: 'active', featured: true })
      .sort({ createdAt: -1 })
      .limit(SECTION_CAPS.featuredProducts)
      .select(PRODUCT_CARD_FIELDS)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
    Deal.find({ status: 'active', featured: true })
      .sort({ createdAt: -1 })
      .limit(SECTION_CAPS.todaysBestCouponsMax)
      .select(DEAL_CARD_FIELDS)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
    Product.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$storeId', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: SECTION_CAPS.popularStores },
    ]).exec(),
  ]);

  const categories = categoryDocs as unknown as LeanCategory[];
  const countFor = (doc: LeanCategory): number =>
    countMap.get(String(doc._id)) ?? 0;

  // Category pill row: desc product count, asc display order, asc name; cap 10
  // (Req 1.8).
  const pillRowCategories = sortAndCap(
    categories.map((doc) => toCategoryCard(doc, countFor(doc))),
    compareCategoriesByProductCountThenDisplayOrder,
    SECTION_CAPS.homepageCategoryPills,
  );

  // Category-wise sections: categories flagged "show on homepage" with >= 4
  // active products, ordered by ascending display order (Req 1.10).
  const sectionCategories = categories
    .filter(
      (doc) =>
        doc.showOnHomepage && countFor(doc) >= SECTION_CAPS.categorySectionMin,
    )
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || compareNameAsc(a.name, b.name),
    );

  const categorySections: CategorySection[] = await Promise.all(
    sectionCategories.map(async (doc) => {
      const products = await Product.find({
        categoryId: doc._id,
        status: 'active',
      })
        .sort({ viewCount: -1, createdAt: -1 })
        .limit(SECTION_CAPS.categorySectionMax)
        .select(PRODUCT_CARD_FIELDS)
        .populate('storeId', 'name logoUrl')
        .lean()
        .exec();
      return {
        category: toCategoryCard(doc, countFor(doc)),
        products: (products as unknown as LeanProductCard[]).map(toProductCard),
      };
    }),
  );

  // Featured products: up to 8; empty when none are featured (Req 1.9/1.15).
  const featuredProducts = (featuredDocs as unknown as LeanProductCard[]).map(
    toProductCard,
  );

  // "Today's Best Coupons": only shown when at least 6 active featured deals
  // exist; render between 6 and 8 (Req 1.11).
  const todaysBestCoupons =
    featuredDealDocs.length >= SECTION_CAPS.todaysBestCouponsMin
      ? (featuredDealDocs as unknown as LeanDealCard[]).map(toDealCard)
      : [];

  // Popular stores: up to 12 stores ranked by active-product count (Req 1.12).
  const storeIds = popularStoreRows.map((row) => row._id);
  const storeDocs = await Store.find({ _id: { $in: storeIds } })
    .select('name slug logoUrl')
    .lean()
    .exec();
  const storeById = new Map(
    (storeDocs as unknown as LeanStore[]).map((doc) => [String(doc._id), doc]),
  );
  const popularStores: StoreDTO[] = storeIds
    .map((id) => storeById.get(String(id)))
    .filter((doc): doc is LeanStore => doc !== undefined)
    .map(toStoreDTO);

  return {
    pillRowCategories,
    featuredProducts,
    categorySections,
    todaysBestCoupons,
    popularStores,
  };
}

/**
 * Cached homepage data loader (Req 1, 25.8). Tagged `homepage`; admin mutations
 * to products/deals/categories/banners all revalidate the `homepage` tag (see
 * `cache-tags.ts`), so this single tag keeps the homepage fresh on demand while
 * the 300s window refreshes it in the background.
 */
export async function getHomepageData(): Promise<HomepageData> {
  'use cache';
  cacheTag(CACHE_TAGS.homepage);
  cacheLife(HOMEPAGE_CACHE_LIFE);
  return loadHomepageData();
}

// -----------------------------------------------------------------------------
// 7.4 — Product detail page data (Req 6, ISR 600s)
// -----------------------------------------------------------------------------

/** A category reference used to build the product breadcrumb (Req 6.1). */
export interface CategoryRef {
  name: string;
  slug: string;
}

/**
 * Everything the `/product/[slug]` page renders in a single cached read (Req 6):
 * the resolved active product, its category (for the breadcrumb), the store's
 * other active deals, and similar active products in the same category.
 *
 * `null` is returned when no **active** product matches the (case-sensitive)
 * slug, so the page can issue a `notFound()` (Req 6.2). Affiliate/destination
 * URLs are never projected here (Req 7.9).
 */
export interface ProductDetailView {
  product: ProductDetailDTO;
  /** The product's active category, for the breadcrumb (Req 6.1); null if absent. */
  category: CategoryRef | null;
  /** Up to 3 most recently created active deals for the product's store (Req 6.9). */
  storeDeals: DealCardDTO[];
  /** Up to 6 similar active products in the same category (Req 6.10), excluding self. */
  similarProducts: ProductCardDTO[];
}

/**
 * Cached data loader for the product detail page (Req 6). Resolves the active
 * product by exact, case-sensitive slug (Req 6.2/23.5) and assembles the
 * store's other deals (Req 6.9) and similar products (Req 6.10) in the same
 * cached pass.
 *
 * Cached on a **600s** revalidation window (design caching table, Req 25.8) and
 * tagged with the per-slug `product:{slug}` tag plus the `products` collection
 * tag so a product mutation refreshes it on demand.
 */
export async function getProductDetailView(
  slug: string,
): Promise<ProductDetailView | null> {
  'use cache';
  // Product pages refresh on a 600s ISR window (design caching table, Req 25.8).
  cacheLife({ stale: 600, revalidate: 600, expire: 86_400 });
  cacheTag(productTag(slug), CACHE_TAGS.products);

  await connectToDatabase();

  const productDoc = await Product.findOne({ slug, status: 'active' })
    .select(PRODUCT_DETAIL_FIELDS)
    .populate('storeId', 'name logoUrl')
    .lean()
    .exec();

  if (!productDoc) {
    return null;
  }

  // The populated `storeId` carries `_id` at runtime; expose it for the
  // store-scoped deal lookup below.
  const lean = productDoc as unknown as LeanProductDetail & {
    storeId: (PopulatedStoreRef & { _id: Types.ObjectId }) | null;
  };

  const product = toProductDetail(lean);
  const storeObjectId = lean.storeId?._id ?? null;
  const categoryObjectId = lean.categoryId;

  const [categoryDoc, storeDealDocs, similarDocs] = await Promise.all([
    Category.findOne({ _id: categoryObjectId, status: 'active' })
      .select('name slug')
      .lean()
      .exec(),
    // Req 6.9: the 3 most recently created active deals for the product's store.
    storeObjectId
      ? Deal.find({ storeId: storeObjectId, status: 'active' })
          .sort({ createdAt: -1 })
          .limit(3)
          .select(DEAL_CARD_FIELDS)
          .populate('storeId', 'name logoUrl')
          .lean()
          .exec()
      : Promise.resolve([]),
    // Req 6.10: up to 6 similar active products in the same category (excluding
    // this product). The page renders all that are returned.
    Product.find({
      categoryId: categoryObjectId,
      status: 'active',
      _id: { $ne: lean._id },
    })
      .sort({ viewCount: -1, createdAt: -1 })
      .limit(SECTION_CAPS.categorySectionMax)
      .select(PRODUCT_CARD_FIELDS)
      .populate('storeId', 'name logoUrl')
      .lean()
      .exec(),
  ]);

  const category = categoryDoc
    ? {
        name: (categoryDoc as unknown as LeanCategory).name,
        slug: (categoryDoc as unknown as LeanCategory).slug,
      }
    : null;

  const storeDeals = (storeDealDocs as unknown as LeanDealCard[]).map(toDealCard);
  const similarProducts = (similarDocs as unknown as LeanProductCard[]).map(
    toProductCard,
  );

  return { product, category, storeDeals, similarProducts };
}

/**
 * All active product slugs, for `generateStaticParams` on `/product/[slug]`.
 *
 * This is intentionally **uncached** and reads the database directly; the
 * product detail page wraps it in a build-time `try/catch` so a missing
 * database during `next build` (no `MONGODB_URI`) yields an empty param set and
 * the pages are generated on demand instead (Req 25.8).
 */
export async function getActiveProductSlugs(): Promise<string[]> {
  await connectToDatabase();
  const docs = await Product.find({ status: 'active' })
    .select('slug')
    .lean()
    .exec();
  return (docs as unknown as { slug: string }[]).map((doc) => doc.slug);
}

// =============================================================================
// SECTION 8 — Admin list loaders + bulk mutations (Task 15.1)
// =============================================================================
//
// The admin catalog tables (Req 15.1, 16.1, 17.1, 18.1) need reads that, unlike
// the public loaders above, INCLUDE inactive records and expose admin-only
// columns (status, featured flag, click count, last-updated date). These reads
// are intentionally **uncached**: the admin panel must always see the freshest
// catalog state immediately after a mutation, so they read MongoDB directly on
// each request rather than going through a `use cache` boundary.
//
// Bulk mutations (Req 16.9/16.15, 17.10/17.11) apply an activate/deactivate to
// many records in one write and then revalidate every affected entity's cache
// tags so the public surface reflects the change on demand (Req 25.8).

// -----------------------------------------------------------------------------
// 8.0 — Shared admin-list query vocabulary
// -----------------------------------------------------------------------------

/** Sort modes for the admin products table (Req 16.2). */
export const ADMIN_PRODUCT_SORTS = [
  'newest',
  'oldest',
  'clicks',
  'price',
] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];

/** Sort modes for the admin deals table (Req 17.1). */
export const ADMIN_DEAL_SORTS = ['newest', 'oldest', 'clicks'] as const;
export type AdminDealSort = (typeof ADMIN_DEAL_SORTS)[number];

/** Default and bounds for admin list pagination (Req 16.1 — 25 products/page). */
export const ADMIN_PRODUCTS_PAGE_SIZE = 25;
export const ADMIN_DEALS_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE_SIZE = 100;

/** A page of admin rows together with its pagination envelope. */
export interface AdminPage<Row> {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildPage<Row>(
  rows: Row[],
  total: number,
  page: number,
  pageSize: number,
): AdminPage<Row> {
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  };
}

// -----------------------------------------------------------------------------
// 8.1 — Admin categories list (Req 15.1)
// -----------------------------------------------------------------------------

/** A row in the admin categories table (Req 15.1). */
export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  /** Resolved parent category name, or null for a top-level category. */
  parentName: string | null;
  activeProductCount: number;
  showOnHomepage: boolean;
  displayOrder: number;
  status: EntityStatus;
}

interface LeanAdminCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: Types.ObjectId | null;
  showOnHomepage: boolean;
  displayOrder: number;
  status: EntityStatus;
}

/**
 * List every category (active AND inactive) for the admin categories table,
 * ordered by ascending display order then name. Each row carries its resolved
 * parent name and its active-product count (Req 15.1).
 */
export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  await connectToDatabase();

  const [docs, counts] = await Promise.all([
    Category.find({})
      .select('name slug iconUrl parentId showOnHomepage displayOrder status')
      .sort({ displayOrder: 1, name: 1 })
      .lean()
      .exec(),
    Product.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const rows = docs as unknown as LeanAdminCategory[];

  const countByCategory = new Map<string, number>();
  for (const row of counts) {
    if (row._id != null) countByCategory.set(String(row._id), row.count);
  }
  const nameById = new Map<string, string>();
  for (const row of rows) nameById.set(String(row._id), row.name);

  return rows.map((doc) => ({
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    iconUrl: doc.iconUrl ?? null,
    parentId: doc.parentId ? String(doc.parentId) : null,
    parentName: doc.parentId ? nameById.get(String(doc.parentId)) ?? null : null,
    activeProductCount: countByCategory.get(String(doc._id)) ?? 0,
    showOnHomepage: doc.showOnHomepage,
    displayOrder: doc.displayOrder,
    status: doc.status,
  }));
}

/**
 * The full editable shape of a single category for the admin edit form
 * (Req 15.3, 15.7). Unlike {@link CategoryDetailDTO} (public detail header) this
 * carries every field the create/edit form owns — including `status` — so an
 * edit can round-trip without dropping description/meta/homepage data.
 */
export interface AdminCategoryDetail {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  iconUrl: string | null;
  description: string | null;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  displayOrder: number;
  status: EntityStatus;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface LeanAdminCategoryDetail {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  parentId: Types.ObjectId | null;
  iconUrl: string | null;
  description: string | null;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  displayOrder: number;
  status: EntityStatus;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Projection for the admin edit form: every administrator-editable field. */
const ADMIN_CATEGORY_FIELDS =
  'name slug parentId iconUrl description showOnHomepage homepageSectionTitle displayOrder status metaTitle metaDescription';

/**
 * Load a single category by id with all administrator-editable fields for the
 * edit form (Req 15.3, 15.7), or `null` when no category has that id. A
 * malformed id raises a Mongoose `CastError`, which the route handler maps to a
 * 400 response.
 */
export async function getAdminCategoryById(
  id: string,
): Promise<AdminCategoryDetail | null> {
  await connectToDatabase();
  const doc = await Category.findById(id)
    .select(ADMIN_CATEGORY_FIELDS)
    .lean()
    .exec();
  if (!doc) return null;

  const row = doc as unknown as LeanAdminCategoryDetail;
  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    parentId: row.parentId ? String(row.parentId) : null,
    iconUrl: row.iconUrl ?? null,
    description: row.description ?? null,
    showOnHomepage: row.showOnHomepage,
    homepageSectionTitle: row.homepageSectionTitle ?? null,
    displayOrder: row.displayOrder,
    status: row.status,
    metaTitle: row.metaTitle ?? null,
    metaDescription: row.metaDescription ?? null,
  };
}

// -----------------------------------------------------------------------------
// 8.2 — Admin products list (Req 16.1, 16.2, 16.3)
// -----------------------------------------------------------------------------

/** A row in the admin products table (Req 16.1). Prices are integer paise. */
export interface AdminProductRow {
  id: string;
  title: string;
  slug: string;
  primaryImageUrl: string;
  categoryId: string;
  categoryName: string;
  storeId: string;
  storeName: string;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  featured: boolean;
  status: EntityStatus;
  clickCount: number;
  updatedAt: Date;
}

/** Query for {@link listAdminProducts}. All fields optional (Req 16.2). */
export interface AdminProductQuery {
  page?: number;
  pageSize?: number;
  /** Substring search over product title or store name (Req 16.2). */
  search?: string;
  categoryId?: string;
  storeId?: string;
  status?: EntityStatus;
  featured?: boolean;
  sort?: AdminProductSort;
}

interface LeanAdminProduct {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  primaryImageUrl: string;
  categoryId: { _id: Types.ObjectId; name: string } | null;
  storeId: { _id: Types.ObjectId; name: string } | null;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  featured: boolean;
  status: EntityStatus;
  clickCount: number;
  updatedAt: Date;
}

const ADMIN_PRODUCT_SORT_SPECS: Record<AdminProductSort, Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  clicks: { clickCount: -1, _id: -1 },
  price: { currentPrice: 1, _id: 1 },
};

/** Structural filter for the admin products query (assignable to Mongoose's filter type). */
interface AdminProductFilter {
  status?: EntityStatus;
  featured?: boolean;
  categoryId?: Types.ObjectId;
  storeId?: Types.ObjectId;
  $or?: Array<{ title?: RegExp; storeId?: { $in: Types.ObjectId[] } }>;
}

/**
 * Paginated, searchable, filterable, sortable admin products list (Req 16.1/16.2).
 * Includes inactive products. Search matches the product title OR the name of
 * the product's store (case-insensitive substring); filters by category, store,
 * status, and featured flag combine with AND semantics.
 */
export async function listAdminProducts(
  query: AdminProductQuery = {},
): Promise<AdminPage<AdminProductRow>> {
  await connectToDatabase();

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query.pageSize ?? ADMIN_PRODUCTS_PAGE_SIZE)),
  );
  const sort = query.sort ?? 'newest';

  const filter: AdminProductFilter = {};
  if (query.status) filter.status = query.status;
  if (query.featured !== undefined) filter.featured = query.featured;
  if (query.categoryId) filter.categoryId = toObjectId(query.categoryId);
  if (query.storeId) filter.storeId = toObjectId(query.storeId);

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegExp(search), 'i');
    const storeIds = (
      await Store.find({ name: rx }).select('_id').lean().exec()
    ).map((s) => (s as unknown as { _id: Types.ObjectId })._id);
    filter.$or = [{ title: rx }, { storeId: { $in: storeIds } }];
  }

  const [total, docs] = await Promise.all([
    Product.countDocuments(filter).exec(),
    Product.find(filter)
      .sort(ADMIN_PRODUCT_SORT_SPECS[sort])
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select(
        'title slug primaryImageUrl categoryId storeId currentPrice originalPrice discountPercent featured status clickCount updatedAt',
      )
      .populate('storeId', 'name')
      .populate('categoryId', 'name')
      .lean()
      .exec(),
  ]);

  const rows = (docs as unknown as LeanAdminProduct[]).map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    slug: doc.slug,
    primaryImageUrl: doc.primaryImageUrl,
    categoryId: doc.categoryId?._id ? String(doc.categoryId._id) : '',
    categoryName: doc.categoryId?.name ?? '',
    storeId: doc.storeId?._id ? String(doc.storeId._id) : '',
    storeName: doc.storeId?.name ?? '',
    currentPrice: doc.currentPrice,
    originalPrice: doc.originalPrice ?? null,
    discountPercent: doc.discountPercent ?? null,
    featured: doc.featured,
    status: doc.status,
    clickCount: doc.clickCount,
    updatedAt: doc.updatedAt,
  }));

  return buildPage(rows, total, page, pageSize);
}

/**
 * Full editable projection of a single product for the admin edit form
 * (Task 15.7, Req 16.4–16.14). Unlike the public {@link ProductDetailDTO}, this
 * intentionally includes the `affiliateUrl` and the raw store NAME so the form
 * can be pre-filled — it is only ever returned by the session-guarded admin API
 * (`GET /api/admin/products/[id]`), never by a public page, so affiliate-URL
 * confidentiality in server-rendered HTML (Req 7.9/24.1) is preserved.
 *
 * Monetary values are integer **paise** (the form converts to/from rupees).
 */
export interface AdminProductDetail {
  id: string;
  title: string;
  /** The product's store NAME (the form re-submits it; auto-created, Req 16.8). */
  store: string;
  categoryId: string;
  currentPrice: number;
  originalPrice: number | null;
  primaryImageUrl: string;
  additionalImages: string[];
  description: string;
  keyFeatures: string[];
  affiliateUrl: string;
  buttonLabel: string;
  featured: boolean;
  status: EntityStatus;
}

interface LeanAdminProductDetail {
  _id: Types.ObjectId;
  title: string;
  storeId: { _id: Types.ObjectId; name: string } | null;
  categoryId: Types.ObjectId | null;
  currentPrice: number;
  originalPrice: number | null;
  primaryImageUrl: string;
  additionalImages: string[] | null;
  description: string;
  keyFeatures: string[] | null;
  affiliateUrl: string;
  buttonLabel: string;
  featured: boolean;
  status: EntityStatus;
}

/**
 * Load a single product for the admin edit form (Task 15.7). Returns `null`
 * when no product has the given id; a malformed id throws a Cast error which the
 * route handler maps to HTTP 400.
 */
export async function getAdminProduct(
  id: string,
): Promise<AdminProductDetail | null> {
  await connectToDatabase();

  const doc = await Product.findById(id)
    .select(
      'title storeId categoryId currentPrice originalPrice primaryImageUrl additionalImages description keyFeatures affiliateUrl buttonLabel featured status',
    )
    .populate('storeId', 'name')
    .lean()
    .exec();

  if (!doc) return null;

  const lean = doc as unknown as LeanAdminProductDetail;
  return {
    id: String(lean._id),
    title: lean.title,
    store: lean.storeId?.name ?? '',
    categoryId: lean.categoryId ? String(lean.categoryId) : '',
    currentPrice: lean.currentPrice,
    originalPrice: lean.originalPrice ?? null,
    primaryImageUrl: lean.primaryImageUrl,
    additionalImages: lean.additionalImages ?? [],
    description: lean.description ?? '',
    keyFeatures: lean.keyFeatures ?? [],
    affiliateUrl: lean.affiliateUrl,
    buttonLabel: lean.buttonLabel,
    featured: lean.featured,
    status: lean.status,
  };
}

// -----------------------------------------------------------------------------
// 8.3 — Admin deals list (Req 17.1)
// -----------------------------------------------------------------------------

/** A row in the admin deals table (Req 17.1). */
export interface AdminDealRow {
  id: string;
  headline: string;
  slug: string;
  storeId: string;
  storeName: string;
  storeLogoUrl: string | null;
  dealType: DealType;
  couponCode: string | null;
  discountValue: string | null;
  categoryId: string;
  categoryName: string;
  validUntil: Date | null;
  featured: boolean;
  status: EntityStatus;
  clickCount: number;
  updatedAt: Date;
}

/** Query for {@link listAdminDeals}. */
export interface AdminDealQuery {
  page?: number;
  pageSize?: number;
  /** Substring search over deal headline, coupon code, or store name. */
  search?: string;
  categoryId?: string;
  storeId?: string;
  status?: EntityStatus;
  featured?: boolean;
  dealType?: DealType;
  sort?: AdminDealSort;
}

interface LeanAdminDeal {
  _id: Types.ObjectId;
  headline: string;
  slug: string;
  storeId: { _id: Types.ObjectId; name: string; logoUrl: string | null } | null;
  categoryId: { _id: Types.ObjectId; name: string } | null;
  dealType: DealType;
  couponCode: string | null;
  discountValue: string | null;
  validUntil: Date | null;
  featured: boolean;
  status: EntityStatus;
  clickCount: number;
  updatedAt: Date;
}

const ADMIN_DEAL_SORT_SPECS: Record<AdminDealSort, Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  clicks: { clickCount: -1, _id: -1 },
};

/** Structural filter for the admin deals query (assignable to Mongoose's filter type). */
interface AdminDealFilter {
  status?: EntityStatus;
  featured?: boolean;
  dealType?: DealType;
  categoryId?: Types.ObjectId;
  storeId?: Types.ObjectId;
  $or?: Array<{
    headline?: RegExp;
    couponCode?: RegExp;
    storeId?: { $in: Types.ObjectId[] };
  }>;
}

/**
 * Paginated, searchable, filterable, sortable admin deals list (Req 17.1).
 * Includes inactive deals. Search matches the deal headline, coupon code, OR
 * the store name (case-insensitive substring).
 */
export async function listAdminDeals(
  query: AdminDealQuery = {},
): Promise<AdminPage<AdminDealRow>> {
  await connectToDatabase();

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query.pageSize ?? ADMIN_DEALS_PAGE_SIZE)),
  );
  const sort = query.sort ?? 'newest';

  const filter: AdminDealFilter = {};
  if (query.status) filter.status = query.status;
  if (query.featured !== undefined) filter.featured = query.featured;
  if (query.dealType) filter.dealType = query.dealType;
  if (query.categoryId) filter.categoryId = toObjectId(query.categoryId);
  if (query.storeId) filter.storeId = toObjectId(query.storeId);

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegExp(search), 'i');
    const storeIds = (
      await Store.find({ name: rx }).select('_id').lean().exec()
    ).map((s) => (s as unknown as { _id: Types.ObjectId })._id);
    filter.$or = [
      { headline: rx },
      { couponCode: rx },
      { storeId: { $in: storeIds } },
    ];
  }

  const [total, docs] = await Promise.all([
    Deal.countDocuments(filter).exec(),
    Deal.find(filter)
      .sort(ADMIN_DEAL_SORT_SPECS[sort])
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select(
        'headline slug storeId categoryId dealType couponCode discountValue validUntil featured status clickCount updatedAt',
      )
      .populate('storeId', 'name logoUrl')
      .populate('categoryId', 'name')
      .lean()
      .exec(),
  ]);

  const rows = (docs as unknown as LeanAdminDeal[]).map((doc) => ({
    id: String(doc._id),
    headline: doc.headline,
    slug: doc.slug,
    storeId: doc.storeId?._id ? String(doc.storeId._id) : '',
    storeName: doc.storeId?.name ?? '',
    storeLogoUrl: doc.storeId?.logoUrl ?? null,
    dealType: doc.dealType,
    couponCode: doc.couponCode ?? null,
    discountValue: doc.discountValue ?? null,
    categoryId: doc.categoryId?._id ? String(doc.categoryId._id) : '',
    categoryName: doc.categoryId?.name ?? '',
    validUntil: doc.validUntil ?? null,
    featured: doc.featured,
    status: doc.status,
    clickCount: doc.clickCount,
    updatedAt: doc.updatedAt,
  }));

  return buildPage(rows, total, page, pageSize);
}

/**
 * Full editable projection of a single deal for the admin edit form
 * (Task 15.8, Req 17.3–17.9). Unlike the public {@link DealDetailDTO}, this
 * intentionally includes the `destinationUrl` and the raw store NAME so the
 * form can be pre-filled — it is only ever returned by the session-guarded
 * admin API (`GET /api/admin/deals/[id]`), never by a public page, so
 * destination-URL confidentiality in server-rendered HTML (Req 7.9/24.1) is
 * preserved.
 *
 * Monetary caps are integer **paise** (the form converts to/from rupees).
 */
export interface AdminDealDetail {
  id: string;
  headline: string;
  /** The deal's store NAME (the form re-submits it; auto-created, Req 16.8/17.x). */
  store: string;
  categoryId: string;
  dealType: DealType;
  couponCode: string | null;
  destinationUrl: string;
  discountValue: string | null;
  buttonLabel: string | null;
  terms: string | null;
  howToUseSteps: string[];
  /** Valid-from/until as ISO strings (or null); the form reads the date part. */
  validFrom: string | null;
  validUntil: string | null;
  minOrderValue: number | null;
  maxDiscountCap: number | null;
  applicableFor: string | null;
  featured: boolean;
  status: EntityStatus;
}

interface LeanAdminDealDetail {
  _id: Types.ObjectId;
  headline: string;
  storeId: { _id: Types.ObjectId; name: string } | null;
  categoryId: Types.ObjectId | null;
  dealType: DealType;
  couponCode: string | null;
  destinationUrl: string;
  discountValue: string | null;
  buttonLabel: string | null;
  terms: string | null;
  howToUseSteps: string[] | null;
  validFrom: Date | null;
  validUntil: Date | null;
  minOrderValue: number | null;
  maxDiscountCap: number | null;
  applicableFor: string | null;
  featured: boolean;
  status: EntityStatus;
}

/**
 * Load a single deal for the admin edit form (Task 15.8). Returns `null` when
 * no deal has the given id; a malformed id throws a Cast error which the route
 * handler maps to HTTP 400.
 */
export async function getAdminDeal(
  id: string,
): Promise<AdminDealDetail | null> {
  await connectToDatabase();

  const doc = await Deal.findById(id)
    .select(
      'headline storeId categoryId dealType couponCode destinationUrl discountValue buttonLabel terms howToUseSteps validFrom validUntil minOrderValue maxDiscountCap applicableFor featured status',
    )
    .populate('storeId', 'name')
    .lean()
    .exec();

  if (!doc) return null;

  const lean = doc as unknown as LeanAdminDealDetail;
  return {
    id: String(lean._id),
    headline: lean.headline,
    store: lean.storeId?.name ?? '',
    categoryId: lean.categoryId ? String(lean.categoryId) : '',
    dealType: lean.dealType,
    couponCode: lean.couponCode ?? null,
    destinationUrl: lean.destinationUrl,
    discountValue: lean.discountValue ?? null,
    buttonLabel: lean.buttonLabel ?? null,
    terms: lean.terms ?? null,
    howToUseSteps: lean.howToUseSteps ?? [],
    validFrom: lean.validFrom ? lean.validFrom.toISOString() : null,
    validUntil: lean.validUntil ? lean.validUntil.toISOString() : null,
    minOrderValue: lean.minOrderValue ?? null,
    maxDiscountCap: lean.maxDiscountCap ?? null,
    applicableFor: lean.applicableFor ?? null,
    featured: lean.featured,
    status: lean.status,
  };
}

// -----------------------------------------------------------------------------
// 8.4 — Admin banners list (Req 18.1)
// -----------------------------------------------------------------------------

/**
 * List every banner (active AND inactive) for the admin banners table, ordered
 * by ascending display order (Req 18.1). Reuses {@link BannerDTO}.
 */
export async function listAdminBanners(): Promise<BannerDTO[]> {
  await connectToDatabase();
  const docs = await Banner.find({})
    .sort({ displayOrder: 1, _id: 1 })
    .exec();
  return docs.map((doc) => toBannerDTO(doc));
}

// -----------------------------------------------------------------------------
// 8.5 — Bulk mutations (Req 16.9/16.15, 17.10/17.11)
// -----------------------------------------------------------------------------

/** Coerce a list of id strings to valid ObjectIds, dropping any malformed ids. */
function toValidObjectIds(ids: readonly string[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const result: Types.ObjectId[] = [];
  for (const id of ids) {
    if (mongoose.Types.ObjectId.isValid(id) && !seen.has(id)) {
      seen.add(id);
      result.push(toObjectId(id));
    }
  }
  return result;
}

/**
 * Set the status (`active`/`inactive`) of many products at once (Req 16.15).
 * Returns the number of products actually modified. Revalidates every affected
 * product's cache tags so the public surface reflects the change (Req 25.8).
 */
export async function bulkSetProductStatus(
  ids: readonly string[],
  status: EntityStatus,
): Promise<{ affected: number }> {
  await connectToDatabase();
  const objectIds = toValidObjectIds(ids);
  if (objectIds.length === 0) return { affected: 0 };

  const affectedDocs = await Product.find({ _id: { $in: objectIds } })
    .select('slug')
    .lean()
    .exec();
  const result = await Product.updateMany(
    { _id: { $in: objectIds } },
    { $set: { status } },
  ).exec();

  const tags = (affectedDocs as unknown as { slug: string }[]).flatMap((d) =>
    productRevalidationTags(d.slug),
  );
  revalidateTags(tags);
  return { affected: result.modifiedCount ?? 0 };
}

/**
 * Delete many products at once (Req 16.15). Returns the number deleted and
 * revalidates the affected cache tags.
 */
export async function bulkDeleteProducts(
  ids: readonly string[],
): Promise<{ affected: number }> {
  await connectToDatabase();
  const objectIds = toValidObjectIds(ids);
  if (objectIds.length === 0) return { affected: 0 };

  const affectedDocs = await Product.find({ _id: { $in: objectIds } })
    .select('slug')
    .lean()
    .exec();
  const result = await Product.deleteMany({ _id: { $in: objectIds } }).exec();

  const tags = (affectedDocs as unknown as { slug: string }[]).flatMap((d) =>
    productRevalidationTags(d.slug),
  );
  revalidateTags(tags);
  return { affected: result.deletedCount ?? 0 };
}

/**
 * Set the status of many deals at once (Req 17.10). Returns the number modified
 * and revalidates the affected cache tags.
 */
export async function bulkSetDealStatus(
  ids: readonly string[],
  status: EntityStatus,
): Promise<{ affected: number }> {
  await connectToDatabase();
  const objectIds = toValidObjectIds(ids);
  if (objectIds.length === 0) return { affected: 0 };

  const affectedDocs = await Deal.find({ _id: { $in: objectIds } })
    .select('slug')
    .lean()
    .exec();
  const result = await Deal.updateMany(
    { _id: { $in: objectIds } },
    { $set: { status } },
  ).exec();

  const tags = (affectedDocs as unknown as { slug: string }[]).flatMap((d) =>
    dealRevalidationTags(d.slug),
  );
  revalidateTags(tags);
  return { affected: result.modifiedCount ?? 0 };
}

/**
 * Delete many deals at once (Req 17.11). Returns the number deleted and
 * revalidates the affected cache tags.
 */
export async function bulkDeleteDeals(
  ids: readonly string[],
): Promise<{ affected: number }> {
  await connectToDatabase();
  const objectIds = toValidObjectIds(ids);
  if (objectIds.length === 0) return { affected: 0 };

  const affectedDocs = await Deal.find({ _id: { $in: objectIds } })
    .select('slug')
    .lean()
    .exec();
  const result = await Deal.deleteMany({ _id: { $in: objectIds } }).exec();

  const tags = (affectedDocs as unknown as { slug: string }[]).flatMap((d) =>
    dealRevalidationTags(d.slug),
  );
  revalidateTags(tags);
  return { affected: result.deletedCount ?? 0 };
}
