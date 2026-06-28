/**
 * Database seed script (Task 16.1 + demo/testing content).
 *
 * Idempotently bootstraps everything the app needs to run and adds a rich set
 * of dummy catalog data for local testing:
 *   1. The singleton `Settings` document (`singletonKey: 'global'`) — created
 *      with sensible demo values if it does not already exist (Req 20.x).
 *   2. An initial `AdminUser` from the `ADMIN_EMAIL` / `ADMIN_PASSWORD`
 *      environment variables, with the password stored as a bcrypt hash via
 *      `hashPassword` (Req 13.6). Re-running never duplicates the account.
 *   3. Demo catalog content: Stores, Categories (with subcategories), Products,
 *      Deals, and Banners. The demo collections are wiped and re-inserted on
 *      every run so the dataset stays deterministic and re-runnable. Settings
 *      and admin users are NOT wiped.
 *
 * Run with:  npm run seed
 *
 * Connection comes from `MONGODB_URI` (loaded from `.env.local` / `.env` when
 * present). The script is safe to run repeatedly.
 */
import { existsSync } from 'node:fs';

import { connectToDatabase, disconnectFromDatabase } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import {
  AdminUser,
  Banner,
  Category,
  Deal,
  Product,
  Settings,
  Store,
} from '@/lib/models';
import { generateSlug, storeScopedSlug } from '@/lib/slug';
import { computeDiscountPercent } from '@/lib/pricing';
import type { Types } from 'mongoose';

/** Shared create-shape for seeded categories (keeps insertMany inference consistent). */
type CategorySeed = {
  name: string;
  slug: string;
  parentId: Types.ObjectId | null;
  iconUrl: string;
  description: string;
  showOnHomepage: boolean;
  homepageSectionTitle: string | null;
  displayOrder: number;
  status: 'active';
  metaTitle: string | null;
  metaDescription: string | null;
};

/** Load env files a standalone (non-Next) process would otherwise miss. */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      try {
        // Node 20.12+/22+ built-in. Loaded values do not overwrite existing ones.
        process.loadEnvFile(file);
      } catch {
        // Older Node without loadEnvFile, or unreadable file — env may already
        // be provided by the shell, so continue.
      }
    }
  }
}

/** Convert a rupee amount to integer paise (money convention, see models/types). */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Deterministic 1:1 placeholder image for the given seed token. */
function img(seed: string, size = 600): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;
}

/** Date `days` from now (negative for the past). */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Create the singleton Settings row with demo defaults if it is missing. */
async function seedSettings(): Promise<void> {
  const existing = await Settings.findOne({ singletonKey: 'global' }).exec();
  if (existing) {
    console.log('• Settings singleton already present — skipping.');
    return;
  }
  await Settings.create({
    singletonKey: 'global',
    siteName: 'DealSpark',
    tagline: 'Smart deals & coupons, every day.',
    contactEmail: process.env.CONTACT_NOTIFICATION_EMAIL ?? 'admin@dealspark.local',
    defaultMetaDescription:
      'Discover the best affiliate deals and coupon codes across top Indian stores.',
    defaultAffiliateDisclosure:
      'DealSpark may earn a commission when you buy through links on this site.',
    social: {
      facebook: 'https://facebook.com/dealspark',
      instagram: 'https://instagram.com/dealspark',
      twitter: '',
      youtube: '',
    },
  });
  console.log('• Created Settings singleton with demo defaults.');
}

/** Create the initial admin user from env, without duplicating an existing one. */
async function seedAdminUser(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      '• ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user seed.',
    );
    return;
  }

  const existing = await AdminUser.findOne({ email }).exec();
  if (existing) {
    console.log(`• Admin user "${email}" already exists — skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await AdminUser.create({ email, passwordHash });
  console.log(`• Created admin user "${email}".`);
}

/** Wipe demo catalog collections so the seed is deterministic and re-runnable. */
async function clearDemoContent(): Promise<void> {
  // Delete dependents (products/deals/banners) before categories/stores.
  await Promise.all([
    Product.deleteMany({}),
    Deal.deleteMany({}),
    Banner.deleteMany({}),
  ]);
  // deleteMany on Category bypasses the single-doc referential guard, which is
  // intended here: we have already removed all dependent products above.
  await Category.deleteMany({});
  await Store.deleteMany({});
  console.log('• Cleared existing demo catalog content.');
}

/** Insert stores, categories, products, deals, and banners. */
async function seedDemoContent(): Promise<void> {
  await clearDemoContent();

  // ---- Stores ------------------------------------------------------------
  const storeDefs = [
    { name: 'Flipkart' },
    { name: 'Amazon' },
    { name: 'Myntra' },
    { name: 'Ajio' },
    { name: 'Croma' },
    { name: 'Nykaa' },
  ];
  const stores = await Store.insertMany(
    storeDefs.map((s) => ({
      name: s.name,
      slug: generateSlug(s.name),
      logoUrl: img(`logo-${s.name}`, 120),
    })),
  );
  const storeBy = new Map(stores.map((s) => [s.name, s]));
  console.log(`• Inserted ${stores.length} stores.`);

  // ---- Categories (top-level) -------------------------------------------
  const topCategoryDefs = [
    { name: 'Electronics', showOnHomepage: true, order: 1 },
    { name: 'Fashion', showOnHomepage: true, order: 2 },
    { name: 'Mobiles', showOnHomepage: true, order: 3 },
    { name: 'Home & Kitchen', showOnHomepage: true, order: 4 },
    { name: 'Beauty', showOnHomepage: false, order: 5 },
  ];
  const topCategorySeeds: CategorySeed[] = topCategoryDefs.map((c) => ({
    name: c.name,
    slug: generateSlug(c.name),
    parentId: null,
    iconUrl: img(`cat-${c.name}`, 200),
    description: `Browse the best ${c.name.toLowerCase()} deals and coupons.`,
    showOnHomepage: c.showOnHomepage,
    homepageSectionTitle: `Top ${c.name} Deals`,
    displayOrder: c.order,
    status: 'active',
    metaTitle: `${c.name} Deals & Coupons | DealSpark`,
    metaDescription: `Save big on ${c.name.toLowerCase()} with verified coupons and offers.`,
  }));
  const topCategories = await Category.insertMany(topCategorySeeds);
  const catBy = new Map(topCategories.map((c) => [c.name, c]));
  console.log(`• Inserted ${topCategories.length} top-level categories.`);

  // ---- Subcategories -----------------------------------------------------
  const subCategoryDefs = [
    { name: 'Laptops', parent: 'Electronics', order: 1 },
    { name: 'Headphones', parent: 'Electronics', order: 2 },
    { name: 'Men Clothing', parent: 'Fashion', order: 1 },
    { name: 'Women Clothing', parent: 'Fashion', order: 2 },
    { name: 'Smartphones', parent: 'Mobiles', order: 1 },
  ];
  const subCategorySeeds: CategorySeed[] = subCategoryDefs.map((c) => ({
    name: c.name,
    slug: generateSlug(`${c.parent}-${c.name}`),
    parentId: catBy.get(c.parent)!._id,
    iconUrl: img(`subcat-${c.name}`, 200),
    description: `${c.name} — handpicked offers.`,
    showOnHomepage: false,
    homepageSectionTitle: null,
    displayOrder: c.order,
    status: 'active',
    metaTitle: null,
    metaDescription: null,
  }));
  const subCategories = await Category.insertMany(subCategorySeeds);
  for (const sc of subCategories) catBy.set(sc.name, sc);
  console.log(`• Inserted ${subCategories.length} subcategories.`);

  // ---- Products ----------------------------------------------------------
  type ProductDef = {
    title: string;
    store: string;
    category: string;
    price: number; // rupees
    original?: number; // rupees
    featured?: boolean;
    expiresInDays?: number | null;
  };
  const productDefs: ProductDef[] = [
    { title: 'HP Pavilion 15 Core i5 Laptop', store: 'Flipkart', category: 'Laptops', price: 54990, original: 72990, featured: true, expiresInDays: 5 },
    { title: 'Dell Inspiron 14 Ryzen 5 Laptop', store: 'Amazon', category: 'Laptops', price: 48990, original: 61990, featured: true },
    { title: 'Sony WH-1000XM5 Noise Cancelling Headphones', store: 'Croma', category: 'Headphones', price: 26990, original: 34990, featured: true, expiresInDays: 3 },
    { title: 'boAt Rockerz 450 Bluetooth Headphones', store: 'Flipkart', category: 'Headphones', price: 1499, original: 3990 },
    { title: 'Apple iPhone 15 (128GB)', store: 'Amazon', category: 'Smartphones', price: 65999, original: 79900, featured: true, expiresInDays: 10 },
    { title: 'Samsung Galaxy S24 (256GB)', store: 'Flipkart', category: 'Smartphones', price: 69999, original: 84999, featured: true },
    { title: 'Redmi Note 13 Pro 5G', store: 'Amazon', category: 'Smartphones', price: 23999, original: 27999 },
    { title: 'Levis Mens Slim Fit Jeans', store: 'Myntra', category: 'Men Clothing', price: 1799, original: 3599 },
    { title: 'Roadster Mens Casual Shirt', store: 'Ajio', category: 'Men Clothing', price: 799, original: 1999 },
    { title: 'Biba Womens Anarkali Kurta', store: 'Myntra', category: 'Women Clothing', price: 1299, original: 2899, featured: true },
    { title: 'Prestige Induction Cooktop 2000W', store: 'Flipkart', category: 'Home & Kitchen', price: 2199, original: 3495 },
    { title: 'Milton Thermosteel Flask 1L', store: 'Amazon', category: 'Home & Kitchen', price: 849, original: 1295 },
    { title: 'Maybelline Fit Me Foundation', store: 'Nykaa', category: 'Beauty', price: 459, original: 599 },
    { title: 'Lakme Absolute Matte Lipstick', store: 'Nykaa', category: 'Beauty', price: 525, original: 700 },
  ];

  const productDocs = productDefs.map((p) => {
    const store = storeBy.get(p.store)!;
    const category = catBy.get(p.category)!;
    const discountPercent =
      p.original !== undefined ? computeDiscountPercent(p.price, p.original) : null;
    return {
      title: p.title,
      slug: storeScopedSlug(store.name, p.title),
      storeId: store._id,
      categoryId: category._id,
      currentPrice: toPaise(p.price),
      originalPrice: p.original !== undefined ? toPaise(p.original) : null,
      discountPercent,
      primaryImageUrl: img(`prod-${p.title}`),
      additionalImages: [img(`prod-${p.title}-a`), img(`prod-${p.title}-b`)],
      description: `<p>${p.title} — a great pick at an unbeatable price. ` +
        `This is demo description content used for local testing. It is long enough ` +
        `to exercise the show-more/show-less toggle that appears for descriptions ` +
        `longer than 300 characters, so we keep writing a little more filler text here ` +
        `to comfortably exceed that threshold for at least a few of the seeded products.</p>`,
      keyFeatures: ['1-year warranty', 'Free delivery', 'Top rated', 'Best seller'],
      affiliateUrl: `https://www.${generateSlug(store.name)}.com/p/${generateSlug(p.title)}?aff=dealspark`,
      buttonLabel: 'VIEW DEAL',
      offerExpiresAt:
        p.expiresInDays !== undefined && p.expiresInDays !== null
          ? daysFromNow(p.expiresInDays)
          : null,
      featured: Boolean(p.featured),
      status: 'active' as const,
      viewCount: Math.floor(Math.random() * 5000),
      clickCount: Math.floor(Math.random() * 1500),
      lastVerifiedAt: daysFromNow(-2),
    };
  });
  const products = await Product.insertMany(productDocs);
  console.log(`• Inserted ${products.length} products.`);

  // ---- Deals -------------------------------------------------------------
  const howTo = [
    'Click the "Get Coupon Code" button to reveal the code.',
    'Copy the code and head to the store.',
    'Add eligible items to your cart.',
    'Paste the code at checkout to apply the discount.',
  ];
  type DealDef = {
    headline: string;
    store: string;
    category: string;
    dealType: 'coupon_code' | 'direct_deal' | 'bank_card' | 'cashback';
    couponCode?: string;
    discountValue?: string;
    featured?: boolean;
    validUntilDays?: number | null;
  };
  const dealDefs: DealDef[] = [
    { headline: 'Flat 10% off on Electronics', store: 'Flipkart', category: 'Electronics', dealType: 'coupon_code', couponCode: 'ELEC10', discountValue: '10% OFF', featured: true, validUntilDays: 7 },
    { headline: 'Extra 15% off on Fashion', store: 'Myntra', category: 'Fashion', dealType: 'coupon_code', couponCode: 'FASHION15', discountValue: '15% OFF', featured: true, validUntilDays: 14 },
    { headline: 'Up to 40% off on Smartphones', store: 'Amazon', category: 'Mobiles', dealType: 'direct_deal', discountValue: 'Up to 40%', featured: true, validUntilDays: 5 },
    { headline: 'HDFC Bank 10% Instant Discount', store: 'Amazon', category: 'Electronics', dealType: 'bank_card', discountValue: '10% Instant', featured: true, validUntilDays: 30 },
    { headline: '5% Cashback on Home Appliances', store: 'Croma', category: 'Home & Kitchen', dealType: 'cashback', discountValue: '5% Cashback', validUntilDays: 20 },
    { headline: 'Beauty Bonanza: Code GLOW20', store: 'Nykaa', category: 'Beauty', dealType: 'coupon_code', couponCode: 'GLOW20', discountValue: '20% OFF', featured: true, validUntilDays: 10 },
    { headline: 'Ajio Steal Deal: Flat ₹500 off', store: 'Ajio', category: 'Fashion', dealType: 'coupon_code', couponCode: 'AJIO500', discountValue: '₹500 OFF', validUntilDays: 12 },
    { headline: 'Weekend Laptop Fest', store: 'Flipkart', category: 'Electronics', dealType: 'direct_deal', discountValue: 'Up to 30%', featured: true, validUntilDays: null },
  ];

  const dealDocs = dealDefs.map((d) => {
    const store = storeBy.get(d.store)!;
    const category = catBy.get(d.category)!;
    return {
      headline: d.headline,
      slug: storeScopedSlug(store.name, d.headline),
      storeId: store._id,
      categoryId: category._id,
      dealType: d.dealType,
      couponCode: d.couponCode ?? null,
      destinationUrl: `https://www.${generateSlug(store.name)}.com/offers/${generateSlug(d.headline)}?aff=dealspark`,
      discountValue: d.discountValue ?? null,
      buttonLabel: d.dealType === 'coupon_code' ? 'GET COUPON CODE' : 'GET DEAL',
      terms: 'Offer valid on select products only. Cannot be combined with other offers.',
      howToUseSteps: howTo,
      validFrom: daysFromNow(-3),
      validUntil:
        d.validUntilDays !== undefined && d.validUntilDays !== null
          ? daysFromNow(d.validUntilDays)
          : null,
      minOrderValue: toPaise(999),
      maxDiscountCap: toPaise(2000),
      applicableFor: 'All users',
      featured: Boolean(d.featured),
      status: 'active' as const,
      clickCount: Math.floor(Math.random() * 1200),
    };
  });
  const deals = await Deal.insertMany(dealDocs);
  console.log(`• Inserted ${deals.length} deals.`);

  // ---- Banners -----------------------------------------------------------
  const bannerDefs = [
    { internalName: 'Big Billion Days', headline: 'Big Billion Days Are Here', ctaText: 'Shop Now', link: 'https://www.flipkart.com', order: 1 },
    { internalName: 'Great Indian Sale', headline: 'Great Indian Festival', ctaText: 'Explore', link: 'https://www.amazon.in', order: 2 },
    { internalName: 'End of Reason Sale', headline: 'Myntra EORS Live', ctaText: 'Grab Deals', link: 'https://www.myntra.com', order: 3 },
    { internalName: 'Beauty Sale', headline: 'Nykaa Pink Friday Sale', ctaText: 'Shop Beauty', link: 'https://www.nykaa.com', order: 4 },
  ];
  const banners = await Banner.insertMany(
    bannerDefs.map((b) => ({
      internalName: b.internalName,
      imageUrl: img(`banner-${b.internalName}`, 1200),
      mobileImageUrl: img(`banner-mobile-${b.internalName}`, 800),
      headline: b.headline,
      ctaText: b.ctaText,
      linkUrl: b.link,
      linkTarget: 'new_tab' as const,
      displayOrder: b.order,
      status: 'active' as const,
    })),
  );
  console.log(`• Inserted ${banners.length} banners.`);
}

async function main(): Promise<void> {
  loadEnvFiles();

  if (!process.env.MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Provide it via .env.local, .env, or the environment before seeding.',
    );
  }

  await connectToDatabase();
  console.log('Connected to MongoDB. Seeding…');

  await seedSettings();
  await seedAdminUser();
  await seedDemoContent();

  console.log('Seed complete.');
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
