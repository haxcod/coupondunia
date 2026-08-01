/**
 * Public search query-parameter schema (Req 21.1, 21.7, 11.10).
 *
 * - q: 1–100 characters
 * - type: optional, one of "product" | "deal" | "all" (defaults to "all")
 */
import { z } from 'zod';

export const searchTypeSchema = z.enum(['product', 'deal', 'all']);

export const searchParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'A search query is required.')
    .max(100, 'Search query must be at most 100 characters.'),
  type: searchTypeSchema.optional().default('all'),
});

export type SearchType = z.infer<typeof searchTypeSchema>;
export type SearchParamsInput = z.infer<typeof searchParamsSchema>;
