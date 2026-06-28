/**
 * Shared Zod primitives for DealSpark form/API validation (Task 3.1).
 *
 * These building blocks are reused by every domain schema so that the same
 * rules run on the client (instant feedback, value retention) and the server
 * (authoritative rejection) — a single source of truth (design "Error
 * Handling": shared Zod schemas).
 *
 * Money convention: persisted values are integer **paise** (`lib/models/types`),
 * but the human-facing admin forms and public API operate on the **rupee**
 * range 0.01–999,999,999.99, so validation happens here in rupees.
 */
import { z } from 'zod';
import {
  CLICK_TYPES,
  DEAL_TYPES,
  ENTITY_STATUSES,
  LINK_TARGETS,
  type ClickType,
  type DealType,
  type EntityStatus,
  type LinkTarget,
} from '../models/types';

// ---------------------------------------------------------------------------
// Numeric / length bounds (kept as named constants for tests and reuse).
// ---------------------------------------------------------------------------

/** ₹0.01 — the smallest representable price (Req 2.2, 16.4). */
export const MIN_PRICE_RUPEES = 0.01;
/** ₹999,999,999.99 — the largest representable price (Req 2.2, 16.4). */
export const MAX_PRICE_RUPEES = 999_999_999.99;

/** Display-order bounds shared by categories and banners (Req 15.8, 18.x). */
export const MIN_DISPLAY_ORDER = 0;
export const MAX_DISPLAY_ORDER = 9999;

/** Admin password policy bounds (Req 13.x, 20.8, 20.10). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Generic URL / email caps. */
export const MAX_URL_LENGTH = 2048;
export const MAX_EMAIL_LENGTH = 254;

/** Click-identifier cap (Req 9.1/9.6). */
export const MAX_CLICK_ID_LENGTH = 64;

/** Analytics custom-range cap (Req 19.1/19.3). */
export const MAX_RANGE_DAYS = 366;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Reusable predicates
// ---------------------------------------------------------------------------

/**
 * True when `value` parses as an absolute URL using the `http` or `https`
 * scheme (Req 17.3 destination URL, 18.4 banner link, 20.4 social links).
 */
export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/** True when a number is a money amount with at most two decimal places. */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** Inclusive day span between two dates (used by the analytics range rule). */
export function dayspan(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_DAY;
}

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

/** A trimmed, bounded required string field. */
export function boundedString(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, min === 1 ? 'This field is required.' : `Must be at least ${min} characters.`)
    .max(max, `Must be at most ${max} characters.`);
}

/** A trimmed string limited to `max` characters that may be empty/omitted. */
export function optionalBoundedString(max: number) {
  return z.string().trim().max(max, `Must be at most ${max} characters.`).optional();
}

/** Email field: valid `local-part@domain.tld` pattern, at most 254 chars (Req 12.3, 20.1). */
export const emailField = z
  .email('Must be a valid email address.')
  .max(MAX_EMAIL_LENGTH, `Must be at most ${MAX_EMAIL_LENGTH} characters.`);

/** Required absolute http(s) URL, at most `max` characters (Req 17.3, 18.4). */
export function httpUrl(max: number = MAX_URL_LENGTH) {
  return z
    .string()
    .min(1, 'A URL is required.')
    .max(max, `Must be at most ${max} characters.`)
    .refine(isHttpUrl, 'Must be a valid http or https URL.');
}

/**
 * Optional absolute http(s) URL: accepts an empty string or a well-formed
 * http(s) URL, at most `max` characters (Req 20.4/20.6 social links).
 */
export function optionalHttpUrl(max: number = MAX_URL_LENGTH) {
  return z
    .string()
    .max(max, `Must be at most ${max} characters.`)
    .refine((v) => v === '' || isHttpUrl(v), 'Must be a valid http or https URL.')
    .optional();
}

/** Current/original price in rupees, range 0.01–999,999,999.99 (Req 2.2, 16.4/16.5). */
export const rupeePrice = z
  .number({ message: 'A numeric price is required.' })
  .min(MIN_PRICE_RUPEES, `Price must be at least ₹${MIN_PRICE_RUPEES}.`)
  .max(MAX_PRICE_RUPEES, `Price must not exceed ₹${MAX_PRICE_RUPEES}.`)
  .refine(hasAtMostTwoDecimals, 'Price must have at most two decimal places.');

/** Display order: integer in 0–9999 (Req 15.8). */
export const displayOrder = z
  .number({ message: 'Display order must be a number.' })
  .int('Display order must be a whole number.')
  .min(MIN_DISPLAY_ORDER, `Display order must be at least ${MIN_DISPLAY_ORDER}.`)
  .max(MAX_DISPLAY_ORDER, `Display order must not exceed ${MAX_DISPLAY_ORDER}.`);

/** Admin password: 8–128 characters (Req 20.8/20.10). */
export const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

// Domain enums reused from the data layer so the validation vocabulary stays
// in lock-step with the Mongoose models (single source of truth).
export const statusField = z.enum(
  ENTITY_STATUSES as unknown as [EntityStatus, ...EntityStatus[]],
);
export const dealTypeField = z.enum(
  DEAL_TYPES as unknown as [DealType, ...DealType[]],
);
export const linkTargetField = z.enum(
  LINK_TARGETS as unknown as [LinkTarget, ...LinkTarget[]],
);
export const clickTypeField = z.enum(
  CLICK_TYPES as unknown as [ClickType, ...ClickType[]],
);

/** A non-empty entity identifier (Mongo ObjectId hex string from the form). */
export const idField = z.string().trim().min(1, 'An identifier is required.');
