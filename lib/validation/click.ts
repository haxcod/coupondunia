/**
 * Click-payload schema for `POST /api/public/click` (Req 9.1, 9.6, 21.3, 21.7).
 *
 * - type: "product" | "deal" (required)
 * - id: non-empty, at most 64 characters (required)
 * - referrer (≤2048) and userAgent (≤1024) are optional; the server derives and
 *   caps them and strips any PII before persistence (Req 27.1/27.2).
 *
 * Omitting the identifier, exceeding the identifier length, or omitting a
 * required field yields a rejection identifying the invalid field (Req 9.6).
 */
import { z } from 'zod';
import { MAX_CLICK_ID_LENGTH, clickTypeField } from './primitives';

export const clickPayloadSchema = z.object({
  type: clickTypeField,
  id: z
    .string()
    .trim()
    .min(1, 'An identifier is required.')
    .max(MAX_CLICK_ID_LENGTH, `Identifier must be at most ${MAX_CLICK_ID_LENGTH} characters.`),
  referrer: z.string().max(2048).optional(),
  userAgent: z.string().max(1024).optional(),
});

export type ClickPayloadInput = z.infer<typeof clickPayloadSchema>;
