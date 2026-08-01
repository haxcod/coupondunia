/**
 * Settings service — singleton site-settings read/write with cache integration
 * (Req 20.1, 20.3, 20.4, 20.7).
 *
 * The `Settings` collection holds at most one document (`singletonKey: 'global'`,
 * guarded by a unique index). This module is the single entry point the rest of
 * the app uses to read and mutate it:
 *
 *   - {@link getSettings} is the public, cached loader. It wraps the database
 *     read in a Next.js 16 `use cache` boundary tagged with `CACHE_TAGS.settings`
 *     so the static shell (footer social links, SEO defaults, site name) can be
 *     prerendered and later invalidated on demand. It uses the `max` cache-life
 *     profile because settings change rarely.
 *   - {@link loadSettings} is the uncached read primitive `getSettings` delegates
 *     to. It implements get-or-return-default semantics: when no row exists yet
 *     it returns the schema defaults *without* writing (a cached read must not
 *     have side effects), so consumers always get a complete settings object.
 *   - The per-form `update*` functions persist their slice of the singleton via
 *     {@link writeSettings} (an idempotent upsert that creates the row on first
 *     write — get-or-create) and then call `revalidateTag` for every settings
 *     tag (`settingsRevalidationTags()`), refreshing the public pages that
 *     reflect them with stale-while-revalidate semantics.
 *
 * `writeSettings`/`loadSettings` are exported (without the cache wrappers) so the
 * persistence logic can be exercised directly against the in-memory MongoDB
 * harness; the `use cache`/`revalidateTag` machinery only runs inside the Next.js
 * request/render runtime.
 */
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';

import { connectToDatabase } from '@/lib/db';
import { CACHE_TAGS, settingsRevalidationTags } from '@/lib/cache-tags';
import { Settings, type ISettings, type ISocialLinks } from '@/lib/models';
import type {
  AffiliateSettingsInput,
  SeoSettingsInput,
  SiteSettingsInput,
  SocialLinksInput,
} from '@/lib/validation';

/**
 * Plain, serializable representation of the settings singleton returned to
 * callers (Server Components, route handlers). Mongoose documents are class
 * instances and therefore not valid `use cache` return values, so every read
 * is mapped to this DTO. `id`/timestamps are absent (empty string / `null`)
 * when no row has been persisted yet and defaults are being returned.
 */
export interface SettingsDTO {
  id: string;
  siteName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  contactEmail: string;
  adminEmailNotifications: boolean;
  defaultMetaTitleSuffix: string;
  defaultMetaDescription: string;
  ga4MeasurementId: string;
  searchConsoleCode: string;
  social: ISocialLinks;
  defaultAffiliateDisclosure: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Field defaults for the settings singleton, kept in lock-step with the schema
 * defaults declared on the Mongoose model. Returned (as a DTO) when no row has
 * been created yet so reads never observe a partial/empty object.
 */
const DEFAULT_SETTINGS = {
  siteName: 'DealSpark',
  tagline: '',
  logoUrl: null,
  faviconUrl: null,
  contactEmail: '',
  adminEmailNotifications: true,
  defaultMetaTitleSuffix: ' | DealSpark',
  defaultMetaDescription: '',
  ga4MeasurementId: '',
  searchConsoleCode: '',
  defaultAffiliateDisclosure: '',
} as const;

/** Empty (all links blank) social block used for the default DTO. */
function emptySocial(): ISocialLinks {
  return { facebook: '', instagram: '', twitter: '', youtube: '' };
}

/**
 * The subset of settings fields a single form may write. `writeSettings`
 * applies only the provided keys, leaving the rest of the singleton untouched.
 */
type SettingsPatch = Partial<
  Pick<
    ISettings,
    | 'siteName'
    | 'tagline'
    | 'logoUrl'
    | 'faviconUrl'
    | 'contactEmail'
    | 'adminEmailNotifications'
    | 'defaultMetaTitleSuffix'
    | 'defaultMetaDescription'
    | 'ga4MeasurementId'
    | 'searchConsoleCode'
    | 'defaultAffiliateDisclosure'
  >
> & { social?: ISocialLinks };

/** Map a settings document (or `null`) to the serializable DTO + defaults. */
function toSettingsDTO(doc: ISettings | null): SettingsDTO {
  if (!doc) {
    return {
      id: '',
      ...DEFAULT_SETTINGS,
      social: emptySocial(),
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    id: String(doc._id),
    siteName: doc.siteName,
    tagline: doc.tagline,
    logoUrl: doc.logoUrl,
    faviconUrl: doc.faviconUrl,
    contactEmail: doc.contactEmail,
    adminEmailNotifications: doc.adminEmailNotifications,
    defaultMetaTitleSuffix: doc.defaultMetaTitleSuffix,
    defaultMetaDescription: doc.defaultMetaDescription,
    ga4MeasurementId: doc.ga4MeasurementId,
    searchConsoleCode: doc.searchConsoleCode,
    social: {
      facebook: doc.social.facebook,
      instagram: doc.social.instagram,
      twitter: doc.social.twitter,
      youtube: doc.social.youtube,
    },
    defaultAffiliateDisclosure: doc.defaultAffiliateDisclosure,
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

/**
 * Read the settings singleton without caching. Returns the persisted row mapped
 * to a {@link SettingsDTO}, or the schema defaults when no row exists yet
 * (get-or-return-default — no write occurs, so this is safe inside a cached
 * read boundary).
 */
export async function loadSettings(): Promise<SettingsDTO> {
  await connectToDatabase();
  const doc = await Settings.findOne({ singletonKey: 'global' })
    .lean<ISettings | null>()
    .exec();
  return toSettingsDTO(doc);
}

/**
 * Public, cached settings loader. Wraps {@link loadSettings} in a `use cache`
 * boundary tagged `CACHE_TAGS.settings` so it participates in the static shell
 * and is invalidated by the `update*` mutations below.
 */
export async function getSettings(): Promise<SettingsDTO> {
  'use cache';
  cacheTag(CACHE_TAGS.settings);
  // Settings change rarely; rely on on-demand `revalidateTag` for freshness.
  cacheLife('max');
  return loadSettings();
}

/**
 * Persist a slice of the settings singleton, creating the row on first write
 * (get-or-create via upsert). Schema defaults fill any field not present in the
 * patch on insert. Returns the updated document as a {@link SettingsDTO}.
 *
 * This is the uncached persistence primitive; callers that run inside the
 * Next.js runtime should use the `update*` wrappers so the cache is revalidated.
 */
export async function writeSettings(patch: SettingsPatch): Promise<SettingsDTO> {
  await connectToDatabase();
  const doc = await Settings.findOneAndUpdate(
    { singletonKey: 'global' },
    { $set: patch, $setOnInsert: { singletonKey: 'global' } },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  )
    .lean<ISettings | null>()
    .exec();
  return toSettingsDTO(doc);
}

/** Invalidate every cache tag that depends on the settings singleton. */
function revalidateSettings(): void {
  for (const tag of settingsRevalidationTags()) {
    revalidateTag(tag, 'max');
  }
}

/**
 * Persist the Site Settings form slice (Req 20.1): site name, tagline, logo,
 * favicon, contact email, and the admin-notifications flag.
 */
export async function updateSiteSettings(
  input: SiteSettingsInput,
): Promise<SettingsDTO> {
  const dto = await writeSettings({
    siteName: input.siteName,
    tagline: input.tagline,
    logoUrl: input.logoUrl ?? null,
    faviconUrl: input.faviconUrl ?? null,
    contactEmail: input.contactEmail,
    adminEmailNotifications: input.adminEmailNotifications,
  });
  revalidateSettings();
  return dto;
}

/**
 * Persist the SEO Settings form slice (Req 20.3): default meta-title suffix,
 * default meta description, GA4 measurement id, and search-console code.
 */
export async function updateSeoSettings(
  input: SeoSettingsInput,
): Promise<SettingsDTO> {
  const dto = await writeSettings({
    defaultMetaTitleSuffix: input.defaultMetaTitleSuffix,
    defaultMetaDescription: input.defaultMetaDescription,
    ga4MeasurementId: input.ga4MeasurementId,
    searchConsoleCode: input.searchConsoleCode,
  });
  revalidateSettings();
  return dto;
}

/**
 * Persist the Social Links form slice (Req 20.4): Facebook, Instagram,
 * Twitter/X, and YouTube URLs (empty string when a link is left blank).
 */
export async function updateSocialLinks(
  input: SocialLinksInput,
): Promise<SettingsDTO> {
  const dto = await writeSettings({
    social: {
      facebook: input.facebook ?? '',
      instagram: input.instagram ?? '',
      twitter: input.twitter ?? '',
      youtube: input.youtube ?? '',
    },
  });
  revalidateSettings();
  return dto;
}

/**
 * Persist the Affiliate Settings form slice (Req 20.7): the default affiliate
 * disclosure text.
 */
export async function updateAffiliateSettings(
  input: AffiliateSettingsInput,
): Promise<SettingsDTO> {
  const dto = await writeSettings({
    defaultAffiliateDisclosure: input.defaultAffiliateDisclosure,
  });
  revalidateSettings();
  return dto;
}
