/**
 * Shared domain enums and money conventions for the DealSpark data layer.
 *
 * Money convention (Req: design "Data Models"): all monetary values are stored
 * as **integer paise** to avoid binary floating-point drift. A rupee value of
 * ₹0.01 is stored as `1` and ₹999,999,999.99 as `99_999_999_999`. Validation of
 * the human-facing rupee range (0.01–999,999,999.99) happens in the Zod layer;
 * the schema validators below enforce the equivalent integer-paise bounds.
 */

export type EntityStatus = 'active' | 'inactive';
export type DealType = 'coupon_code' | 'direct_deal' | 'bank_card' | 'cashback';
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';
export type LinkTarget = 'same_tab' | 'new_tab';
export type ClickType = 'product' | 'deal';

export const ENTITY_STATUSES: readonly EntityStatus[] = ['active', 'inactive'];
export const DEAL_TYPES: readonly DealType[] = [
  'coupon_code',
  'direct_deal',
  'bank_card',
  'cashback',
];
export const DEVICE_TYPES: readonly DeviceType[] = [
  'mobile',
  'tablet',
  'desktop',
  'unknown',
];
export const LINK_TARGETS: readonly LinkTarget[] = ['same_tab', 'new_tab'];
export const CLICK_TYPES: readonly ClickType[] = ['product', 'deal'];

/** ₹0.01 expressed in paise. */
export const MIN_PRICE_PAISE = 1;
/** ₹999,999,999.99 expressed in paise (stays within Number.MAX_SAFE_INTEGER). */
export const MAX_PRICE_PAISE = 99_999_999_999;

/** Field caps from Req 7.2 / 9.1 / 27.x. */
export const MAX_REFERRER_LENGTH = 2048;
export const MAX_USER_AGENT_LENGTH = 1024;
/** Click-event retention window (90 days) in seconds — Req 27.3. */
export const CLICK_EVENT_TTL_SECONDS = 7_776_000;

/** Validator shared by all integer-paise money fields. */
export function isValidPaise(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return (
    Number.isInteger(value) &&
    value >= MIN_PRICE_PAISE &&
    value <= MAX_PRICE_PAISE
  );
}
