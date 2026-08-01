/**
 * Unit tests for the pure analytics aggregation helpers (Task 15.3).
 *
 * These cover the day-bucketing, zero-filled series, reducers, and CSV
 * serialization with concrete examples and edge cases. The universal-property
 * coverage for Property 21 lives in the separate property test (Task 15.4).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TZ_OFFSET_MINUTES,
  aggregateClicksByCategory,
  aggregateClicksByDevice,
  aggregateClicksByType,
  aggregateTopEntities,
  aggregateTopQueries,
  aggregateZeroResultQueries,
  analyticsReportToCsv,
  buildDailySeries,
  dayKey,
  enumerateDayKeys,
  escapeCsvField,
  isWithinRange,
  periodTotal,
  toCsv,
  type AggregationEvent,
  type AnalyticsReport,
  type DateRange,
  type EntityMeta,
} from '@/lib/analytics';

function evt(partial: Partial<AggregationEvent> & { createdAt: Date }): AggregationEvent {
  return {
    clickType: 'product',
    productId: null,
    dealId: null,
    deviceType: 'mobile',
    categoryId: null,
    ...partial,
  };
}

describe('dayKey / day bucketing', () => {
  it('buckets a UTC instant into the IST (UTC+05:30) calendar day', () => {
    // 2024-01-01T20:00:00Z is 2024-01-02T01:30 IST → next day in IST.
    expect(dayKey(new Date('2024-01-01T20:00:00Z'))).toBe('2024-01-02');
    // Same instant in UTC (offset 0) stays on Jan 1.
    expect(dayKey(new Date('2024-01-01T20:00:00Z'), 0)).toBe('2024-01-01');
  });

  it('uses the default IST offset of 330 minutes', () => {
    expect(DEFAULT_TZ_OFFSET_MINUTES).toBe(330);
  });
});

describe('enumerateDayKeys', () => {
  it('lists every inclusive day in the range', () => {
    const range: DateRange = {
      start: new Date('2024-03-10T00:00:00Z'),
      end: new Date('2024-03-12T23:59:59Z'),
    };
    expect(enumerateDayKeys(range, 0)).toEqual([
      '2024-03-10',
      '2024-03-11',
      '2024-03-12',
    ]);
  });

  it('returns a single day when start and end share a calendar day', () => {
    const range: DateRange = {
      start: new Date('2024-03-10T01:00:00Z'),
      end: new Date('2024-03-10T22:00:00Z'),
    };
    expect(enumerateDayKeys(range, 0)).toEqual(['2024-03-10']);
  });
});

describe('isWithinRange', () => {
  const range: DateRange = {
    start: new Date('2024-03-10T00:00:00Z'),
    end: new Date('2024-03-12T00:00:00Z'),
  };
  it('is inclusive on both endpoints', () => {
    expect(isWithinRange(range.start, range)).toBe(true);
    expect(isWithinRange(range.end, range)).toBe(true);
  });
  it('excludes instants outside the range', () => {
    expect(isWithinRange(new Date('2024-03-09T23:59:59Z'), range)).toBe(false);
    expect(isWithinRange(new Date('2024-03-12T00:00:01Z'), range)).toBe(false);
  });
});

describe('buildDailySeries (zero-filled) + periodTotal', () => {
  const range: DateRange = {
    start: new Date('2024-03-10T00:00:00Z'),
    end: new Date('2024-03-12T23:59:59Z'),
  };

  it('zero-fills days with no events and sums to the period total', () => {
    const events = [
      evt({ createdAt: new Date('2024-03-10T06:00:00Z') }),
      evt({ createdAt: new Date('2024-03-10T09:00:00Z') }),
      evt({ createdAt: new Date('2024-03-12T12:00:00Z') }),
    ];
    const series = buildDailySeries(events, range, 0);
    expect(series).toEqual([
      { date: '2024-03-10', clicks: 2 },
      { date: '2024-03-11', clicks: 0 },
      { date: '2024-03-12', clicks: 1 },
    ]);
    const sum = series.reduce((acc, p) => acc + p.clicks, 0);
    expect(sum).toBe(periodTotal(events, range));
    expect(sum).toBe(3);
  });

  it('ignores events outside the inclusive range', () => {
    const events = [
      evt({ createdAt: new Date('2024-03-09T23:59:59Z') }), // before
      evt({ createdAt: new Date('2024-03-11T10:00:00Z') }), // in
      evt({ createdAt: new Date('2024-03-13T00:00:00Z') }), // after
    ];
    const series = buildDailySeries(events, range, 0);
    expect(periodTotal(events, range)).toBe(1);
    expect(series.reduce((a, p) => a + p.clicks, 0)).toBe(1);
  });

  it('produces an all-zero series for an empty event set', () => {
    const series = buildDailySeries([], range, 0);
    expect(series).toHaveLength(3);
    expect(series.every((p) => p.clicks === 0)).toBe(true);
  });
});

describe('aggregateClicksByType', () => {
  it('counts product vs deal clicks', () => {
    const events = [
      evt({ clickType: 'product', createdAt: new Date() }),
      evt({ clickType: 'deal', createdAt: new Date() }),
      evt({ clickType: 'deal', createdAt: new Date() }),
    ];
    expect(aggregateClicksByType(events)).toEqual({ product: 1, deal: 2 });
  });
});

describe('aggregateClicksByDevice', () => {
  it('zero-fills every known device type', () => {
    const events = [
      evt({ deviceType: 'mobile', createdAt: new Date() }),
      evt({ deviceType: 'mobile', createdAt: new Date() }),
      evt({ deviceType: 'desktop', createdAt: new Date() }),
    ];
    expect(aggregateClicksByDevice(events)).toEqual({
      mobile: 2,
      tablet: 0,
      desktop: 1,
      unknown: 0,
    });
  });
});

describe('aggregateClicksByCategory', () => {
  it('ranks categories by descending clicks with a name tiebreak', () => {
    const events = [
      evt({ categoryId: 'a', createdAt: new Date() }),
      evt({ categoryId: 'a', createdAt: new Date() }),
      evt({ categoryId: 'b', createdAt: new Date() }),
      evt({ categoryId: null, createdAt: new Date() }), // ignored
    ];
    const names = new Map([
      ['a', 'Apparel'],
      ['b', 'Books'],
    ]);
    expect(aggregateClicksByCategory(events, names)).toEqual([
      { categoryId: 'a', categoryName: 'Apparel', clicks: 2 },
      { categoryId: 'b', categoryName: 'Books', clicks: 1 },
    ]);
  });
});

describe('aggregateTopEntities', () => {
  const meta = new Map<string, EntityMeta>([
    ['p1', { id: 'p1', label: 'Phone', slug: 'phone', allTimeClicks: 100, createdAt: new Date('2024-01-01') }],
    ['p2', { id: 'p2', label: 'Laptop', slug: 'laptop', allTimeClicks: 50, createdAt: new Date('2024-02-01') }],
  ]);

  it('orders by period clicks desc and enriches with metadata', () => {
    const events = [
      evt({ clickType: 'product', productId: 'p2', createdAt: new Date() }),
      evt({ clickType: 'product', productId: 'p2', createdAt: new Date() }),
      evt({ clickType: 'product', productId: 'p1', createdAt: new Date() }),
    ];
    expect(aggregateTopEntities(events, 'product', meta)).toEqual([
      { id: 'p2', label: 'Laptop', slug: 'laptop', periodClicks: 2, allTimeClicks: 50 },
      { id: 'p1', label: 'Phone', slug: 'phone', periodClicks: 1, allTimeClicks: 100 },
    ]);
  });

  it('breaks period-click ties by most recent creation', () => {
    const events = [
      evt({ clickType: 'product', productId: 'p1', createdAt: new Date() }),
      evt({ clickType: 'product', productId: 'p2', createdAt: new Date() }),
    ];
    // p2 created later → ranks first on the tie.
    const ranked = aggregateTopEntities(events, 'product', meta);
    expect(ranked.map((r) => r.id)).toEqual(['p2', 'p1']);
  });

  it('omits entities without metadata', () => {
    const events = [evt({ clickType: 'product', productId: 'ghost', createdAt: new Date() })];
    expect(aggregateTopEntities(events, 'product', meta)).toEqual([]);
  });

  it('respects the limit', () => {
    const events = [
      evt({ clickType: 'product', productId: 'p1', createdAt: new Date() }),
      evt({ clickType: 'product', productId: 'p2', createdAt: new Date() }),
    ];
    expect(aggregateTopEntities(events, 'product', meta, 1)).toHaveLength(1);
  });
});

describe('aggregateTopQueries', () => {
  it('counts case-insensitively and ranks by frequency', () => {
    const logs = [
      { query: 'Shoes' },
      { query: 'shoes' },
      { query: 'bags' },
      { query: '  ' }, // ignored
    ];
    expect(aggregateTopQueries(logs)).toEqual([
      { query: 'Shoes', count: 2 },
      { query: 'bags', count: 1 },
    ]);
  });
});

describe('aggregateZeroResultQueries', () => {
  it('flags only queries that never matched anything', () => {
    const logs = [
      { query: 'xyzzy', resultCount: 0 },
      { query: 'xyzzy', resultCount: 0 },
      { query: 'shoes', resultCount: 0 },
      { query: 'shoes', resultCount: 5 }, // matched once → not zero-result
    ];
    expect(aggregateZeroResultQueries(logs)).toEqual([
      { query: 'xyzzy', count: 2 },
    ]);
  });
});

describe('CSV serialization', () => {
  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(42)).toBe('42');
  });

  it('serializes a header + rows into CRLF-delimited CSV', () => {
    const csv = toCsv(['a', 'b'], [
      [1, 'x'],
      [2, 'y,z'],
    ]);
    expect(csv).toBe('a,b\r\n1,x\r\n2,"y,z"');
  });

  it('serializes a full analytics report without throwing', () => {
    const report: AnalyticsReport = {
      range: { start: new Date('2024-03-10T00:00:00Z'), end: new Date('2024-03-11T00:00:00Z') },
      totalClicks: 3,
      clicksToday: 1,
      dailySeries: [
        { date: '2024-03-10', clicks: 2 },
        { date: '2024-03-11', clicks: 1 },
      ],
      clicksByType: { product: 2, deal: 1 },
      clicksByDevice: { mobile: 2, tablet: 0, desktop: 1, unknown: 0 },
      clicksByCategory: [{ categoryId: 'a', categoryName: 'Apparel', clicks: 3 }],
      topProducts: [{ id: 'p1', label: 'Phone', slug: 'phone', periodClicks: 2, allTimeClicks: 100 }],
      topDeals: [],
      topQueries: [{ query: 'shoes', count: 4 }],
      zeroResultQueries: [],
      mostClickedProduct: { id: 'p1', label: 'Phone', slug: 'phone', periodClicks: 2, allTimeClicks: 100 },
      mostClickedDeal: null,
    };
    const csv = analyticsReportToCsv(report);
    expect(csv).toContain('Total clicks,3');
    expect(csv).toContain('2024-03-10,2');
    expect(csv).toContain('Phone,phone,2,100');
    expect(csv).toContain('shoes,4');
  });
});
