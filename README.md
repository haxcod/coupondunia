# Coupon Saga

A mobile-first, SEO-optimized affiliate **coupons & deals** site for the Indian
market, with a public storefront and a password-protected admin panel — built on
**Next.js 16 (App Router, Cache Components/PPR)**, **React 19**, **MongoDB /
Mongoose**, and **Tailwind CSS v4**.

- **Public site:** homepage, categories, category pages, product & deal detail
  pages, a filterable deals listing, a store directory, search, blogs, and a
  contact form. Server-rendered for Core Web Vitals and indexability.
- **Admin panel** (`/admin`): manage products, deals, categories, stores,
  banners, and settings, plus a click-analytics dashboard.
- **Affiliate model:** every "Get Code / Shop Now" logs an anonymous click,
  atomically increments a counter, and returns the affiliate URL — which is
  never embedded in the HTML.

## Prerequisites

- **Node.js 20+**
- **MongoDB 6+ as a replica set.** The click service uses transactions, so a
  standalone `mongod` will not work. Use **MongoDB Atlas** (a replica set by
  default) or run `mongod --replSet rs0` and initiate it. For quick local dev
  the in-memory replica set can also be used (see below).

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local     # then edit .env.local

# 3. Seed the database (creates the admin user + demo catalog)
npm run seed

# 4. Run the dev server
npm run dev
```

Open http://localhost:3000. Sign in to the admin at http://localhost:3000/admin/login
with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env.local`.

### Local dev without a MongoDB server

If you don't have a MongoDB instance, you can point `MONGODB_URI` at a throwaway
in-memory replica set (the project already depends on `mongodb-memory-server`
for tests). Start one, copy the URI it prints into `.env.local`, then
`npm run seed`. The data is discarded when the process stops.

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Summary:

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB replica-set connection string |
| `SESSION_SECRET` (or `AUTH_SECRET`) | yes | Signs the admin session cookie |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | yes (seed) | Initial admin account |
| `NEXT_PUBLIC_SITE_URL` | yes (prod) | Canonical / OG / sitemap base URL |
| `SMTP_*` + `CONTACT_NOTIFICATION_EMAIL` | optional | Contact-form notification email |
| `S3_*` | optional | Admin image uploads (AWS S3 or any S3-compatible provider) |

**Email:** without SMTP configured the contact form still saves messages (visible
in the admin); it just skips the notification email.

**Images:** the admin image upload (`/api/admin/upload`) writes to S3-compatible
storage; set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (plus
`S3_PUBLIC_BASE_URL` for a CDN). `next/image` already permits any `https` host,
so existing image URLs render regardless. The seed uses placeholder imagery.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run seed` | Seed the admin user + demo catalog (idempotent) |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |

## Deployment

Deploys cleanly to any Node host (Vercel recommended). Set every required
variable above (plus any optional ones you use) in the platform's environment
settings, point `MONGODB_URI` at a managed replica set (Atlas), and run
`npm run seed` once against the production database to create the admin account.

## Testing

```bash
npm test
```

The suite uses an in-memory MongoDB replica set (`mongodb-memory-server`); no
external services are required.
