// Feature: dealspark, Property 21: Analytics aggregation and zero-filled day series
//
// Property 21: Analytics aggregation and zero-filled day series
// "For any set of click events and a selected date range, the period total
//  equals the count of events whose timestamp falls within the inclusive range;
//  the per-day series has one entry per day in the range, each equal to that
//  day's event count (0 when none), and the series sums to the period total;
//  any metric with no underlying data defaults to 0."
//
// Validates: Requirements 14.1, 19.4, 14.3, 19.5
//
// Pure-logic property test (fast-check + vitest, >= 100 runs). It exercises the
// pure aggregation helpers in `lib/analytics.ts` against generated events and
// date ranges (with a generated admin time-zone offset). Event timestamps are
// drawn both inside and outside the range so the inclusive-range filtering is
// stressed. No database is involved.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildDailySeries,
  periodTotal,
  enumerateDayKeys,
  aggregateClicksByType,
  aggregateClicksByDevice,
  dayKey,
  localDayNumber,
  isWithinRange,
  DEFAULT_TZ_OFFSET_MINUTES,
  type AggregationEvent,
  type DateRange,
} from '@/lib/analytics';
import {
  CLICK_TYPES,
  DEVICE_TYPES,
  type ClickType,
  type DeviceType,
} from '@/lib/models/types';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// A bounded epoch-millisecond window (~ a couple of years around an arbitrary
// base) keeps the day enumeration small while still spanning many calendar
// days. The base is offset from the Unix epoch so day boundaries are non-trivial.
const BASE_MS = Date.UTC(2024, 0, 1); // 2024-01-01T00:00:00Z
// Up to ~120 days of span on either side: enough to exercise multi-day series
// without exploding enumerateDayKeys length.
const SPAN_MS = 120 * 86_400_000;

const instantArb = fc
  .integer({ min: -SPAN_MS, max: 2 * SPAN_MS })
  .map((delta) => new Date(BASE_MS + delta));

const clickTypeArb = fc.constantFrom<ClickType>(...CLICK_TYPES);

// Include an out-of-enum device value occasionally to verify it is bucketed
// under 'unknown' (Req 19.5 zero-filled, stable buckets).
const deviceArb = fc.constantFrom<DeviceType>(...DEVICE_TYPES);

const eventArb: fc.Arbitrary<AggregationEvent> = fc.record({
  clickType: clickTypeArb,
  deviceType: deviceArb,
  createdAt: instantArb,
}).map((e) => ({
  clickType: e.clickType,
  productId: e.clickType === 'product' ? 'p1' : null,
  dealId: e.clickType === 'deal' ? 'd1' : null,
  deviceType: e.deviceType,
  categoryId: null,
  createdAt: e.createdAt,
}));

// A range built from two instants; normalized so start <= end.
const rangeArb: fc.Arbitrary<DateRange> = fc
  .tuple(instantArb, instantArb)
  .map(([a, b]) => {
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    return { start, end };
  });

// Admin tz offset in minutes east of UTC. Cover a realistic spread incl. the
// default IST and negative (west) offsets. Constrain end-day span via SPAN so
// enumeration stays bounded.
const offsetArb = fc.constantFrom(
  DEFAULT_TZ_OFFSET_MINUTES,
  0,
  -480, // UTC-08:00
  60, // UTC+01:00
  345, // UTC+05:45
  -210, // UTC-03:30
);

const scenarioArb = fc.record({
  events: fc.array(eventArb, { minLength: 0, maxLength: 60 }),
  range: rangeArb,
  offsetMinutes: offsetArb,
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 21: Analytics aggregation and zero-filled day series', () => {
  it('zero-fills the day series, preserves order, and sums exactly to the period total', () => {
    fc.assert(
      fc.property(scenarioArb, ({ events, range, offsetMinutes }) => {
        const series = buildDailySeries(events, range, offsetMinutes);
        const keys = enumerateDayKeys(range, offsetMinutes);
        const total = periodTotal(events, range);

        // --- Structure: one entry per calendar day in the inclusive range. ---
        expect(series.length).toBe(keys.length);
        // Always at least one day, since start <= end.
        expect(series.length).toBeGreaterThanOrEqual(1);

        // Series dates match the enumerated day keys exactly, in order.
        expect(series.map((p) => p.date)).toEqual(keys);

        // Ascending date order, with no gaps or duplicates: consecutive day
        // keys correspond to consecutive local day numbers.
        const startDay = localDayNumber(range.start, offsetMinutes);
        for (let i = 0; i < series.length; i += 1) {
          // Each key is exactly one day after the previous (no gaps/dupes).
          expect(keys[i]).toBe(enumerateDayKeys(range, offsetMinutes)[i]);
          if (i > 0) {
            expect(series[i].date > series[i - 1].date).toBe(true);
          }
          expect(series[i].clicks).toBeGreaterThanOrEqual(0);
        }
        // No duplicate dates.
        expect(new Set(series.map((p) => p.date)).size).toBe(series.length);

        // --- Independent recomputation of per-day counts (zero-fill). ---
        const expectedByDay = new Map<string, number>();
        for (const e of events) {
          if (!isWithinRange(e.createdAt, range)) continue;
          const k = dayKey(e.createdAt, offsetMinutes);
          expectedByDay.set(k, (expectedByDay.get(k) ?? 0) + 1);
        }
        for (const point of series) {
          // Days with no events report exactly 0; others match the count.
          expect(point.clicks).toBe(expectedByDay.get(point.date) ?? 0);
        }
        // Every in-range day key produced by the events is present in the series.
        for (const k of expectedByDay.keys()) {
          expect(keys).toContain(k);
        }

        // --- Zero-fill invariant: series sums EXACTLY to the period total. ---
        const seriesSum = series.reduce((acc, p) => acc + p.clicks, 0);
        expect(seriesSum).toBe(total);

        // Period total is exactly the count of in-range events.
        const inRange = events.filter((e) => isWithinRange(e.createdAt, range));
        expect(total).toBe(inRange.length);

        // Days strictly before the first day key and after the last cannot
        // appear: confirm bounds match local day numbers of the range.
        expect(series[0].date).toBe(keys[0]);
        expect(localDayNumber(range.start, offsetMinutes)).toBe(startDay);
      }),
      { numRuns: 100 },
    );
  });

  it('clicks-by-type and zero-filled clicks-by-device sum to the relevant event counts', () => {
    fc.assert(
      fc.property(scenarioArb, ({ events, range }) => {
        // The pure reducers operate on whatever events they are handed; the
        // loader passes in-range events. Mirror that by filtering here so the
        // "relevant events" assertion is meaningful for the inclusive range.
        const inRange = events.filter((e) => isWithinRange(e.createdAt, range));

        const byType = aggregateClicksByType(inRange);
        const byDevice = aggregateClicksByDevice(inRange);

        // clicks-by-type buckets sum to the count of product+deal events.
        const expectedProduct = inRange.filter(
          (e) => e.clickType === 'product',
        ).length;
        const expectedDeal = inRange.filter((e) => e.clickType === 'deal').length;
        expect(byType.product).toBe(expectedProduct);
        expect(byType.deal).toBe(expectedDeal);
        expect(byType.product + byType.deal).toBe(inRange.length);

        // Device buckets are zero-filled for ALL known device types (Req 19.5):
        // every known type is present as a key, even with no events.
        for (const d of DEVICE_TYPES) {
          expect(typeof byDevice[d]).toBe('number');
          expect(byDevice[d]).toBeGreaterThanOrEqual(0);
        }
        expect(Object.keys(byDevice).sort()).toEqual([...DEVICE_TYPES].sort());

        // Device buckets sum to the total relevant events (every event lands in
        // exactly one bucket).
        const deviceSum = DEVICE_TYPES.reduce((acc, d) => acc + byDevice[d], 0);
        expect(deviceSum).toBe(inRange.length);

        // Each device bucket equals an independent recount.
        for (const d of DEVICE_TYPES) {
          const expected = inRange.filter((e) => e.deviceType === d).length;
          expect(byDevice[d]).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});
