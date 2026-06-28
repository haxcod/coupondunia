/**
 * Product create/edit schema (Req 16.4, 16.5, 16.7, 16.11, 16.14).
 *
 * - title 1–200; store name, category, primary image, and affiliate URL required
 * - currentPrice in rupees 0.01–999,999,999.99
 * - originalPrice (when present) must be strictly greater than currentPrice (16.7)
 * - up to 4 additional images (16.11); up to 8 key features ≤120 chars each (16.14)
 */
import { z } from 'zod';
import {
  boundedString,
  httpUrl,
  idField,
  optionalBoundedString,
  rupeePrice,
  statusField,
} from './primitives';

export const productSchema = z
  .object({
    title: boundedString(1, 200),
    slug: z.string().trim().min(1).max(200).optional(),
    // Store entered by name (auto-created case-insensitively, Req 16.8).
    store: boundedString(1, 100),
    categoryId: idField,
    currentPrice: rupeePrice,
    originalPrice: rupeePrice.nullable().optional(),
    primaryImageUrl: z.string().trim().min(1, 'A primary image is required.').max(2048),
    additionalImages: z
      .array(z.string().trim().min(1).max(2048))
      .max(4, 'A product may have at most 4 additional images.')
      .optional()
      .default([]),
    description: z.string().max(50_000).optional().default(''),
    keyFeatures: z
      .array(z.string().trim().min(1).max(120, 'Each key feature must be at most 120 characters.'))
      .max(8, 'A product may have at most 8 key features.')
      .optional()
      .default([]),
    affiliateUrl: httpUrl(2048),
    buttonLabel: optionalBoundedString(50),
    offerExpiresAt: z.coerce.date().nullable().optional(),
    featured: z.boolean().optional().default(false),
    status: statusField.optional().default('active'),
    metaTitle: optionalBoundedString(200).nullable(),
    metaDescription: optionalBoundedString(300).nullable(),
  })
  .superRefine((value, ctx) => {
    // Req 16.7: an original price must be strictly greater than the current price.
    if (
      value.originalPrice !== null &&
      value.originalPrice !== undefined &&
      value.originalPrice <= value.currentPrice
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['originalPrice'],
        message: 'Original price must be greater than the current price.',
      });
    }
  });

export type ProductInput = z.infer<typeof productSchema>;
