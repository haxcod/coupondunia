/**
 * Settings service tests (Req 20.1, 20.3, 20.4, 20.7).
 *
 * Exercises the real persistence path against the in-memory replica-set MongoDB
 * harness. The Next.js cache primitives (`cacheTag`/`cacheLife`/`revalidateTag`)
 * only have meaning inside the Next runtime, so they are mocked to no-op spies
 * here — letting us assert that each mutation revalidates the settings tags
 * while the database behavior (get-or-create singleton, get-or-return-default)
 * is verified for real.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const cacheTag = vi.fn();
const cacheLife = vi.fn();
const revalidateTag = vi.fn();

vi.mock('next/cache', () => ({
  cacheTag: (...args: unknown[]) => cacheTag(...args),
  cacheLife: (...args: unknown[]) => cacheLife(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}));

import { setupMemoryMongo } from '@/test/harness/mongo-memory';
import { CACHE_TAGS, settingsRevalidationTags } from '@/lib/cache-tags';
import { Settings } from '@/lib/models';
import {
  getSettings,
  loadSettings,
  updateAffiliateSettings,
  updateSeoSettings,
  updateSiteSettings,
  updateSocialLinks,
  writeSettings,
} from '@/lib/settings';

setupMemoryMongo();

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  revalidateTag.mockClear();
});

describe('loadSettings (get-or-return-default)', () => {
  test('returns schema defaults without writing when no row exists', async () => {
    const settings = await loadSettings();

    expect(settings.id).toBe('');
    expect(settings.siteName).toBe('DealSpark');
    expect(settings.defaultMetaTitleSuffix).toBe(' | DealSpark');
    expect(settings.adminEmailNotifications).toBe(true);
    expect(settings.social).toEqual({
      facebook: '',
      instagram: '',
      twitter: '',
      youtube: '',
    });
    expect(settings.createdAt).toBeNull();

    // Reading must not persist a row.
    await expect(Settings.countDocuments()).resolves.toBe(0);
  });
});

describe('writeSettings (get-or-create singleton)', () => {
  test('creates the singleton row on first write with schema defaults filled in', async () => {
    const dto = await writeSettings({ siteName: 'CouponDuniya' });

    expect(dto.id).not.toBe('');
    expect(dto.siteName).toBe('CouponDuniya');
    // Untouched fields fall back to schema defaults on insert.
    expect(dto.defaultMetaTitleSuffix).toBe(' | DealSpark');
    expect(dto.adminEmailNotifications).toBe(true);

    await expect(Settings.countDocuments()).resolves.toBe(1);
  });

  test('never creates a second row across multiple writes', async () => {
    await writeSettings({ siteName: 'First' });
    await writeSettings({ tagline: 'Second tagline' });
    await writeSettings({ contactEmail: 'a@b.com' });

    await expect(
      Settings.countDocuments({ singletonKey: 'global' }),
    ).resolves.toBe(1);

    const settings = await loadSettings();
    expect(settings.siteName).toBe('First');
    expect(settings.tagline).toBe('Second tagline');
    expect(settings.contactEmail).toBe('a@b.com');
  });
});

describe('updateSiteSettings (Req 20.1)', () => {
  test('persists site fields and revalidates the settings tags', async () => {
    const dto = await updateSiteSettings({
      siteName: 'DealSpark IN',
      tagline: 'Best coupons',
      logoUrl: 'https://cdn.example.com/logo.png',
      faviconUrl: null,
      contactEmail: 'hello@dealspark.in',
      adminEmailNotifications: false,
    });

    expect(dto.siteName).toBe('DealSpark IN');
    expect(dto.tagline).toBe('Best coupons');
    expect(dto.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(dto.faviconUrl).toBeNull();
    expect(dto.contactEmail).toBe('hello@dealspark.in');
    expect(dto.adminEmailNotifications).toBe(false);

    const persisted = await loadSettings();
    expect(persisted.siteName).toBe('DealSpark IN');

    const revalidated = revalidateTag.mock.calls.map((c) => c[0]);
    for (const tag of settingsRevalidationTags()) {
      expect(revalidated).toContain(tag);
    }
    expect(revalidated).toContain(CACHE_TAGS.settings);
  });
});

describe('updateSeoSettings (Req 20.3)', () => {
  test('persists only the SEO slice, leaving other fields untouched', async () => {
    await updateSiteSettings({
      siteName: 'Keep Me',
      tagline: '',
      logoUrl: null,
      faviconUrl: null,
      contactEmail: 'keep@me.com',
      adminEmailNotifications: true,
    });

    const dto = await updateSeoSettings({
      defaultMetaTitleSuffix: ' | Deals',
      defaultMetaDescription: 'Save big every day.',
      ga4MeasurementId: 'G-ABC123',
      searchConsoleCode: 'verify-token',
    });

    expect(dto.defaultMetaTitleSuffix).toBe(' | Deals');
    expect(dto.defaultMetaDescription).toBe('Save big every day.');
    expect(dto.ga4MeasurementId).toBe('G-ABC123');
    expect(dto.searchConsoleCode).toBe('verify-token');
    // Site slice preserved.
    expect(dto.siteName).toBe('Keep Me');
    expect(dto.contactEmail).toBe('keep@me.com');
  });
});

describe('updateSocialLinks (Req 20.4)', () => {
  test('persists provided links and stores blanks for omitted ones', async () => {
    const dto = await updateSocialLinks({
      facebook: 'https://facebook.com/dealspark',
      youtube: 'https://youtube.com/@dealspark',
      // instagram / twitter omitted
    });

    expect(dto.social).toEqual({
      facebook: 'https://facebook.com/dealspark',
      instagram: '',
      twitter: '',
      youtube: 'https://youtube.com/@dealspark',
    });
  });
});

describe('updateAffiliateSettings (Req 20.7)', () => {
  test('persists the affiliate disclosure text', async () => {
    const dto = await updateAffiliateSettings({
      defaultAffiliateDisclosure:
        'We may earn a commission from qualifying purchases.',
    });

    expect(dto.defaultAffiliateDisclosure).toBe(
      'We may earn a commission from qualifying purchases.',
    );
  });
});

describe('getSettings (cached loader)', () => {
  test('tags the settings cache and returns the persisted singleton', async () => {
    await writeSettings({ siteName: 'Cached Site' });

    const settings = await getSettings();

    expect(settings.siteName).toBe('Cached Site');
    expect(cacheTag).toHaveBeenCalledWith(CACHE_TAGS.settings);
    expect(cacheLife).toHaveBeenCalledWith('max');
  });
});
