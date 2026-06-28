# Implementation Plan: DealSpark

## Overview

This plan builds DealSpark as a single Next.js 16 (App Router) + TypeScript (strict) application backed by MongoDB via Mongoose. Implementation proceeds bottom-up: project/infra setup, pure domain logic (slug, pricing, validation), then services (auth, click, search, catalog, settings), then public API route handlers, public UI components and pages, SEO/metadata routes, the client-rendered admin panel and its guarded APIs, and finally privacy/TTL + HTTPS wiring and end-to-end integration.

Property-based tests use `fast-check` + `vitest` (min. 100 generated cases each) and are tagged `// Feature: dealspark, Property {n}: ...`. Each property sub-task references a property from the design and the requirements it validates. Test sub-tasks are marked optional with `*`.

> Note: This project runs a non-standard Next.js 16. Before writing framework code, consult `node_modules/next/dist/docs/` (Cache Components / `use cache` / `cacheLife` / `cacheTag`, `proxy.ts` instead of middleware, async `params`/`searchParams`/`cookies()`/`headers()`, `sitemap.ts`/`robots.ts` metadata routes, `GET` route handler prerender model).

## Tasks

- [x] 1. Set up project infrastructure and data layer
  - [x] 1.1 Install and configure project dependencies and tooling
    - Add `mongoose`, `zod`, `jose`, `bcrypt`, `nodemailer`, an S3-compatible client, a sanitizer, and a TipTap editor for admin rich text
    - Add `vitest` and `fast-check` as dev dependencies and create the vitest config + test setup
    - Enable `cacheComponents: true` in `next.config.ts` and confirm TypeScript strict mode in `tsconfig.json`
    - _Requirements: 24.1, 25.8, 26.3_

  - [x] 1.2 Define the Mongoose schemas, models, and indexes
    - Define Mongoose schemas/models for `Category`, `Store`, `Product`, `Deal`, `Banner`, `ClickEvent`, `ContactMessage`, `SearchLog`, `AdminUser`, `LoginAttempt`, and a singleton `Settings` per the design data models
    - Add case-sensitive unique indexes on slugs via Mongoose, composite sort indexes, a MongoDB TTL index on `ClickEvent(createdAt)`, and MongoDB text indexes (or regex-based search) on searchable text fields; store money as integer paise / `Decimal128`
    - Add application-level referential guards that block category deletion while child categories or products exist (MongoDB has no FK constraints)
    - _Requirements: 23.3, 23.5, 15.10, 5.5, 27.1_

  - [x] 1.3 Implement the database client and transactional test harness
    - Create `lib/db.ts` Mongoose connection singleton
    - Create an in-memory MongoDB transactional model (e.g., `mongodb-memory-server`) used by property tests, plus a real-MongoDB integration test bootstrap
    - _Requirements: 9.2, 9.3_

- [x] 2. Implement core domain utilities (pure logic)
  - [x] 2.1 Implement slug generation and uniqueness (`lib/slug.ts`)
    - `generateSlug` (sanitize to `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–200 chars, non-empty fallback)
    - `ensureUniqueSlug` (smallest free `-n` suffix starting at 2, stays ≤200 chars)
    - `storeScopedSlug` (includes sanitized store-name tokens)
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 24.12, 15.5, 15.6_

  - [x]* 2.2 Write property test for slug shape, fallback, and store tokens
    - **Property 1: Slug shape, fallback, and store tokens**
    - **Validates: Requirements 23.1, 23.2, 24.12, 15.5**

  - [x]* 2.3 Write property test for slug uniqueness via smallest free suffix
    - **Property 2: Slug uniqueness via smallest free suffix**
    - **Validates: Requirements 23.3, 23.4, 15.6**

  - [x] 2.4 Implement discount/pricing computation (`lib/pricing.ts`)
    - `computeDiscountPercent(current, original?)` returns `round((original−current)/original×100)` in 1..100 when `original > current`, else null; reject `original ≤ current`
    - _Requirements: 16.6, 6.4, 16.7_

  - [x]* 2.5 Write property test for discount computation and rejection
    - **Property 4: Discount percentage computation and rejection**
    - **Validates: Requirements 16.6, 6.4, 16.7**

  - [x] 2.6 Implement cache-tag constants and helpers (`lib/cache-tags.ts`)
    - Define tag builders for `products`, `product:{slug}`, `deals`, `deal:{slug}`, `categories`, `category:{slug}`, `banners`, `homepage`, `settings`
    - _Requirements: 25.8_

- [x] 3. Implement shared validation schemas
  - [x] 3.1 Implement Zod schemas shared client/server (`lib/validation/`)
    - Schemas for contact, category, product, deal, banner, settings (site/SEO/social/affiliate/password), analytics date-range, search params, and click payload
    - Enforce required-field presence, min/max lengths, numeric ranges (price 0.01–999,999,999.99, display order 0–9999, password 8–128), email pattern, http(s) URL schemes, conditional rules (coupon-code type requires code), and date ordering (`validFrom ≤ validUntil`, range start ≤ end, span ≤ 366 days); produce per-field error envelope `{ error: { field?, message } }`
    - _Requirements: 12.2, 12.3, 12.5, 15.3, 15.4, 15.8, 16.4, 16.5, 17.3, 17.4, 17.7, 17.9, 18.4, 20.1, 20.2, 20.3, 20.6, 20.10, 19.1, 19.2, 19.3, 21.7_

  - [x]* 3.2 Write property test for validation predicates
    - **Property 16: Validation predicates accept exactly the conforming inputs**
    - **Validates: Requirements 12.3, 12.5, 15.3, 15.4, 15.8, 16.4, 16.5, 17.3, 17.4, 17.7, 17.9, 18.4, 20.2, 20.6, 20.10, 19.2, 19.3**

- [x] 4. Implement authentication service
  - [x] 4.1 Implement Auth_Service (`lib/auth.ts`)
    - bcrypt password hashing/verification; `login` with rate limiting (5 failures / 15 min → 15 min lockout) via `LoginAttempt`
    - `createSession`/`verifySession`/`logout` using signed httpOnly `Secure` `SameSite=Lax` cookie with 24h expiry (`jose`)
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 20.8, 20.9, 20.10_

  - [x]* 4.2 Write property test for login lockout
    - **Property 22: Login lockout after repeated failures**
    - **Validates: Requirements 13.5**

  - [x]* 4.3 Write property test for password hashing round-trip
    - **Property 23: Password hashing round-trip**
    - **Validates: Requirements 13.6, 20.8**

- [x] 5. Implement click tracking service
  - [x] 5.1 Implement Click_Service (`lib/click-service.ts`)
    - `handleClick`: validate payload (id present, ≤64 chars, required fields), resolve active record, derive `deviceType` from UA, cap referrer ≤2048 / userAgent ≤1024, default missing to empty string, strip PII fields
    - Single MongoDB transaction (session): insert `ClickEvent` + atomic `$inc` increment of click count; return non-empty affiliate/destination URL; map errors to 404 (unknown), 400 (malformed), 500 (tx failure, rolled back)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.10, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 21.3, 21.4, 27.1, 27.2_

  - [x]* 5.2 Write property test for atomic, lossless click increment
    - **Property 5: Atomic, lossless click increment**
    - **Validates: Requirements 7.4, 9.2**

  - [x]* 5.3 Write property test for click event persistence with caps and defaults
    - **Property 6: Click event persistence with field caps and defaults**
    - **Validates: Requirements 7.2, 9.1, 7.3**

  - [x]* 5.4 Write property test for successful click returning the destination URL
    - **Property 7: Successful click returns the destination URL**
    - **Validates: Requirements 7.5, 9.4**

  - [x]* 5.5 Write property test for unknown identifier yielding 404 with no mutation
    - **Property 8: Unknown identifier yields 404 with no mutation**
    - **Validates: Requirements 7.10, 9.5, 21.4**

  - [x]* 5.6 Write property test for malformed payload yielding 400 with no mutation
    - **Property 9: Malformed click payload yields 400 with no mutation**
    - **Validates: Requirements 9.6, 21.7**

  - [x]* 5.7 Write property test for failed transaction rollback
    - **Property 10: Failed transaction rolls back completely**
    - **Validates: Requirements 9.3**

  - [x]* 5.8 Write property test for PII exclusion from click events
    - **Property 12: Click events exclude personally identifiable information**
    - **Validates: Requirements 27.1, 27.2, 19.11**

  - [x] 5.9 Implement click-event TTL deletion process
    - Delete events with `createdAt` older than 90 days (7,776,000s); schedule to run at least every 24h
    - _Requirements: 27.3, 27.4_

  - [x]* 5.10 Write property test for click-event TTL
    - **Property 13: Click-event TTL deletes exactly the expired events**
    - **Validates: Requirements 27.3, 27.4**

- [x] 6. Implement search service
  - [x] 6.1 Implement Search_Service (`lib/search-service.ts`)
    - Case-insensitive substring match (≥2 chars) across product title/description, store name, category name, deal headline, coupon code; return `{ products, productCount, deals, dealCount }`, cap ≤50, empty matches succeed; persist `SearchLog`
    - Rank exact product-title matches before partial matches
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 11.7, 11.10, 19.8, 21.1, 21.2_

  - [x]* 6.2 Write property test for search soundness, completeness, counts, and limit
    - **Property 14: Search soundness, completeness, case-insensitivity, counts, and limit**
    - **Validates: Requirements 11.3, 11.4, 11.5, 11.7, 21.1, 21.2**

  - [x]* 6.3 Write property test for exact-match ranking
    - **Property 15: Exact title matches rank ahead of partial matches**
    - **Validates: Requirements 11.6**

- [x] 7. Implement catalog and settings services
  - [x] 7.1 Implement cached catalog read helpers and listing comparators (`lib/catalog.ts`)
    - `use cache` data loaders with `cacheLife` (homepage/category/deal 300s, product 600s) and `cacheTag`; public projections exclude affiliate/destination URLs
    - Listing comparators: category ordering (desc active-product count, name/display-order tiebreak), product sort modes, deals by desc creation date, top-N by desc clicks with recency tiebreak; enforce section caps
    - _Requirements: 25.8, 25.9, 7.9, 24.1, 4.3, 1.8, 5.5, 10.1, 14.4_

  - [x]* 7.2 Write property test for listing ordering and caps
    - **Property 18: Listings respect their comparator and cap**
    - **Validates: Requirements 4.3, 1.8, 5.5, 10.1, 14.4**

  - [x] 7.3 Implement catalog mutations, slug resolution, and on-demand revalidation
    - Create/update/delete for categories/products/deals/banners with slug generation, store auto-create (case-insensitive), category-delete dependency guard, and `revalidateTag` after commit
    - Case-sensitive active-slug resolution returning single entry or not-found
    - _Requirements: 23.5, 23.6, 5.2, 6.2, 8.2, 15.10, 16.8, 25.8_

  - [x]* 7.4 Write property test for slug resolution round-trip and 404
    - **Property 3: Slug resolution round-trip and 404**
    - **Validates: Requirements 23.5, 23.6, 5.2, 6.2, 8.2**

  - [x] 7.5 Implement product filtering logic
    - Filter by subcategory, stores, discount tier (10/30/50%+), and price range with AND semantics
    - _Requirements: 5.6, 5.7, 5.8_

  - [x]* 7.6 Write property test for filters matching all active filters
    - **Property 19: Filters return exactly the items matching all active filters**
    - **Validates: Requirements 5.7**

  - [x] 7.7 Implement ordered "Load More" paging helper
    - 20-item pages over an eligible ordered list; expose whether more remain
    - _Requirements: 5.11, 5.12, 10.2, 10.3, 10.4, 11.8, 11.9_

  - [x]* 7.8 Write property test for Load More paging reconstruction
    - **Property 20: "Load More" paging reconstructs the full ordered list exactly once**
    - **Validates: Requirements 5.11, 10.2, 10.3, 11.8, 11.9**

  - [x] 7.9 Implement Settings service (`lib/settings.ts`)
    - Read/update the singleton settings row with `settings` cache tag and revalidation
    - _Requirements: 20.1, 20.3, 20.4, 20.7_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement public API route handlers
  - [x] 9.1 Implement `GET /api/public/search`
    - Validate query (1–100 chars) + optional type param; return results within budget; 400 on malformed params
    - _Requirements: 21.1, 21.2, 21.7, 11.10_

  - [x] 9.2 Implement `POST /api/public/click`
    - Wire to Click_Service; derive device type/referrer/UA server-side; 200/404/400/500 envelope per contract
    - _Requirements: 7.1, 7.2, 7.5, 7.10, 9.1, 9.4, 9.5, 9.6, 21.3, 21.4_

  - [x] 9.3 Implement `POST /api/public/contact`
    - Validate fields; persist `ContactMessage`; send admin notification via Nodemailer; persist even if email fails; success/error responses
    - _Requirements: 12.2, 12.3, 12.4, 12.6, 21.5, 21.6_

  - [x] 9.4 Implement `POST /api/admin/upload`
    - Session-guarded; accept JPEG/PNG/WebP/GIF, 1 byte–5 MB; store to object storage; return resolvable public URL; 400 for missing/unsupported/oversize; 401 without auth
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x]* 9.5 Write property test for upload validation
    - **Property 17: Upload validation maps inputs to accept or the correct error**
    - **Validates: Requirements 22.1, 22.3, 22.4, 22.5**

  - [x]* 9.6 Write integration tests for click and contact endpoints
    - Concurrent increments, transactional rollback, 404/400 paths against real MongoDB; contact persistence with email-failure path
    - _Requirements: 7.4, 9.2, 9.3, 12.6, 21.6_

- [ ] 10. Implement design system and shared public UI components
  - [x] 10.1 Implement design tokens, Tailwind theme, root layout, and Inter font
    - Apply color tokens, radii, max-width 1200px, focus indicator, reduced-motion support; Inter via `next/font` with system-sans fallback; sticky padded header offset
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.8, 26.9, 26.10_

  - [x] 10.2 Implement ProductCard
    - White bg/12px radius/shadow, 1:1 lazy image with placeholder fallback, store name, 2-line truncated title, bold price, optional strikethrough + integer `%` badge, no affiliate URL in markup; disabled CTA when no affiliate URL
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 7.9_

  - [x] 10.3 Implement CouponCard
    - 40px circular logo with first-letter fallback, store name, 2-line headline, optional dashed-border code container, optional muted expiry (≥4.5:1); CTA links to `/deal/[slug]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 10.4 Implement ClickCTA (shared click handler)
    - POST to `/api/public/click`; product timeout 5s (no navigate + inform) vs deal timeout 3s (open anyway); open returned URL in new tab; popup-block fallback anchor
    - _Requirements: 2.8, 7.6, 7.7, 7.8, 8.5, 8.11_

  - [x] 10.5 Implement HeroCarousel
    - 1–10 active banners ordered by ascending display order; 4s auto-advance when >1 and not hovered/touched; pause on hover/touch; hidden at zero; honor reduced-motion; inert on empty/malformed link
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.14, 18.7, 26.10_

  - [x] 10.6 Implement CountdownTimer
    - Server-rendered initial days/hours/minutes/seconds to avoid CLS/hydration mismatch; swap to expired message on reaching expiry
    - _Requirements: 6.5, 6.6, 8.6, 8.12_

  - [x] 10.7 Implement Filters/SortControl and ResponsiveGrid
    - Subcategory pills, store checkboxes, discount tiers, price range; bottom-sheet under 768px; removable chips; five sort options ("Most Popular" default); grid 2/3/4 cols
    - _Requirements: 5.3, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 26.7_

  - [x] 10.8 Implement Header and Footer
    - Fixed header (logo, search input placeholder, All Categories link); footer with logo, tagline, link columns, affiliate disclaimer, copyright, populated social links only, `#EFEFED` bg
    - _Requirements: 1.1, 1.13, 20.5_

  - [x]* 10.9 Write unit tests for public components
    - Card radii/shadow/truncation/badge/disabled-CTA/lazy/placeholder; carousel timing with fake timers; ClickCTA branch behaviors; countdown expiry swap
    - _Requirements: 2.1, 2.7, 2.9, 1.4, 1.5, 1.6, 7.7, 7.8, 8.11, 6.6, 8.12, 26.10_

- [ ] 11. Implement public pages
  - [x] 11.1 Implement homepage (`app/page.tsx`, ISR 300s)
    - Header, hero carousel, category pill row, featured products (default title "Featured Deals", hidden when none), category-wise sections, "Today's Best Coupons", popular stores strip, footer; background `#F8F8F6`
    - _Requirements: 1.2, 1.3, 1.8, 1.9, 1.10, 1.11, 1.12, 1.15, 1.16, 25.8_

  - [x] 11.2 Implement `/categories` listing page
    - H1 "All Categories", active-only, order by desc product count then asc name, cards with product count + icon/placeholder + link, empty state
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 11.3 Implement `/category/[slug]` detail page (ISR 300s)
    - `generateStaticParams`; header block (icon/H1/count/description), subcategory pills, sort + filters, 20-per-page grid with Load More, "Coupons for [Category]", SEO block; 404 for unknown slug
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.10, 5.11, 5.12, 5.13, 5.14, 25.8_

  - [x] 11.4 Implement `/product/[slug]` detail page (ISR 600s)
    - `generateStaticParams`; breadcrumb, 1:1 image, store, H1 title, price/strikethrough/discount badge, optional countdown, CTA + disclosure, show-more description (>300 chars), store deals, similar products, last-verified date; 404 within 2s
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 25.8_

  - [x] 11.5 Implement `/deal/[slug]` detail page (ISR 300s)
    - `generateStaticParams`; 60px logo/H1 headline/badge/category tags, coupon reveal + COPY CODE flow (success label swap + open; clipboard-fail selectable text + open), countdown within 7 days or "No expiry listed", 3–5 how-to-use steps + T&C, related store deals/products; 404 for unknown slug
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8, 8.9, 8.10, 25.8_

  - [x] 11.6 Implement `/deals` listing page
    - All active deals as CouponCards by desc creation date; 20-per-page Load More; empty state
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 11.7 Implement `/search` page (SSR per request)
    - Pre-fill query (first 200 chars), debounce 500ms, Products/Coupons tabs with counts (Products default), 20-per-page Load More, error state retaining query, zero-results suggestions + popular products
    - _Requirements: 11.1, 11.2, 11.7, 11.8, 11.9, 11.11, 11.12, 25.11_

  - [x] 11.8 Implement static pages, contact page, and not-found
    - `/about`, `/terms`, `/privacy`; `/contact` form (Name/Email/Subject/Message) with client validation + success/error states; `app/not-found.tsx`
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6_

- [ ] 12. Implement SEO and structured data
  - [x] 12.1 Implement SEO/JSON-LD builders and per-page metadata (`lib/seo.ts`)
    - One absolute canonical per page (first page for paginated sets), Open Graph tags with default image fallback, content/decorative alt rules; Product/Offer/WebSite+SearchAction/BreadcrumbList JSON-LD with `<` → `\u003c` escaping
    - _Requirements: 24.1, 24.6, 24.7, 24.8, 24.9, 24.10, 24.11_

  - [x]* 12.2 Write property test for per-page SEO invariants
    - **Property 25: Per-page SEO invariants**
    - **Validates: Requirements 24.6, 24.7, 24.8, 24.10, 24.11, 24.1**

  - [x]* 12.3 Write property test for JSON-LD presence and safe round-trip
    - **Property 26: JSON-LD presence and safe round-trip**
    - **Validates: Requirements 24.9**

  - [x] 12.4 Implement `sitemap.ts` and `robots.ts`
    - Sitemap of active categories/products/deals with absolute canonical URLs, excluding inactive/deleted/unpublished; split via `generateSitemaps` at >50,000 URLs; error (not partial/empty 200) when source unavailable; robots disallows `/admin` and `/api` and references sitemap
    - _Requirements: 24.2, 24.3, 24.4, 24.5_

  - [x]* 12.5 Write property test for sitemap completeness and partitioning
    - **Property 24: Sitemap completeness and 50,000-URL partitioning**
    - **Validates: Requirements 24.2, 24.3**

  - [x] 12.6 Implement default `opengraph-image` and verify affiliate-URL absence
    - Default site OG image route; assert public page HTML/RSC payload omits affiliate/destination URLs
    - _Requirements: 24.8, 7.9, 24.1_

  - [x]* 12.7 Write property test for affiliate URL absence from server-rendered output
    - **Property 11: Affiliate URLs are absent from server-rendered output**
    - **Validates: Requirements 7.9, 24.1**

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement admin authentication gate and proxy
  - [x] 14.1 Implement `proxy.ts`
    - HTTP→HTTPS redirect; optimistic redirect of unauthenticated `/admin/*` (except `/admin/login`) to login based on cookie presence
    - _Requirements: 13.1, 27.5, 27.6_

  - [x] 14.2 Implement admin auth API and authoritative session guard
    - `/api/admin/auth` (login/logout) wired to Auth_Service; `verifySession` guard returning 401 for `/api/admin/*` without valid session; shared admin layout redirect to `/admin/login`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 13.8_

  - [x] 14.3 Implement `/admin/login` page (client-rendered)
    - Email/password form with validation, lockout message, redirect to dashboard on success
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 25.10_

- [ ] 15. Implement admin APIs and pages
  - [x] 15.1 Implement admin catalog CRUD APIs
    - Session-guarded `/api/admin/{categories,products,deals,banners}` create/update/delete/list with Zod validation, slug generation, store auto-create, category-delete guard, bulk actions, and `revalidateTag`
    - _Requirements: 13.8, 15.1, 15.3, 15.4, 15.6, 15.9, 15.10, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 16.15, 17.3, 17.4, 17.7, 17.9, 17.10, 17.11, 17.12, 18.3, 18.4, 18.6_

  - [x] 15.2 Implement admin settings and analytics APIs
    - `/api/admin/settings` (site/SEO/social/affiliate/password) with validation; `/api/admin/analytics` aggregation + CSV export endpoints
    - _Requirements: 13.8, 20.1, 20.2, 20.3, 20.4, 20.6, 20.7, 20.8, 20.9, 20.10, 19.1, 19.2, 19.3, 19.4, 19.9, 19.10_

  - [x] 15.3 Implement analytics aggregation logic
    - Period totals from events in inclusive range (admin time zone), zero-filled per-day series, clicks-by-type/device/category, top products/deals, search query stats; PII-free; CSV export
    - _Requirements: 14.1, 14.3, 14.5, 19.2, 19.4, 19.5, 19.7, 19.8, 19.9, 19.11_

  - [x]* 15.4 Write property test for analytics aggregation and zero-filled series
    - **Property 21: Analytics aggregation and zero-filled day series**
    - **Validates: Requirements 14.1, 19.4, 14.3, 19.5**

  - [x] 15.5 Implement admin dashboard page (client-rendered)
    - Metric cards (products/deals/categories/clicks today, default 0), 30-day line chart, top-10 product/deal bar charts, clicks-by-category chart, 50 most-recent events table, quick-action controls
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 25.10_

  - [ ] 15.6 Implement admin categories page (client-rendered)
    - Table with inline active/show-on-homepage toggles, edit/delete, empty state; create/edit form (parent, icon upload+preview, description, homepage flag/title, display order, status, meta) with auto-slug and default meta title
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7, 15.8, 15.9, 15.10, 25.10_

  - [ ] 15.7 Implement admin products page (client-rendered)
    - Paginated table (25/page) with search/filter/sort, toggles, bulk actions + confirm, CSV export; form with pricing/discount, store auto-create, additional images (≤4, drag-reorder), rich-text description, ≤8 key features, Save Draft/Publish
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.9, 16.10, 16.11, 16.12, 16.13, 16.14, 16.15, 16.16, 25.10_

  - [ ] 15.8 Implement admin deals page (client-rendered)
    - Table with expiry color states, toggles, bulk actions (with no-selection guard + delete confirm); form with deal-type selector, conditional coupon code, how-to-use steps, valid-from/until, terms, caps
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 17.11, 17.12, 25.10_

  - [ ] 15.9 Implement admin banners page (client-rendered)
    - Table with thumbnail/drag-reorder/toggle/edit/delete, empty state; form with image (+mobile image), headline/CTA, link URL + target, display order, status
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 25.10_

  - [ ] 15.10 Implement admin analytics and settings pages (client-rendered)
    - Analytics page: date-range selector (today/7/30/90/custom ≤366d), overview cards, charts, top tables, search-query tables, empty states, CSV export; settings page: site/SEO/social/affiliate/password forms with validation
    - _Requirements: 19.1, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 20.1, 20.2, 20.3, 20.4, 20.6, 20.7, 20.8, 20.9, 20.10, 25.10_

- [ ] 16. Final integration and wiring
  - [x] 16.1 Wire navigation, revalidation, and TTL scheduling end-to-end
    - Connect public pages to cached loaders and admin mutations to `revalidateTag`; schedule the click-event TTL job; seed admin user and singleton settings
    - _Requirements: 25.8, 25.9, 27.3, 27.4_

  - [x]* 16.2 Write integration tests for ISR, revalidation, upload, and config
    - Observe `x-nextjs-cache` for 300s/600s windows and serve-last-good; admin mutation → revalidateTag → public reflects change; `next/image` WebP + raster fallback; upload stores resolvable URL + 401; robots/SSR-search/admin-client/HTTPS-redirect smoke checks
    - _Requirements: 25.6, 25.7, 25.8, 25.9, 25.10, 25.11, 22.1, 24.5, 27.5, 27.6_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property, unit, and integration tests) and can be skipped for a faster MVP.
- Each task references specific requirements clauses for traceability; property sub-tasks reference both a design property number and the requirements it validates.
- Property-based tests use `fast-check` + `vitest` with ≥100 generated cases each, run against an in-memory transactional model where side effects are involved, with real-MongoDB integration tests confirming the model matches the database.
- Performance budgets (LCP/INP/CLS/TTFB, ≤150 KB JS) and full WCAG conformance are validated through lab/field and manual testing outside this coding plan and are intentionally not unit-asserted.
- Checkpoints provide incremental validation at natural breaks.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "2.4", "2.6"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.5", "3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "4.2", "4.3", "5.1", "6.1", "7.9"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "6.2", "6.3", "7.1", "7.3", "7.5", "7.7"] },
    { "id": 6, "tasks": ["5.10", "7.2", "7.4", "7.6", "7.8", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 7, "tasks": ["9.5", "9.6", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "12.1"] },
    { "id": 9, "tasks": ["10.9", "11.2", "11.6", "11.7", "11.8", "12.2", "12.3", "12.4", "12.6"] },
    { "id": 10, "tasks": ["11.1", "11.3", "11.4", "11.5", "12.5", "12.7", "14.1", "14.2"] },
    { "id": 11, "tasks": ["14.3", "15.1", "15.2", "15.3"] },
    { "id": 12, "tasks": ["15.4", "15.5", "15.6", "15.7", "15.8", "15.9", "15.10"] },
    { "id": 13, "tasks": ["16.1"] },
    { "id": 14, "tasks": ["16.2"] }
  ]
}
```
