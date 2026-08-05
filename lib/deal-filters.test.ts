import { describe, expect, it } from 'vitest';

import {
  DISCOUNT_BUCKETS,
  EMPTY_FILTERS,
  buildDealQuery,
  countByDiscountBucket,
  countByType,
  countExpiringSoon,
  filterDeals,
  isExpiringSoon,
  parseDealFilters,
  parseDiscountPercent,
  toggleType,
  type FilterableDeal,
} from '@/lib/deal-filters';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function deal(overrides: Partial<FilterableDeal> = {}): FilterableDeal {
  return {
    dealType: 'coupon_code',
    discountValue: '20% OFF',
    validUntil: null,
    ...overrides,
  };
}

/** `days` from NOW, as a date. */
function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('parseDiscountPercent', () => {
  it('reads a percentage out of free-text labels', () => {
    expect(parseDiscountPercent('45% OFF')).toBe(45);
    expect(parseDiscountPercent('Flat 45% OFF on Skincare')).toBe(45);
    expect(parseDiscountPercent('Up to 60 % off')).toBe(60);
  });

  it('returns null when there is no usable percentage', () => {
    expect(parseDiscountPercent(null)).toBeNull();
    expect(parseDiscountPercent('₹500 OFF')).toBeNull();
    expect(parseDiscountPercent('Free Shipping')).toBeNull();
    // Out-of-range values are not treated as discounts.
    expect(parseDiscountPercent('120% OFF')).toBeNull();
    expect(parseDiscountPercent('0% OFF')).toBeNull();
  });
});

describe('isExpiringSoon', () => {
  it('matches deals inside the window and ignores undated ones', () => {
    expect(isExpiringSoon(inDays(1), NOW)).toBe(true);
    expect(isExpiringSoon(inDays(10), NOW)).toBe(false);
    expect(isExpiringSoon(null, NOW)).toBe(false);
  });

  it('excludes deals that have already lapsed', () => {
    expect(isExpiringSoon(inDays(-1), NOW)).toBe(false);
  });
});

describe('filterDeals', () => {
  const deals: FilterableDeal[] = [
    deal({ dealType: 'coupon_code', discountValue: '50% OFF', validUntil: inDays(1) }),
    deal({ dealType: 'direct_deal', discountValue: '20% OFF', validUntil: inDays(30) }),
    deal({ dealType: 'cashback', discountValue: '₹500 OFF', validUntil: null }),
  ];

  it('returns everything when no filter is set', () => {
    expect(filterDeals(deals, EMPTY_FILTERS, NOW)).toHaveLength(3);
  });

  it('narrows by deal type', () => {
    const result = filterDeals(deals, { ...EMPTY_FILTERS, types: ['cashback'] }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].dealType).toBe('cashback');
  });

  it('narrows by minimum discount and drops non-percentage deals', () => {
    const result = filterDeals(deals, { ...EMPTY_FILTERS, minDiscount: 50 }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].discountValue).toBe('50% OFF');
  });

  it('narrows by expiring soon', () => {
    const result = filterDeals(deals, { ...EMPTY_FILTERS, expiringSoon: true }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].validUntil).toEqual(inDays(1));
  });

  it('preserves the incoming order', () => {
    const ordered = filterDeals(deals, EMPTY_FILTERS, NOW);
    expect(ordered.map((d) => d.dealType)).toEqual([
      'coupon_code',
      'direct_deal',
      'cashback',
    ]);
  });
});

describe('counts', () => {
  const deals: FilterableDeal[] = [
    deal({ dealType: 'coupon_code', discountValue: '70% OFF', validUntil: inDays(1) }),
    deal({ dealType: 'coupon_code', discountValue: '25% OFF' }),
    deal({ dealType: 'bank_card', discountValue: null }),
  ];

  it('counts each deal type', () => {
    expect(countByType(deals)).toEqual({
      coupon_code: 2,
      direct_deal: 0,
      bank_card: 1,
      cashback: 0,
    });
  });

  it('counts each discount bucket cumulatively', () => {
    const counts = countByDiscountBucket(deals);
    // 70% qualifies for every bucket; 25% only for 10 and 25.
    expect(counts[10]).toBe(2);
    expect(counts[25]).toBe(2);
    expect(counts[50]).toBe(1);
    expect(counts[70]).toBe(1);
  });

  it('counts deals expiring soon', () => {
    expect(countExpiringSoon(deals, NOW)).toBe(1);
  });
});

describe('query round-tripping', () => {
  it('builds an empty query for the default view', () => {
    expect(buildDealQuery(EMPTY_FILTERS)).toBe('');
  });

  it('round-trips a populated filter state', () => {
    const filters = {
      types: ['coupon_code' as const],
      minDiscount: 50 as const,
      expiringSoon: true,
    };
    const query = buildDealQuery(filters);
    const params = Object.fromEntries(new URLSearchParams(query.slice(1)));
    expect(parseDealFilters(params)).toEqual(filters);
  });

  it('includes the category slug when one is active', () => {
    expect(buildDealQuery(EMPTY_FILTERS, 'electronics')).toBe(
      '?category=electronics',
    );
  });

  it('ignores malformed query values', () => {
    expect(
      parseDealFilters({ type: 'nonsense', discount: '999', expiring: 'yes' }),
    ).toEqual(EMPTY_FILTERS);
  });

  it('accepts only the published discount buckets', () => {
    for (const bucket of DISCOUNT_BUCKETS) {
      expect(parseDealFilters({ discount: String(bucket) }).minDiscount).toBe(
        bucket,
      );
    }
    expect(parseDealFilters({ discount: '33' }).minDiscount).toBeNull();
  });
});

describe('toggleType', () => {
  it('adds then removes a type', () => {
    const once = toggleType(EMPTY_FILTERS, 'cashback');
    expect(once.types).toEqual(['cashback']);
    expect(toggleType(once, 'cashback').types).toEqual([]);
  });
});
