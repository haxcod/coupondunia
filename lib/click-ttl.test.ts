// Feature: dealspark, Property 13: Click-event TTL deletes exactly the expired events
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';

import {
  CLICK_EVENT_TTL_MS,
  CLICK_TTL_SCHEDULE_INTERVAL_MS,
  deleteExpiredClickEvents,
  scheduleClickEventTtl,
  ttlCutoff,
} from './click-ttl';
import { CLICK_EVENT_TTL_SECONDS } from './models/types';
import { ClickEvent } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

describe('click-ttl pure logic', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retention window equals 90 days (7,776,000s) in ms', () => {
    expect(CLICK_EVENT_TTL_MS).toBe(CLICK_EVENT_TTL_SECONDS * 1000);
    expect(CLICK_EVENT_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('schedule ceiling is 24h (Req 27.4)', () => {
    expect(CLICK_TTL_SCHEDULE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('ttlCutoff is exactly 90 days before the reference time', () => {
    const now = new Date('2025-06-01T00:00:00.000Z');
    expect(ttlCutoff(now).getTime()).toBe(now.getTime() - CLICK_EVENT_TTL_MS);
  });

  it('clamps an over-large interval down to the 24h ceiling', () => {
    vi.useFakeTimers();
    const setInterval = vi.spyOn(globalThis, 'setInterval');

    const schedule = scheduleClickEventTtl({
      intervalMs: CLICK_TTL_SCHEDULE_INTERVAL_MS * 10,
      runImmediately: false,
    });

    expect(setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      CLICK_TTL_SCHEDULE_INTERVAL_MS,
    );
    schedule.stop();
  });

  it('honors a smaller interval and stop() clears the timer', () => {
    vi.useFakeTimers();
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');

    const oneHour = 60 * 60 * 1000;
    const schedule = scheduleClickEventTtl({
      intervalMs: oneHour,
      runImmediately: false,
    });

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), oneHour);
    schedule.stop();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Property 13: Click-event TTL deletes exactly the expired events
//
// "For any set of stored click events and a current time, applying the
//  time-to-live process deletes exactly those events whose creation timestamp
//  is more than 90 days (7,776,000 seconds) before the current time, and
//  retains all others."
//
// Validates: Requirements 27.3, 27.4
//
// We exercise the *real* deterministic sweep (`deleteExpiredClickEvents`)
// against an in-memory replica set. Each generated event is seeded with an
// explicit `createdAt` placed on either side of (or exactly on) the 90-day
// cutoff, then we assert the surviving set is precisely the non-expired events.
// The cutoff is strict (`$lt`): an event aged *exactly* 90 days is retained.
//
// DB-backed properties are slower than pure-logic ones, so `numRuns` is
// reduced while keeping the generated event set meaningful.
// ---------------------------------------------------------------------------

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const FAR_MS = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years

/**
 * `deltaMs` is the signed offset of an event's age relative to the exact 90-day
 * cutoff. age = CLICK_EVENT_TTL_MS + deltaMs, so:
 *   delta  > 0 -> strictly older than the window  -> EXPECTED DELETED
 *   delta == 0 -> exactly at the window boundary   -> EXPECTED RETAINED (strict)
 *   delta  < 0 -> younger than the window          -> EXPECTED RETAINED
 */
const deltaMsArb = fc.oneof(
  fc.constant(0), // exact boundary -> retained
  fc.constant(1), // 1ms past the boundary -> deleted
  fc.constant(-1), // 1ms inside the window -> retained
  fc.integer({ min: -TEN_DAYS_MS, max: TEN_DAYS_MS }),
  fc.integer({ min: -FAR_MS, max: FAR_MS }),
);

describe('Property 13: Click-event TTL deletes exactly the expired events', () => {
  setupMemoryMongo();

  it('sweep deletes exactly the events older than 90 days and retains the rest', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(deltaMsArb, { minLength: 0, maxLength: 25 }),
        async (deltas) => {
          // The harness afterEach only clears between test cases, not between
          // fast-check iterations, so reset the collection for each run.
          await ClickEvent.deleteMany({});
          const now = new Date();

          // Seed each event with an explicit createdAt via the native driver so
          // Mongoose's timestamp logic does not overwrite our chosen time.
          const docs = deltas.map((deltaMs) => {
            const createdAt = new Date(now.getTime() - (CLICK_EVENT_TTL_MS + deltaMs));
            return {
              _id: new Types.ObjectId(),
              deltaMs,
              createdAt,
            };
          });

          if (docs.length > 0) {
            await ClickEvent.collection.insertMany(
              docs.map((d) => ({
                _id: d._id,
                clickType: 'product',
                productId: null,
                dealId: null,
                deviceType: 'unknown',
                referrer: '',
                userAgent: '',
                createdAt: d.createdAt,
              })),
            );
          }

          // Expected survivors: events at or inside the 90-day window (delta <= 0).
          const expectedRetainedIds = new Set(
            docs.filter((d) => d.deltaMs <= 0).map((d) => d._id.toString()),
          );
          const expectedDeletedCount = docs.length - expectedRetainedIds.size;

          const deletedCount = await deleteExpiredClickEvents(now);

          // The sweep reports the exact number of expired events removed.
          expect(deletedCount).toBe(expectedDeletedCount);

          // The surviving set is precisely the non-expired events.
          const remaining = await ClickEvent.find({}, { _id: 1 }).lean();
          const remainingIds = new Set(remaining.map((r) => r._id.toString()));

          expect(remainingIds.size).toBe(expectedRetainedIds.size);
          for (const id of expectedRetainedIds) {
            expect(remainingIds.has(id)).toBe(true);
          }
          // And nothing expired survived.
          for (const id of remainingIds) {
            expect(expectedRetainedIds.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
