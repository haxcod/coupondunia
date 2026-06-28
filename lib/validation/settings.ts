/**
 * Settings schemas (Req 20.1–20.4, 20.6–20.10).
 *
 * Split per settings form so each can be validated and persisted independently:
 *   - site:      name 1–100, tagline 0–200, contact email, notifications flag
 *   - seo:       meta-title suffix 0–70, meta description 0–160, GA4 0–50, SC 0–200
 *   - social:    optional absolute http(s) URLs ≤2048 each
 *   - affiliate: disclosure text 0–1000
 *   - password:  current required, new 8–128 (policy)
 */
import { z } from 'zod';
import { emailField, optionalHttpUrl, passwordField } from './primitives';

/** Site Settings form (Req 20.1/20.2). */
export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(1, 'Site name is required.').max(100, 'Must be at most 100 characters.'),
  tagline: z.string().trim().max(200, 'Must be at most 200 characters.').optional().default(''),
  logoUrl: z.string().trim().max(2048).nullable().optional(),
  faviconUrl: z.string().trim().max(2048).nullable().optional(),
  contactEmail: emailField,
  adminEmailNotifications: z.boolean(),
});

/** SEO Settings form (Req 20.3). */
export const seoSettingsSchema = z.object({
  defaultMetaTitleSuffix: z.string().trim().max(70, 'Must be at most 70 characters.').optional().default(''),
  defaultMetaDescription: z.string().trim().max(160, 'Must be at most 160 characters.').optional().default(''),
  ga4MeasurementId: z.string().trim().max(50, 'Must be at most 50 characters.').optional().default(''),
  searchConsoleCode: z.string().trim().max(200, 'Must be at most 200 characters.').optional().default(''),
});

/** Social Links form (Req 20.4/20.6) — each link optional, valid absolute URL when present. */
export const socialLinksSchema = z.object({
  facebook: optionalHttpUrl(2048),
  instagram: optionalHttpUrl(2048),
  twitter: optionalHttpUrl(2048),
  youtube: optionalHttpUrl(2048),
});

/** Affiliate Settings form (Req 20.7). */
export const affiliateSettingsSchema = z.object({
  defaultAffiliateDisclosure: z
    .string()
    .trim()
    .max(1000, 'Must be at most 1000 characters.')
    .optional()
    .default(''),
});

/** Password change form (Req 20.8/20.9/20.10). */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: passwordField,
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
export type SeoSettingsInput = z.infer<typeof seoSettingsSchema>;
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;
export type AffiliateSettingsInput = z.infer<typeof affiliateSettingsSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
