// Feature: dealspark, Property 16: Validation predicates accept exactly the conforming inputs
//
// Property 16: Validation predicates accept exactly the conforming inputs.
// Validates: Requirements 12.3, 12.5, 15.3, 15.4, 15.8, 16.4, 16.5, 17.3, 17.4,
//            17.7, 17.9, 18.4, 20.2, 20.6, 20.10, 19.2, 19.3.
//
// Strategy: for each shared Zod schema we build generators that emit BOTH
// conforming and non-conforming field values, each paired with an independent
// expectation (`ok`). The expected acceptance of the whole input is the
// conjunction of every field expectation plus any cross-field rule (original >
// current price, coupon-code presence, date ordering / span). We then assert
// `validate(schema, input).success` equals that independent oracle — proving
// soundness (no invalid input accepted) and completeness (no valid input
// rejected) — and that every rejection identifies at least one field.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validate,
  contactSchema,
  categorySchema,
  productSchema,
  dealSchema,
  bannerSchema,
  siteSettingsSchema,
  socialLinksSchema,
  passwordChangeSchema,
  dateRangeSchema,
  MIN_PRICE_RUPEES,
  MAX_PRICE_RUPEES,
  MAX_RANGE_DAYS,
} from '@/lib/validation';

// ---------------------------------------------------------------------------
// Generic string generators (no surrounding whitespace, so trimmed length ==
// raw length, which keeps the oracle exact for `.trim()`-based schemas).
// ---------------------------------------------------------------------------

const WORD_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const LOWER_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** A string of word characters with length in [min, max]. */
function strOfLen(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...WORD_CHARS), { minLength: min, maxLength: max })
    .map((cs) => cs.join(''));
}

/** A lowercase-letters string with length in [min, max]. */
function lowerOfLen(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...LOWER_CHARS), { minLength: min, maxLength: max })
    .map((cs) => cs.join(''));
}

type Tagged<T> = { value: T; ok: boolean };

/**
 * A required, trimmed string field bounded to [min, max] characters. Emits
 * conforming values plus the three rejection shapes: too short / empty,
 * whitespace-only (trims to empty), and too long.
 */
function reqString(min: number, max: number): fc.Arbitrary<Tagged<string>> {
  return fc.oneof(
    strOfLen(min, max).map((value) => ({ value, ok: true })),
    strOfLen(0, Math.max(0, min - 1)).map((value) => ({ value, ok: false })),
    strOfLen(max + 1, max + 5).map((value) => ({ value, ok: false })),
    fc.constant({ value: '    ', ok: false }),
  );
}

/** A required http(s) URL field (Req 17.3/17.4, 18.4). */
function httpUrlField(): fc.Arbitrary<Tagged<string>> {
  const valid = fc
    .tuple(
      fc.constantFrom('http', 'https'),
      lowerOfLen(1, 12),
      fc.option(lowerOfLen(1, 15), { nil: '' }),
    )
    .map(([scheme, host, path]) => ({
      value: `${scheme}://${host}.com${path ? '/' + path : ''}`,
      ok: true,
    }));
  return fc.oneof(
    valid,
    // No scheme at all -> `new URL` throws -> rejected.
    lowerOfLen(1, 15).map((value) => ({ value, ok: false })),
    // Parses but uses a non-http(s) scheme -> rejected.
    lowerOfLen(1, 10).map((host) => ({ value: `ftp://${host}.com`, ok: false })),
    // Empty -> fails the min(1) length rule.
    fc.constant({ value: '', ok: false }),
  );
}

/** An optional http(s) URL field that also accepts '' / omitted (Req 20.6). */
function optionalHttpUrlField(): fc.Arbitrary<Tagged<string | undefined>> {
  const valid = fc
    .tuple(fc.constantFrom('http', 'https'), lowerOfLen(1, 12))
    .map(([scheme, host]) => ({ value: `${scheme}://${host}.com`, ok: true }));
  return fc.oneof(
    fc.constant({ value: undefined, ok: true }),
    fc.constant({ value: '', ok: true }),
    valid,
    lowerOfLen(1, 15).map((value) => ({ value, ok: false })),
    lowerOfLen(1, 10).map((host) => ({ value: `ftp://${host}.com`, ok: false })),
  );
}

/** A valid `local@domain.tld` email vs a clearly invalid token (Req 12.3, 20.1). */
function emailField(): fc.Arbitrary<Tagged<string>> {
  const valid = fc
    .tuple(lowerOfLen(1, 10), lowerOfLen(1, 10), lowerOfLen(2, 4))
    .map(([local, domain, tld]) => ({
      value: `${local}@${domain}.${tld}`,
      ok: true,
    }));
  return fc.oneof(
    valid,
    // No "@" anywhere -> cannot match local-part@domain.tld.
    lowerOfLen(1, 15).map((value) => ({ value, ok: false })),
  );
}

// ---------------------------------------------------------------------------
// Numeric generators
// ---------------------------------------------------------------------------

/** A rupee price field: 0.01–999,999,999.99 with at most two decimals. */
function priceField(): fc.Arbitrary<Tagged<number>> {
  const validCents = fc
    .integer({ min: 1, max: 100_000_000 })
    .map((cents) => ({ value: cents / 100, ok: true }));
  return fc.oneof(
    validCents,
    fc.constant({ value: MIN_PRICE_RUPEES, ok: true }),
    fc.constant({ value: MAX_PRICE_RUPEES, ok: true }),
    // Below minimum.
    fc.constant({ value: 0, ok: false }),
    fc.integer({ min: 1, max: 10_000 }).map((n) => ({ value: -n / 100, ok: false })),
    // Above maximum.
    fc.constant({ value: MAX_PRICE_RUPEES + 1, ok: false }),
    // More than two decimal places (thousandths not divisible by ten).
    fc
      .integer({ min: 11, max: 999_999 })
      .filter((t) => t % 10 !== 0)
      .map((t) => ({ value: t / 1000, ok: false })),
  );
}

/** A display-order field: optional integer in 0–9999 (Req 15.8). */
function displayOrderField(): fc.Arbitrary<Tagged<number | undefined>> {
  return fc.oneof(
    fc.constant({ value: undefined, ok: true }),
    fc.integer({ min: 0, max: 9999 }).map((value) => ({ value, ok: true })),
    fc.integer({ min: -5000, max: -1 }).map((value) => ({ value, ok: false })),
    fc.integer({ min: 10000, max: 20000 }).map((value) => ({ value, ok: false })),
    fc
      .double({ min: 0.1, max: 9998.9, noNaN: true, noDefaultInfinity: true })
      .filter((n) => !Number.isInteger(n))
      .map((value) => ({ value, ok: false })),
  );
}

/** A password field: 8–128 characters (Req 20.8/20.10). */
function passwordFieldGen(): fc.Arbitrary<Tagged<string>> {
  return fc.oneof(
    strOfLen(8, 128).map((value) => ({ value, ok: true })),
    strOfLen(0, 7).map((value) => ({ value, ok: false })),
    strOfLen(129, 140).map((value) => ({ value, ok: false })),
  );
}

const okDate = () =>
  fc.date({
    min: new Date('2000-01-01T00:00:00Z'),
    max: new Date('2010-12-31T23:59:59Z'),
    noInvalidDate: true,
  });

/** An optional/nullable date field used by deals (Req 17.9). */
function optionalDateField(): fc.Arbitrary<Date | null | undefined> {
  return fc.oneof(fc.constant(undefined), fc.constant(null), okDate());
}

// ---------------------------------------------------------------------------
// Property 16 — one property per validated schema.
// ---------------------------------------------------------------------------

/** Assert the schema's verdict matches the oracle and rejections name a field. */
function assertVerdict(schema: Parameters<typeof validate>[0], input: unknown, expected: boolean) {
  const result = validate(schema, input);
  expect(result.success).toBe(expected);
  if (!result.success) {
    expect(result.fieldErrors.length).toBeGreaterThan(0);
  }
}

describe('Property 16: validation predicates accept exactly the conforming inputs', () => {
  it('contact schema accepts iff name/email/subject/message all conform (Req 12.3, 12.5)', () => {
    fc.assert(
      fc.property(
        reqString(1, 100),
        emailField(),
        reqString(1, 150),
        reqString(1, 2000),
        (name, email, subject, message) => {
          const expected = name.ok && email.ok && subject.ok && message.ok;
          assertVerdict(
            contactSchema,
            {
              name: name.value,
              email: email.value,
              subject: subject.value,
              message: message.value,
            },
            expected,
          );
        },
      ),
    );
  });

  it('category schema accepts iff name and display order conform (Req 15.3, 15.4, 15.8)', () => {
    fc.assert(
      fc.property(reqString(1, 100), displayOrderField(), (name, order) => {
        const expected = name.ok && order.ok;
        const input: Record<string, unknown> = { name: name.value };
        if (order.value !== undefined) input.displayOrder = order.value;
        assertVerdict(categorySchema, input, expected);
      }),
    );
  });

  it('product schema accepts iff fields conform and original > current price (Req 16.4, 16.5)', () => {
    const originalPriceGen = fc.oneof(
      fc.constant({ value: undefined as number | null | undefined, ok: true, num: null as number | null }),
      fc.constant({ value: null as number | null | undefined, ok: true, num: null as number | null }),
      priceField().map((p) => ({ value: p.value as number | null | undefined, ok: p.ok, num: p.ok ? p.value : null })),
    );
    fc.assert(
      fc.property(
        reqString(1, 200),
        priceField(),
        originalPriceGen,
        httpUrlField(),
        (title, current, original, affiliate) => {
          const relationshipOk =
            original.num === null ? true : original.num > current.value;
          const expected =
            title.ok && current.ok && original.ok && affiliate.ok && relationshipOk;
          const input: Record<string, unknown> = {
            title: title.value,
            store: 'Flipkart',
            categoryId: 'cat-123',
            currentPrice: current.value,
            primaryImageUrl: 'primary-image.jpg',
            affiliateUrl: affiliate.value,
          };
          if (original.value !== undefined) input.originalPrice = original.value;
          assertVerdict(productSchema, input, expected);
        },
      ),
    );
  });

  it('deal schema accepts iff fields, coupon-code rule, and date order all hold (Req 17.3, 17.4, 17.7, 17.9)', () => {
    const dealTypeGen = fc.constantFrom('coupon_code', 'direct_deal', 'bank_card', 'cashback');
    const couponGen = fc.oneof(
      fc.constant({ value: undefined as string | null | undefined, fieldOk: true, trimLen: 0 }),
      fc.constant({ value: null as string | null | undefined, fieldOk: true, trimLen: 0 }),
      strOfLen(1, 50).map((s) => ({ value: s as string | null | undefined, fieldOk: true, trimLen: s.length })),
      strOfLen(51, 60).map((s) => ({ value: s as string | null | undefined, fieldOk: false, trimLen: s.length })),
    );
    fc.assert(
      fc.property(
        reqString(1, 120),
        dealTypeGen,
        couponGen,
        httpUrlField(),
        optionalDateField(),
        optionalDateField(),
        (headline, dealType, coupon, dest, validFrom, validUntil) => {
          const conditionalOk =
            dealType !== 'coupon_code' || (coupon.trimLen >= 1 && coupon.trimLen <= 50);
          const dateOrderOk = !(
            validFrom instanceof Date &&
            validUntil instanceof Date &&
            validFrom.getTime() > validUntil.getTime()
          );
          const expected =
            headline.ok &&
            dest.ok &&
            coupon.fieldOk &&
            conditionalOk &&
            dateOrderOk;
          const input: Record<string, unknown> = {
            headline: headline.value,
            store: 'Amazon',
            categoryId: 'cat-123',
            dealType,
            destinationUrl: dest.value,
          };
          if (coupon.value !== undefined) input.couponCode = coupon.value;
          if (validFrom !== undefined) input.validFrom = validFrom;
          if (validUntil !== undefined) input.validUntil = validUntil;
          assertVerdict(dealSchema, input, expected);
        },
      ),
    );
  });

  it('banner schema accepts iff internal name, image, and link URL conform (Req 18.4)', () => {
    fc.assert(
      fc.property(
        reqString(1, 100),
        reqString(1, 2048),
        httpUrlField(),
        (internalName, imageUrl, linkUrl) => {
          const expected = internalName.ok && imageUrl.ok && linkUrl.ok;
          assertVerdict(
            bannerSchema,
            {
              internalName: internalName.value,
              imageUrl: imageUrl.value,
              linkUrl: linkUrl.value,
            },
            expected,
          );
        },
      ),
    );
  });

  it('site-settings schema accepts iff site name and contact email conform (Req 20.2)', () => {
    fc.assert(
      fc.property(reqString(1, 100), emailField(), (siteName, contactEmail) => {
        const expected = siteName.ok && contactEmail.ok;
        assertVerdict(
          siteSettingsSchema,
          {
            siteName: siteName.value,
            contactEmail: contactEmail.value,
            adminEmailNotifications: true,
          },
          expected,
        );
      }),
    );
  });

  it('social-links schema accepts iff every populated link is a valid http(s) URL (Req 20.6)', () => {
    fc.assert(
      fc.property(
        optionalHttpUrlField(),
        optionalHttpUrlField(),
        optionalHttpUrlField(),
        optionalHttpUrlField(),
        (facebook, instagram, twitter, youtube) => {
          const expected = facebook.ok && instagram.ok && twitter.ok && youtube.ok;
          const input: Record<string, unknown> = {};
          if (facebook.value !== undefined) input.facebook = facebook.value;
          if (instagram.value !== undefined) input.instagram = instagram.value;
          if (twitter.value !== undefined) input.twitter = twitter.value;
          if (youtube.value !== undefined) input.youtube = youtube.value;
          assertVerdict(socialLinksSchema, input, expected);
        },
      ),
    );
  });

  it('password-change schema accepts iff the new password is 8–128 characters (Req 20.10)', () => {
    fc.assert(
      fc.property(passwordFieldGen(), (newPassword) => {
        const expected = newPassword.ok;
        assertVerdict(
          passwordChangeSchema,
          { currentPassword: 'current-secret', newPassword: newPassword.value },
          expected,
        );
      }),
    );
  });

  it('analytics date-range schema accepts iff start <= end and span <= 366 days (Req 19.2, 19.3)', () => {
    fc.assert(
      fc.property(okDate(), okDate(), (start, end) => {
        const span = (end.getTime() - start.getTime()) / 86_400_000;
        const expected = start.getTime() <= end.getTime() && span <= MAX_RANGE_DAYS;
        assertVerdict(dateRangeSchema, { start, end }, expected);
      }),
    );
  });
});
