/**
 * Pure filtering helpers for the `/deals` listing.
 *
 * Database-free on purpose: the deals page applies these to the DTOs returned by
 * the cached catalog loaders, and the unit tests exercise them directly. Types
 * come from `lib/models/types` rather than the model barrel so nothing here
 * drags Mongoose into a bundle.
 */
import type { DealType } from '@/lib/models/types';

/** A deal projected far enough to be filtered — matches `DealCardDTO`. */
export interface FilterableDeal {
  dealType: DealType;
  discountValue: string | null;
  validUntil: Date | null;
}

/** Minimum-discount buckets offered in the sidebar. */
export const DISCOUNT_BUCKETS = [10, 25, 50, 70] as const;
export type DiscountBucket = (typeof DISCOUNT_BUCKETS)[number];

/** Human labels for the deal types the catalog actually stores. */
export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  coupon_code: 'Coupon Code',
  direct_deal: 'Deal',
  bank_card: 'Bank Card Offer',
  cashback: 'Cashback',
};

export interface DealFilters {
  /** Selected deal types; empty means "any". */
  types: DealType[];
  /** Minimum discount percentage, or null for "any". */
  minDiscount: DiscountBucket | null;
  /** Only deals expiring within `EXPIRING_SOON_DAYS`. */
  expiringSoon: boolean;
}

export const EMPTY_FILTERS: DealFilters = {
  types: [],
  minDiscount: null,
  expiringSoon: false,
};

/** Window used by the "Expiring soon" toggle. */
export const EXPIRING_SOON_DAYS = 3;

/**
 * Pull a percentage out of a free-text discount label — "Flat 45% OFF" → 45.
 * Returns null when the value carries no percentage (e.g. "₹500 OFF"), so those
 * deals are simply excluded from percentage-based filtering rather than guessed
 * at.
 */
export function parseDiscountPercent(value: string | null): number | null {
  if (!value) return null;
  const match = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(value);
  if (!match) return null;
  const percent = Number.parseFloat(match[1]);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
  return percent;
}

/** True when the deal expires within `days` of `now` (and has not already lapsed). */
export function isExpiringSoon(
  validUntil: Date | null,
  now: Date,
  days: number = EXPIRING_SOON_DAYS,
): boolean {
  if (!validUntil) return false;
  const remainingMs = validUntil.getTime() - now.getTime();
  if (remainingMs < 0) return false;
  return remainingMs <= days * 24 * 60 * 60 * 1000;
}

/** Whether a deal satisfies every active filter. Unset filters never exclude. */
export function matchesDealFilters(
  deal: FilterableDeal,
  filters: DealFilters,
  now: Date,
): boolean {
  if (filters.types.length > 0 && !filters.types.includes(deal.dealType)) {
    return false;
  }

  if (filters.minDiscount !== null) {
    const percent = parseDiscountPercent(deal.discountValue);
    if (percent === null || percent < filters.minDiscount) return false;
  }

  if (filters.expiringSoon && !isExpiringSoon(deal.validUntil, now)) {
    return false;
  }

  return true;
}

/** Apply the filters to a list, preserving the incoming order. */
export function filterDeals<T extends FilterableDeal>(
  deals: readonly T[],
  filters: DealFilters,
  now: Date,
): T[] {
  return deals.filter((deal) => matchesDealFilters(deal, filters, now));
}

/** How many deals fall in each deal type, for the sidebar counts. */
export function countByType(
  deals: readonly FilterableDeal[],
): Record<DealType, number> {
  const counts: Record<DealType, number> = {
    coupon_code: 0,
    direct_deal: 0,
    bank_card: 0,
    cashback: 0,
  };
  for (const deal of deals) counts[deal.dealType] += 1;
  return counts;
}

/** How many deals meet or beat each discount bucket. */
export function countByDiscountBucket(
  deals: readonly FilterableDeal[],
): Record<DiscountBucket, number> {
  const counts = { 10: 0, 25: 0, 50: 0, 70: 0 } as Record<DiscountBucket, number>;
  for (const deal of deals) {
    const percent = parseDiscountPercent(deal.discountValue);
    if (percent === null) continue;
    for (const bucket of DISCOUNT_BUCKETS) {
      if (percent >= bucket) counts[bucket] += 1;
    }
  }
  return counts;
}

/** How many deals are expiring within the soon-window. */
export function countExpiringSoon(
  deals: readonly FilterableDeal[],
  now: Date,
): number {
  return deals.reduce(
    (total, deal) => total + (isExpiringSoon(deal.validUntil, now) ? 1 : 0),
    0,
  );
}

/**
 * Read the filter state out of a URL query. Unknown or malformed values are
 * ignored so a hand-edited URL can never throw.
 */
export function parseDealFilters(params: {
  type?: string | string[];
  discount?: string | string[];
  expiring?: string | string[];
}): DealFilters {
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const rawTypes = first(params.type);
  const types = (rawTypes ? rawTypes.split(',') : []).filter(
    (value): value is DealType => value in DEAL_TYPE_LABELS,
  );

  const rawDiscount = Number.parseInt(first(params.discount) ?? '', 10);
  const minDiscount = (DISCOUNT_BUCKETS as readonly number[]).includes(rawDiscount)
    ? (rawDiscount as DiscountBucket)
    : null;

  return {
    types,
    minDiscount,
    expiringSoon: first(params.expiring) === '1',
  };
}

/**
 * Build the query string for a filter state, dropping empty values so the
 * default view stays at a clean `/deals`.
 */
export function buildDealQuery(
  filters: DealFilters,
  categorySlug?: string | null,
): string {
  const query = new URLSearchParams();
  if (categorySlug) query.set('category', categorySlug);
  if (filters.types.length > 0) query.set('type', filters.types.join(','));
  if (filters.minDiscount !== null) {
    query.set('discount', String(filters.minDiscount));
  }
  if (filters.expiringSoon) query.set('expiring', '1');
  const search = query.toString();
  return search ? `?${search}` : '';
}

/** Toggle one deal type in a filter state, returning a new state. */
export function toggleType(filters: DealFilters, type: DealType): DealFilters {
  const types = filters.types.includes(type)
    ? filters.types.filter((value) => value !== type)
    : [...filters.types, type];
  return { ...filters, types };
}
