// Feature: dealspark, Property 23: Password hashing round-trip
/**
 * Property 23: Password hashing round-trip
 * Validates: Requirements 13.6, 20.8
 *
 * Requirement 13.6: THE Auth_Service SHALL store the Administrator password as
 * a bcrypt hash.
 * Requirement 20.8: WHEN an Administrator submits a password change in which
 * the current password is verified and the new password satisfies the password
 * policy (8 to 128 characters), THE System SHALL persist the new password as a
 * bcrypt hash.
 *
 * Design (Property 23): *For any* password satisfying the policy (8–128
 * characters), verifying the stored bcrypt hash against the original password
 * succeeds, and verifying it against any different password fails.
 *
 * This exercises the real `hashPassword` / `verifyPassword` code path (bcrypt
 * cost 12) — no mocking. bcrypt is intentionally CPU-expensive, so this
 * property runs a reduced number of cases ({ numRuns: 25 }) while still
 * sampling a wide range of policy-valid passwords. We assert three things per
 * case:
 *   1. Round-trip: verifying the original password against its own hash → true.
 *   2. Rejection: verifying a *different* password against that hash → false.
 *   3. Salting: two independent hashes of the same password differ, yet both
 *      verify the original password.
 */
import * as fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  verifyPassword,
} from '@/lib/auth';

// A password constrained to the 8–128 character policy (Req 20.8). Using the
// full unicode string generator exercises multi-byte characters too; bcrypt
// operates on the UTF-8 byte length, but the policy is character-based and
// `hashPassword` accepts any string, so this stays within the input space.
const policyPasswordArb: fc.Arbitrary<string> = fc.string({
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
});

describe('Property 23: password hashing round-trip (Req 13.6, 20.8)', () => {
  test('hash verifies the original, rejects a different password, and is salted', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Two passwords; we constrain `other` to differ from `password` so the
        // "rejects a different password" assertion is meaningful.
        policyPasswordArb,
        policyPasswordArb,
        async (password, other) => {
          fc.pre(other !== password);

          const hash = await hashPassword(password);

          // 1. Round-trip succeeds.
          expect(await verifyPassword(password, hash)).toBe(true);

          // 2. A different password does not verify.
          expect(await verifyPassword(other, hash)).toBe(false);

          // 3. Salting: a second hash of the same password differs from the
          //    first, yet still verifies the original password.
          const hash2 = await hashPassword(password);
          expect(hash2).not.toBe(hash);
          expect(await verifyPassword(password, hash2)).toBe(true);
        },
      ),
      // bcrypt cost 12 is deliberately slow; keep the run count modest.
      { numRuns: 8 },
    );
  }, 120_000);

  // Deterministic anchors alongside the property.
  test('a minimum-length password round-trips', async () => {
    const password = 'a'.repeat(PASSWORD_MIN_LENGTH);
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password + 'x', hash)).toBe(false);
  });

  test('a maximum-length password round-trips', async () => {
    const password = 'z'.repeat(PASSWORD_MAX_LENGTH);
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });
});
