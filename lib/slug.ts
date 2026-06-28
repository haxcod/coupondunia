/**
 * Slug generation and uniqueness utilities (pure logic, no DB access).
 *
 * Implements the slug rules from the DealSpark requirements:
 * - Req 23.1: 1–200 chars, only lowercase letters/digits/hyphens, non-allowed
 *   characters removed, runs of whitespace/removed characters collapsed to a
 *   single hyphen, no leading/trailing/consecutive hyphens.
 * - Req 23.2 / 15.5: empty-after-sanitization inputs produce a non-empty fallback.
 * - Req 23.3 / 23.4 / 15.6: uniqueness within a collection via the smallest free
 *   `-n` suffix starting at 2, kept within 200 characters.
 * - Req 24.12: store-scoped product/deal slugs include the sanitized store-name
 *   tokens.
 */

/** Maximum slug length per Req 23.1. */
export const MAX_SLUG_LENGTH = 200;

/** Canonical slug shape per Req 23.1. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Default fallback used when sanitization yields an empty string (Req 23.2). */
const DEFAULT_FALLBACK = 'item';

/**
 * A predicate (sync or async) reporting whether a candidate slug already exists
 * in the target collection. `ensureUniqueSlug` also accepts a `Set`/iterable of
 * existing slugs as a convenience.
 */
export type SlugExistsPredicate = (slug: string) => boolean | Promise<boolean>;

/**
 * Sanitize an arbitrary source string into the canonical slug shape.
 *
 * Diacritics are folded (e.g. `é` -> `e`) via Unicode normalization so accented
 * Latin input degrades gracefully. Any run of characters outside `[a-z0-9]`
 * collapses to a single hyphen; leading/trailing hyphens are trimmed and the
 * result is truncated to {@link MAX_SLUG_LENGTH} without leaving a trailing
 * hyphen. May return an empty string (callers apply the fallback).
 */
function sanitize(source: string): string {
  const folded = source
    .normalize('NFKD')
    // Strip combining diacritical marks left behind by NFKD decomposition.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Collapse every run of non-alphanumeric characters into a single hyphen.
  const hyphenated = folded.replace(/[^a-z0-9]+/g, '-');

  // Remove leading/trailing hyphens.
  const trimmed = hyphenated.replace(/^-+|-+$/g, '');

  if (trimmed.length <= MAX_SLUG_LENGTH) {
    return trimmed;
  }

  // Truncate and re-trim a hyphen that may now sit at the boundary.
  return trimmed.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
}

/**
 * Generate a valid slug from a source name or title (Req 23.1, 23.2).
 *
 * The result always matches {@link SLUG_PATTERN}, is 1–200 characters, and is
 * never empty: when the source sanitizes to nothing (empty, whitespace-only,
 * punctuation-only, or non-Latin input) the `fallback` is used instead.
 */
export function generateSlug(source: string, fallback: string = DEFAULT_FALLBACK): string {
  const sanitized = sanitize(source);
  if (sanitized.length > 0) {
    return sanitized;
  }

  const sanitizedFallback = sanitize(fallback);
  return sanitizedFallback.length > 0 ? sanitizedFallback : DEFAULT_FALLBACK;
}

/**
 * Build a store-scoped slug for a product or deal (Req 24.12).
 *
 * The store name is placed first so its sanitized tokens always survive
 * truncation, then followed by the title tokens.
 */
export function storeScopedSlug(storeName: string, title: string): string {
  return generateSlug(`${storeName} ${title}`);
}

/** Coerce a predicate or a set/iterable of existing slugs into a predicate. */
function toPredicate(
  exists: SlugExistsPredicate | Set<string> | Iterable<string>,
): SlugExistsPredicate {
  if (typeof exists === 'function') {
    return exists;
  }
  const set = exists instanceof Set ? exists : new Set(exists);
  return (slug) => set.has(slug);
}

/**
 * Truncate a base slug so that appending `suffix` keeps the total within
 * {@link MAX_SLUG_LENGTH}, trimming any hyphen left at the cut boundary.
 */
function fitBaseForSuffix(base: string, suffix: string): string {
  const maxBaseLength = MAX_SLUG_LENGTH - suffix.length;
  if (base.length <= maxBaseLength) {
    return base;
  }
  const cut = base.slice(0, Math.max(0, maxBaseLength)).replace(/-+$/, '');
  return cut.length > 0 ? cut : DEFAULT_FALLBACK.slice(0, Math.max(1, maxBaseLength));
}

/**
 * Ensure a slug is unique within its collection (Req 23.3, 23.4, 15.6).
 *
 * The `base` is first normalized into canonical slug shape. If it is already
 * free it is returned as-is; otherwise the smallest integer `n` starting at 2
 * is appended as `-n`, repeating until a free slug is found. The base portion is
 * shortened as needed so the final slug never exceeds {@link MAX_SLUG_LENGTH}.
 *
 * @param base   The desired slug (or source) to make unique.
 * @param exists A predicate, `Set`, or iterable describing taken slugs.
 */
export async function ensureUniqueSlug(
  base: string,
  exists: SlugExistsPredicate | Set<string> | Iterable<string>,
): Promise<string> {
  const predicate = toPredicate(exists);
  const baseSlug = generateSlug(base);

  if (!(await predicate(baseSlug))) {
    return baseSlug;
  }

  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${fitBaseForSuffix(baseSlug, suffix)}${suffix}`;
    if (!(await predicate(candidate))) {
      return candidate;
    }
  }
}
