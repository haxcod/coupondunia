// Feature: dealspark, Property 22: Login lockout after repeated failures
/**
 * Property 22: Login lockout after repeated failures
 * Validates: Requirements 13.5
 *
 * Requirement 13.5: IF an Administrator submits non-matching credentials 5
 * consecutive times within a 15-minute window, THEN the Auth_Service SHALL
 * reject all further login attempts for that account for 15 minutes from the
 * 5th failed attempt and SHALL render a message indicating the account is
 * temporarily locked.
 *
 * This exercises the *real* code path: `login` reads `LoginAttempt` records
 * from an in-memory MongoDB replica set (via the shared harness) and evaluates
 * the lockout window. For each generated timeline of attempts we seed the
 * collection with controlled `createdAt` timestamps and assert that `login`
 * locks exactly when the most-recent consecutive-failure streak contains 5+
 * failures clustered within the 15-minute window and the lock has not yet
 * elapsed. We always submit the *correct* password so the lockout is the only
 * possible reason for rejection — isolating the property under test.
 */
import * as fc from 'fast-check';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

import {
  LOCKOUT_DURATION_MS,
  LOCKOUT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  hashPassword,
  login,
} from '@/lib/auth';
import { AdminUser, LoginAttempt } from '@/lib/models';
import { setupMemoryMongo } from '@/test/harness/mongo-memory';

setupMemoryMongo();

const ADMIN_EMAIL = 'admin@dealspark.test';
const ADMIN_PASSWORD = 'correct-horse-battery';

// Clock skew tolerance: our `nowMs` is captured just before `login`, which
// captures its own `now` a few milliseconds later. Precondition out scenarios
// whose lock boundary falls inside this band to avoid boundary flakiness.
const SKEW_GUARD_MS = 3_000;

let cachedHash: string;

beforeAll(async () => {
  // `login` does not touch cookies, but set a secret defensively in case any
  // session machinery is reached.
  process.env.SESSION_SECRET ||= 'test-session-secret-property-22';
  // Hash once (bcrypt cost 12 is expensive) and reuse across iterations.
  cachedHash = await hashPassword(ADMIN_PASSWORD);
});

beforeEach(async () => {
  // The harness clears all collections after each test; (re)seed the admin so
  // a correct-password login can succeed when the account is not locked.
  await AdminUser.collection.deleteMany({});
  await AdminUser.collection.insertOne({
    email: ADMIN_EMAIL,
    passwordHash: cachedHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

interface Attempt {
  /** How long before "now" this attempt happened, in milliseconds. */
  ageMs: number;
  successful: boolean;
}

// A single attempt: aged anywhere within the last 25 minutes (so some land
// inside the 15-minute window and some outside it). Failures are weighted 4:1
// so streaks of 5+ failures arise frequently enough to exercise locking.
const attemptArb: fc.Arbitrary<Attempt> = fc.record({
  ageMs: fc.integer({ min: 0, max: 25 * 60 * 1000 }),
  // Weight failures 4:1 over successes so streaks of 5+ failures arise often.
  successful: fc.constantFrom(false, false, false, false, true),
});

const timelineArb = fc.array(attemptArb, { minLength: 0, maxLength: 8 });

/**
 * Independent oracle derived from Requirement 13.5: the account is locked iff
 * the most-recent consecutive-failure streak (scanning newest → oldest,
 * stopping at the first success) holds at least 5 failures whose 5 most-recent
 * members span no more than the 15-minute window, and "now" is still before the
 * (most-recent failure + 15 minutes) lock expiry.
 */
function evaluateOracle(
  attempts: Attempt[],
  nowMs: number,
): { locked: boolean; lockedUntilMs: number | null } {
  // Newest first == smallest age first.
  const sorted = [...attempts].sort((a, b) => a.ageMs - b.ageMs);

  const streakFailAges: number[] = [];
  for (const a of sorted) {
    if (a.successful) break; // a success ends the consecutive-failure streak
    streakFailAges.push(a.ageMs);
  }

  if (streakFailAges.length < MAX_FAILED_ATTEMPTS) {
    return { locked: false, lockedUntilMs: null };
  }

  const newestAge = streakFailAges[0];
  const fifthAge = streakFailAges[MAX_FAILED_ATTEMPTS - 1];
  const span = fifthAge - newestAge; // older minus newer, >= 0

  if (span > LOCKOUT_WINDOW_MS) {
    return { locked: false, lockedUntilMs: null };
  }

  const lockedUntilMs = nowMs - newestAge + LOCKOUT_DURATION_MS;
  return { locked: nowMs < lockedUntilMs, lockedUntilMs };
}

describe('Property 22: login lockout after repeated failures (Req 13.5)', () => {
  test('locks exactly when 5+ recent failures cluster within the 15-minute window', async () => {
    await fc.assert(
      fc.asyncProperty(timelineArb, async (attempts) => {
        // Reset only the attempt log between iterations (the harness does not
        // clear inside a single property run).
        await LoginAttempt.collection.deleteMany({});

        const nowMs = Date.now();
        if (attempts.length > 0) {
          await LoginAttempt.collection.insertMany(
            attempts.map((a) => ({
              email: ADMIN_EMAIL,
              successful: a.successful,
              createdAt: new Date(nowMs - a.ageMs),
            })),
          );
        }

        const oracle = evaluateOracle(attempts, nowMs);

        // Skip scenarios whose lock boundary is within the clock-skew band.
        if (oracle.lockedUntilMs !== null) {
          fc.pre(Math.abs(oracle.lockedUntilMs - nowMs) > SKEW_GUARD_MS);
        }

        const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

        if (oracle.locked) {
          // Even with correct credentials, an active lock rejects the attempt.
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('locked');
            expect(result.error.lockedUntil).toBeInstanceOf(Date);
            // The lock lifts 15 minutes after the most-recent failure.
            expect(result.error.lockedUntil!.getTime()).toBeGreaterThan(nowMs);
          }
        } else {
          // No active lock + correct password ⇒ authentication succeeds.
          expect(result.ok).toBe(true);
        }
      }),
      { numRuns: 15 },
    );
  }, 120_000);

  // A couple of deterministic anchors alongside the property.
  test('5 failures within the window lock the account', async () => {
    await LoginAttempt.collection.deleteMany({});
    const nowMs = Date.now();
    await LoginAttempt.collection.insertMany(
      [1, 2, 3, 4, 5].map((m) => ({
        email: ADMIN_EMAIL,
        successful: false,
        createdAt: new Date(nowMs - m * 60 * 1000),
      })),
    );

    const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('locked');
    }
  });

  test('4 failures do not lock the account', async () => {
    await LoginAttempt.collection.deleteMany({});
    const nowMs = Date.now();
    await LoginAttempt.collection.insertMany(
      [1, 2, 3, 4].map((m) => ({
        email: ADMIN_EMAIL,
        successful: false,
        createdAt: new Date(nowMs - m * 60 * 1000),
      })),
    );

    const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(result.ok).toBe(true);
  });

  test('5 failures older than the lock duration are accept-eligible again', async () => {
    await LoginAttempt.collection.deleteMany({});
    const nowMs = Date.now();
    // Five failures clustered, but the most recent is 20 minutes ago — the
    // 15-minute lock has already elapsed.
    await LoginAttempt.collection.insertMany(
      [20, 21, 22, 23, 24].map((m) => ({
        email: ADMIN_EMAIL,
        successful: false,
        createdAt: new Date(nowMs - m * 60 * 1000),
      })),
    );

    const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(result.ok).toBe(true);
  });
});
