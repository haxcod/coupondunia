/**
 * Banner create/edit schema (Req 18.3, 18.4, 18.5).
 *
 * - internalName 1–100; banner image and link URL required
 * - link URL must use http(s) (18.4)
 * - optional mobile image, headline ≤100, CTA text ≤30, link target, order, status
 *
 * Image file type/size validation (Req 18.4) is enforced by the upload endpoint
 * (Task 9.4); this schema validates the stored image URL references.
 */
import { z } from 'zod';
import {
  boundedString,
  displayOrder,
  httpUrl,
  linkTargetField,
  optionalBoundedString,
  statusField,
} from './primitives';

export const bannerSchema = z.object({
  internalName: boundedString(1, 100),
  imageUrl: z.string().trim().min(1, 'A banner image is required.').max(2048),
  mobileImageUrl: z.string().trim().max(2048).nullable().optional(),
  headline: optionalBoundedString(100).nullable(),
  ctaText: optionalBoundedString(30).nullable(),
  linkUrl: httpUrl(2048),
  linkTarget: linkTargetField.optional().default('same_tab'),
  displayOrder: displayOrder.optional().default(0),
  status: statusField.optional().default('active'),
});

export type BannerInput = z.infer<typeof bannerSchema>;
