/**
 * Click-event TTL deletion process (Task 5.9).
 *
 * Requirement 27.3: delete every Click_Event whose stored `createdAt` is more
 * than 90 days (7,776,000 seconds) before the current time.
 * Requirement 27.4: execute that deletion process at least once every 24 hours.
 *
 * The `ClickEvent` collection also carries a MongoDB TTL index
 * (`expireAfterSeconds = CLICK_EVENT_TTL_SECONDS`). That index is best-effort
 * and runs on the server's own background cadence (~60s granularity, and only
 * when the cluster is not under load), so this application-level sweep
 * complements it with deterministic, on-demand semantics — which is what the
 * TTL property test (Task 5.10) exercises.
 *
 * This module deliberately implements only the *sweep* and a *schedulable
 * runner*. The actual production cron/interval wiring (process bootstrap) is
 * performed in Task 16.1; here we expose a runner that guarantees an execution
 * cadence of at most 24h.
 */
import { connectToDatabase } from '@/lib/db';
import { ClickEvent } from '@/lib/models';
import { CLICK_EVENT_TTL_SECONDS } from '@/lib/models/types';

/** Retention window in milliseconds (90 days). */
export const CLICK_EVENT_TTL_MS = CLICK_EVENT_TTL_SECONDS * 1000;

/** Maximum allowed gap between sweeps (24 hours) — Req 27.4. */
export const CLICK_TTL_SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the exclusive cutoff instant: any Click_Event with `createdAt`
 * strictly older than this is expired (Req 27.3).
 *
 * @param now The reference "current time". Defaults to `new Date()`.
 */
export function ttlCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - CLICK_EVENT_TTL_MS);
}

/**
 * Delete every Click_Event whose `createdAt` is more than 90 days before `now`
 * and return the number of events deleted (Req 27.3).
 *
 * The comparison is strict (`$lt`): an event whose age is *exactly* 90 days is
 * retained; only events strictly older than the window are removed.
 *
 * @param now Reference time for the cutoff. Defaults to `new Date()`; an
 *            explicit value keeps the sweep deterministic under test.
 * @returns The count of deleted Click_Events (0 when none are expired).
 */
export async function deleteExpiredClickEvents(
  now: Date = new Date(),
): Promise<number> {
  await connectToDatabase();
  const cutoff = ttlCutoff(now);
  const result = await ClickEvent.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount ?? 0;
}

/** Handle returned by {@link scheduleClickEventTtl} so callers can stop it. */
export interface ClickTtlSchedule {
  /** Cancel the recurring sweep and release the timer. */
  stop(): void;
}

/** Options for {@link scheduleClickEventTtl}. */
export interface ScheduleClickTtlOptions {
  /**
   * Sweep cadence in milliseconds. Must be at most 24h (Req 27.4); a larger
   * value is clamped down to {@link CLICK_TTL_SCHEDULE_INTERVAL_MS} so the
   * 24-hour guarantee can never be violated by a misconfiguration.
   */
  intervalMs?: number;
  /**
   * Run a sweep immediately when scheduling (default `true`) so the first
   * deletion does not have to wait a full interval after process start.
   */
  runImmediately?: boolean;
  /** Optional sink for sweep errors; defaults to `console.error`. */
  onError?: (error: unknown) => void;
}

/**
 * Schedule {@link deleteExpiredClickEvents} to run repeatedly at a cadence of at
 * most 24 hours (Req 27.4).
 *
 * Each tick uses a fresh "current time", so the cutoff window always tracks the
 * real clock. Errors from an individual sweep are routed to `onError` and never
 * abort the schedule, so a transient failure cannot silently stop retention.
 *
 * The returned handle's `stop()` clears the timer. The timer is `unref`'d when
 * available so it does not, by itself, keep the Node process alive.
 *
 * @returns A {@link ClickTtlSchedule} handle.
 */
export function scheduleClickEventTtl(
  options: ScheduleClickTtlOptions = {},
): ClickTtlSchedule {
  const {
    intervalMs = CLICK_TTL_SCHEDULE_INTERVAL_MS,
    runImmediately = true,
    onError = (error: unknown) => console.error('[click-ttl] sweep failed', error),
  } = options;

  // Clamp to the 24h ceiling and guard against non-positive values.
  const effectiveInterval = Math.min(
    CLICK_TTL_SCHEDULE_INTERVAL_MS,
    Math.max(1, Math.floor(intervalMs)),
  );

  const runSweep = (): void => {
    void deleteExpiredClickEvents().catch(onError);
  };

  if (runImmediately) {
    runSweep();
  }

  const timer = setInterval(runSweep, effectiveInterval);
  // Avoid pinning the event loop open solely for this background job.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
