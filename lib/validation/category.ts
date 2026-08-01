/**
 * Category create/edit schema (Req 15.3, 15.4, 15.7, 15.8).
 *
 * - name: 1–100 trimmed characters (empty / whitespace-only / >100 rejected)
 * - displayOrder: integer 0–9999
 * - optional parent, icon URL, description, homepage flag/title, status, meta
 *
 * Icon file type/size validation (Req 15.8) is enforced by the upload endpoint
 * (Task 9.4); this schema validates the stored icon URL reference.
 */
import { z } from 'zod';
import {
  displayOrder,
  optionalBoundedString,
  statusField,
} from './primitives';

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'A category name is required.').max(100, 'Must be at most 100 characters.'),
  // Optional explicit slug override; when omitted the system derives it (Req 15.5).
  slug: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  iconUrl: z.string().trim().max(2048).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  showOnHomepage: z.boolean().optional().default(false),
  homepageSectionTitle: optionalBoundedString(150).nullable(),
  displayOrder: displayOrder.optional().default(0),
  status: statusField.optional().default('active'),
  metaTitle: optionalBoundedString(200).nullable(),
  metaDescription: optionalBoundedString(300).nullable(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
