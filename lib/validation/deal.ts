/**
 * Deal create/edit schema (Req 17.3, 17.4, 17.6, 17.7, 17.8, 17.9).
 *
 * - headline 1–120; store name, category, destination URL required
 * - destination URL must use http(s), ≤2048 chars (17.3/17.4)
 * - deal type one of the four allowed values (17.5)
 * - coupon-code deals require a coupon code of 1–50 chars (17.6/17.7)
 * - up to 5 how-to-use steps (17.8); validFrom ≤ validUntil (17.9)
 * - minOrderValue / maxDiscountCap in rupees when present
 */
import { z } from 'zod';
import {
  boundedString,
  dealTypeField,
  httpUrl,
  idField,
  optionalBoundedString,
  rupeePrice,
  statusField,
} from './primitives';

export const dealSchema = z
  .object({
    headline: boundedString(1, 120),
    slug: z.string().trim().min(1).max(200).optional(),
    // Store entered by name (auto-created case-insensitively, Req 16.8/17.x).
    store: boundedString(1, 100),
    categoryId: idField,
    dealType: dealTypeField,
    couponCode: z.string().trim().max(50).nullable().optional(),
    destinationUrl: httpUrl(2048),
    discountValue: optionalBoundedString(50).nullable(),
    buttonLabel: optionalBoundedString(50).nullable(),
    terms: z.string().trim().max(10_000).nullable().optional(),
    howToUseSteps: z
      .array(z.string().trim().min(1).max(500))
      .max(5, 'A deal may have at most 5 how-to-use steps.')
      .optional()
      .default([]),
    validFrom: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    minOrderValue: rupeePrice.nullable().optional(),
    maxDiscountCap: rupeePrice.nullable().optional(),
    applicableFor: optionalBoundedString(200).nullable(),
    featured: z.boolean().optional().default(false),
    status: statusField.optional().default('active'),
  })
  .superRefine((value, ctx) => {
    // Req 17.7: a coupon-code deal requires a non-empty code of 1–50 characters.
    if (value.dealType === 'coupon_code') {
      const code = value.couponCode?.trim() ?? '';
      if (code.length < 1 || code.length > 50) {
        ctx.addIssue({
          code: 'custom',
          path: ['couponCode'],
          message: 'A coupon-code deal requires a coupon code of 1–50 characters.',
        });
      }
    }
    // Req 17.9: valid-from must be on or before valid-until.
    if (
      value.validFrom &&
      value.validUntil &&
      value.validFrom.getTime() > value.validUntil.getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'Valid-until must be on or after valid-from.',
      });
    }
  });

export type DealInput = z.infer<typeof dealSchema>;
