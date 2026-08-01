# Requirements Document

## Introduction

DealSpark is a mobile-first, SEO-optimized affiliate product and coupon discovery website for the Indian market, built as a Next.js 14 (App Router) full-stack application. The platform lets an administrator publish products, categories, stores, coupons/deals, and homepage banners. Public visitors browse and search this catalog without authentication. When a visitor clicks a product's "Buy Now" action or a coupon's "Get Code" action, the system logs an anonymous click event, atomically increments the click count, and opens the original merchant site (Flipkart, Amazon, Myntra, etc.) in a new tab using an admin-configured affiliate URL. Purchases on the merchant site earn affiliate commission.

The product consists of two surfaces: a public, server-rendered website optimized for organic search traffic (70%+ mobile), and a password-protected admin panel for content and analytics management. Explicitly out of scope: user login/registration, cashback wallet, premium membership, price tracking, user reviews, loyalty points, merchant self-serve portal, native mobile apps, browser extensions, messaging bots, and any public B2B API.

This document specifies functional and non-functional requirements using EARS patterns and INCOSE quality rules, covering the public website, admin panel, technical architecture, SEO, performance, and design-system constraints.

## Glossary

- **System**: The complete DealSpark application, including the public website, admin panel, API route handlers, and data layer.
- **Public_Site**: The public-facing, server-rendered surface of the System accessible without authentication.
- **Admin_Panel**: The password-protected administrative surface of the System under the `/admin` base path.
- **Visitor**: An unauthenticated public user browsing the Public_Site.
- **Administrator**: The single authenticated user who manages content and views analytics via the Admin_Panel.
- **Catalog**: The collection of Categories, Stores, Products, and Deals managed by the Administrator.
- **Category**: A grouping of Products and Deals, optionally nested under a parent Category, identified by a unique slug.
- **Store**: A merchant brand (e.g., Flipkart, Amazon, Myntra) associated with Products and Deals.
- **Product**: A single affiliate product entry with pricing, images, description, and an affiliate URL.
- **Deal**: A coupon code, direct deal, bank-card offer, or cashback offer with a destination URL.
- **Banner**: An admin-configurable hero image shown in the homepage carousel.
- **Affiliate_URL**: The full merchant destination link including affiliate tracking parameters, configured by the Administrator.
- **Click_Event**: An anonymous record of a Visitor activating a Product or Deal affiliate action, containing no personal data.
- **Product_Card**: The reusable UI component that displays a Product summary across the Public_Site.
- **Coupon_Card**: The reusable UI component that displays a Deal summary across the Public_Site.
- **Search_Service**: The System component that returns matching Products and Deals for a text query.
- **Click_Service**: The System component that logs Click_Events, increments click counts, and returns Affiliate_URLs.
- **Auth_Service**: The System component that authenticates the Administrator and manages session cookies.
- **Sitemap_Generator**: The System component that produces `/sitemap.xml` from active Catalog entries.
- **Session_Cookie**: An httpOnly cookie that establishes an authenticated Administrator session.
- **Slug**: A lowercase, hyphenated, URL-safe identifier derived from a name or title.
- **LCP**: Largest Contentful Paint, a Core Web Vitals metric.
- **INP**: Interaction to Next Paint, a Core Web Vitals metric.
- **CLS**: Cumulative Layout Shift, a Core Web Vitals metric.
- **TTFB**: Time To First Byte, a server-response timing metric.
- **ISR**: Incremental Static Regeneration, the Next.js rendering mode that re-generates pages on a revalidation interval.
- **JSON_LD**: Structured data markup in JSON-LD format used for SEO.

## Requirements

### Requirement 1: Homepage

**User Story:** As a Visitor, I want a homepage that surfaces categories, featured products, and hot coupons, so that I can quickly discover relevant deals.

#### Acceptance Criteria

1. WHEN a Visitor requests the path `/`, THE Public_Site SHALL render a header that remains fixed to the top of the viewport during scroll, containing the site logo, a search input with placeholder text "Search products, deals, stores...", and an "All Categories" link.
2. THE Public_Site SHALL render the homepage background using color value `#F8F8F6`.
3. WHERE at least one active Banner exists, THE Public_Site SHALL render a hero carousel of between 1 and 3 active Banners ordered by ascending display order.
4. WHILE the hero carousel contains more than one Banner AND no pointer is hovering or touching the carousel, THE Public_Site SHALL advance to the next Banner every 4 seconds.
5. WHILE a pointer is hovering or touching the hero carousel, THE Public_Site SHALL pause automatic Banner advancement.
6. WHERE zero active Banners exist, THE Public_Site SHALL hide the hero carousel.
7. WHEN a Visitor activates a Banner whose configured link URL is non-empty, THE Public_Site SHALL navigate to the Banner's configured link URL.
8. THE Public_Site SHALL render a horizontally scrollable category pill row containing up to 10 active Categories ordered by descending active Product count, breaking ties by ascending display order, followed by a "View All" pill linking to `/categories`.
9. WHERE at least one Product is marked as featured, THE Public_Site SHALL render a featured products section containing up to 8 Products marked as featured, with a link to the full deals listing.
10. THE Public_Site SHALL render a category-wise section for each Category marked "show on homepage" that has at least 4 active Products, ordered by ascending display order, each containing between 4 and 6 active Products from that Category.
11. WHERE at least 6 active featured Deals exist, THE Public_Site SHALL render a coupons section titled "Today's Best Coupons" containing between 6 and 8 active featured Deals, with a link to the full coupons listing.
12. THE Public_Site SHALL render a horizontally scrollable store strip containing up to 12 active Stores labeled "Popular Stores".
13. THE Public_Site SHALL render a footer containing the site logo, tagline, navigation link columns, an affiliate disclaimer, and a copyright notice, using background color value `#EFEFED`.
14. IF a Visitor activates a Banner whose configured link URL is empty or malformed, THEN THE Public_Site SHALL remain on the homepage and SHALL NOT navigate.
15. WHERE no Product is marked as featured, THE Public_Site SHALL hide the featured products section.
16. WHERE no admin-configured featured-section title exists, THE Public_Site SHALL render the featured products section with the default title "Featured Deals".

### Requirement 2: Product Card Component

**User Story:** As a Visitor, I want a consistent product card, so that I can scan product details and prices the same way everywhere.

#### Acceptance Criteria

1. THE Product_Card SHALL render a white background, a 12px corner radius, a drop shadow, a 1:1 aspect-ratio image, the Store name, and the Product title, where the Product title is truncated with a trailing ellipsis when it exceeds 2 lines.
2. THE Product_Card SHALL render the current price in bold typography, where the current price is a value between 0.01 and 999,999,999.99.
3. WHERE a Product has an original price, THE Product_Card SHALL render the original price with strikethrough styling.
4. WHERE a Product has a discount percentage, THE Product_Card SHALL render a badge displaying the discount percentage as an integer between 1 and 100 followed by a percent sign.
5. WHERE a Product has neither an original price nor a discount percentage, THE Product_Card SHALL render only the current price.
6. THE Product_Card SHALL load the Product image lazily, deferring the image request until the Product_Card enters the browser viewport.
7. IF the Product image fails to load, THEN THE Product_Card SHALL render a placeholder image in the same 1:1 aspect-ratio container in place of the Product image.
8. WHEN the Visitor activates the "VIEW DEAL →" call-to-action, THE Product_Card SHALL open the Product's Affiliate_URL in a new browser tab while retaining the current tab.
9. IF a Product has no Affiliate_URL, THEN THE Product_Card SHALL render the "VIEW DEAL →" call-to-action in a disabled state that does not open a new browser tab when activated.

### Requirement 3: Coupon Card Component

**User Story:** As a Visitor, I want a consistent coupon card, so that I can recognize and act on coupon offers.

#### Acceptance Criteria

1. THE Coupon_Card SHALL render the Store logo as a circular image with a 40px diameter, the Store name, and a headline truncated to a maximum of 2 lines with an ellipsis appended when the text exceeds 2 lines.
2. IF the Store logo image fails to load, THEN THE Coupon_Card SHALL render a placeholder containing the first character of the Store name in place of the logo.
3. WHERE a Deal has a coupon code, THE Coupon_Card SHALL render the coupon code inside a dashed-border container.
4. WHERE a Deal has no coupon code, THE Coupon_Card SHALL omit the dashed-border container.
5. WHERE a Deal has an expiry date, THE Coupon_Card SHALL render the expiry date using muted text styling with a contrast ratio of at least 4.5:1 against its background.
6. WHEN the Visitor activates the "GET COUPON CODE" call-to-action, THE Coupon_Card SHALL navigate to the corresponding `/deal/[slug]` page within 1 second.

### Requirement 4: Category Listing Page

**User Story:** As a Visitor, I want a page listing all categories, so that I can navigate to the category that matches my interest.

#### Acceptance Criteria

1. WHEN a Visitor requests the path `/categories`, THE Public_Site SHALL render a page with an H1 heading containing the text "All Categories".
2. THE Public_Site SHALL render on the `/categories` page only Categories whose status is active, and SHALL exclude every Category whose status is not active.
3. THE Public_Site SHALL order the Category cards on the `/categories` page primarily by descending active Product count, and SHALL break ties between Categories with equal active Product counts by ascending Category name.
4. THE Public_Site SHALL render each Category card containing the Category name, the Category's active Product count as a non-negative integer, and a link whose target is `/category/[slug]` for that Category's slug.
5. WHERE a Category has a configured icon or image, THE Public_Site SHALL render that icon or image within the Category card, each with descriptive alt text equal to the Category name.
6. IF a Category has no configured icon or image, THEN THE Public_Site SHALL render a placeholder visual within the Category card in place of the icon or image.
7. WHERE zero active Categories exist, THE Public_Site SHALL render an empty-state message indicating that no categories are available in place of the Category card grid.

### Requirement 5: Category Detail Page

**User Story:** As a Visitor, I want a category page with products, coupons, and filters, so that I can narrow down to deals I want.

#### Acceptance Criteria

1. WHEN a Visitor requests `/category/[slug]` for an active Category, THE Public_Site SHALL render the Category icon, the Category name as a single H1 heading, the count of active Products in the Category, and the admin-editable Category description.
2. IF a Visitor requests `/category/[slug]` for a slug that matches no active Category, THEN THE Public_Site SHALL return an HTTP 404 response.
3. WHERE a Category has one or more subcategories, THE Public_Site SHALL render one filter pill per subcategory, with exactly the currently selected subcategory pill shown in a visually distinct state from the unselected pills.
4. THE Public_Site SHALL render a sort control offering exactly these five options: "Most Popular", "Newest", "Price Low-High", "Price High-Low", and "Biggest Discount", with "Most Popular" selected by default.
5. WHEN a Visitor selects a sort option, THE Public_Site SHALL reorder the displayed Products such that: "Most Popular" orders by descending view count, "Newest" orders by descending Product creation timestamp, "Price Low-High" orders by ascending current price, "Price High-Low" orders by descending current price, and "Biggest Discount" orders by descending discount percentage.
6. WHEN a Visitor opens the filter control on a viewport width below 768px, THE Public_Site SHALL present filters in a bottom-sheet containing Store checkboxes, discount tier options of 10%+, 30%+, and 50%+, and a price-range control spanning ₹0 to ₹1,00,000.
7. WHEN a Visitor applies one or more filters, THE Public_Site SHALL render each active filter as a removable chip and display only the Products that match all active filters simultaneously.
8. WHEN a Visitor removes a filter chip, THE Public_Site SHALL clear the corresponding filter and re-render the Products matching the remaining active filters.
9. IF the active filter and sort combination yields zero matching Products, THEN THE Public_Site SHALL display an empty-state message indicating that no Products match the current filters and SHALL retain the active filter chips.
10. THE Public_Site SHALL render Products in a grid of 2 columns at viewport widths below 768px, 3 columns from 768px to 1023px, and 4 columns at 1024px and above.
11. THE Public_Site SHALL display 20 Products per page and provide a "Load More" control that appends the next 20 Products when activated.
12. IF no further Products remain to load, THEN THE Public_Site SHALL hide the "Load More" control.
13. THE Public_Site SHALL render a coupons section titled "Coupons for [Category]" below the Products grid.
14. THE Public_Site SHALL render an admin-editable SEO content block below the coupons section.

### Requirement 6: Product Detail Page

**User Story:** As a Visitor, I want a detailed product page with a clear buy action, so that I can decide and proceed to the merchant.

#### Acceptance Criteria

1. WHEN a Visitor requests `/product/[slug]` for an active Product, THE Public_Site SHALL render a breadcrumb of exactly three linked items in the order Home, Category, Product, where each item links to its corresponding page.
2. IF a Visitor requests `/product/[slug]` for a slug that matches no active Product, THEN THE Public_Site SHALL return an HTTP 404 response and render an error page within 2 seconds.
3. THE Public_Site SHALL render the primary Product image at a 1:1 aspect ratio, the Store name and logo, and the Product title as a single H1 heading.
4. THE Public_Site SHALL render the current price, and IF a Product has an original price greater than the current price, THEN THE Public_Site SHALL render the original price with strikethrough styling and a discount badge showing the discount percentage rounded to the nearest integer.
5. WHERE a Product has an offer expiry date in the future, THE Public_Site SHALL render a countdown timer to that expiry date displaying days, hours, minutes, and seconds remaining relative to server time.
6. WHEN a rendered countdown timer reaches the Product's offer expiry date and time, THE Public_Site SHALL replace the countdown timer with text indicating that the offer has expired.
7. THE Public_Site SHALL render a primary call-to-action labeled with the Product's configured button label and an affiliate disclosure statement.
8. WHERE the Product full description exceeds 300 characters, THE Public_Site SHALL initially display the first 300 characters and provide a show-more/show-less toggle to expand and collapse the full rich-text description.
9. WHERE more than 3 active Deals exist for the Product's Store, THE Public_Site SHALL render the 3 most recently created Coupon_Cards for that Store; WHERE between 1 and 3 active Deals exist, THE Public_Site SHALL render one Coupon_Card per Deal.
10. WHERE at least 4 similar active Products exist in the same Category, THE Public_Site SHALL render between 4 and 6 of them; WHERE fewer than 4 similar active Products exist, THE Public_Site SHALL render all of them.
11. THE Public_Site SHALL render a price-may-differ disclaimer and a "last verified on [date]" statement, where the date is formatted as DD Mon YYYY.

### Requirement 7: Buy Now Click Handling

**User Story:** As a Visitor, I want the buy action to take me to the merchant, so that I can complete my purchase while the System tracks the referral.

#### Acceptance Criteria

1. WHEN a Visitor activates a Product buy call-to-action, THE Public_Site SHALL send a POST request to `/api/public/click` containing the click type and Product identifier.
2. WHEN the Click_Service receives a click request whose identifier matches an active Product, THE Click_Service SHALL persist a Click_Event recording click type, Product identifier, device type, referrer of at most 2048 characters, user agent of at most 1024 characters, and creation timestamp, returning a response within 2 seconds.
3. WHERE a Product click request omits the referrer or user agent, THE Click_Service SHALL persist the corresponding field as an empty value.
4. WHEN the Click_Service persists a Product Click_Event, THE Click_Service SHALL atomically increment the Product's total click count by exactly 1 so that concurrent clicks are not lost.
5. WHEN the Click_Service completes logging a Product click, THE Click_Service SHALL return the Product's Affiliate_URL in the response body.
6. WHEN the Public_Site receives the Affiliate_URL response, THE Public_Site SHALL open the Affiliate_URL in a new browser tab.
7. IF the POST request to `/api/public/click` fails or does not return a response within 5 seconds, THEN THE Public_Site SHALL inform the Visitor that the link could not be opened and SHALL NOT navigate away.
8. IF the browser blocks opening the new tab, THEN THE Public_Site SHALL present the Visitor with an explicit link to the destination.
9. THE Public_Site SHALL exclude every Affiliate_URL from the server-rendered HTML delivered to Visitors.
10. IF a click request references an identifier that matches no active Product, THEN THE Click_Service SHALL return an HTTP 404 response without persisting a Click_Event and without modifying any click count.

### Requirement 8: Deal Detail Page and Coupon Reveal

**User Story:** As a Visitor, I want a deal page that reveals the coupon code and sends me to the store, so that I can apply the offer.

#### Acceptance Criteria

1. WHEN a Visitor requests `/deal/[slug]` for an active Deal, THE Public_Site SHALL render a 60px Store logo, Store name, deal headline as an H1 heading, discount badge, and Category tags.
2. IF a Visitor requests `/deal/[slug]` for a slug that matches no active Deal, THEN THE Public_Site SHALL return an HTTP 404 response.
3. WHERE a Deal is of type coupon code, THE Public_Site SHALL render the coupon code text within a dedicated reveal block accompanied by a "COPY CODE" control.
4. WHEN a Visitor activates the "COPY CODE" control and the clipboard write succeeds, THE Public_Site SHALL copy the coupon code to the clipboard, change the control label to "COPIED ✓" for 2 seconds and then revert it to "COPY CODE", and open the Deal's destination Affiliate_URL in a new browser tab.
5. WHEN a Visitor activates a Deal reveal action, THE Public_Site SHALL send a POST request to `/api/public/click` containing the click type and Deal identifier.
6. WHERE a Deal has an expiry date within the next 7 days, THE Public_Site SHALL render a countdown timer displaying the days, hours, minutes, and seconds remaining until the expiry date.
7. WHERE a Deal has no expiry date, THE Public_Site SHALL render the text "No expiry listed".
8. THE Public_Site SHALL render between 3 and 5 numbered "How to Use" steps and expandable terms and conditions from the Deal record.
9. THE Public_Site SHALL render up to 4 additional active Deals from the same Store and up to 4 active Products from the same Store.
10. IF a Visitor activates the "COPY CODE" control and the clipboard write fails, THEN THE Public_Site SHALL render the coupon code as user-selectable text with an error indication that the automatic copy did not succeed, and SHALL still open the Deal's destination Affiliate_URL in a new browser tab.
11. IF the POST request to `/api/public/click` fails or does not return a response within 3 seconds, THEN THE Public_Site SHALL open the Deal's destination Affiliate_URL in a new browser tab without blocking the Visitor.
12. WHEN a rendered countdown timer reaches the Deal's expiry date and time, THE Public_Site SHALL replace the countdown timer with text indicating that the Deal has expired.

### Requirement 9: Deal Click Handling

**User Story:** As a Visitor, I want coupon clicks tracked, so that the System records the referral while sending me to the merchant.

#### Acceptance Criteria

1. WHEN the Click_Service receives a click request whose non-empty Deal identifier of at most 64 characters matches an active Deal, THE Click_Service SHALL persist a Click_Event recording click type, Deal identifier, device type, referrer, user agent, and creation timestamp within 500 milliseconds.
2. WHEN the Click_Service persists a Deal Click_Event, THE Click_Service SHALL atomically increment the Deal's total click count by exactly 1 within the same transaction as the persistence operation.
3. IF the persistence transaction fails, THEN THE Click_Service SHALL roll back so that neither the Click_Event nor an incremented click count is retained, and SHALL return a server error response.
4. WHEN the Click_Service completes logging a Deal click, THE Click_Service SHALL return the Deal's non-empty destination Affiliate_URL in the response body.
5. IF a click request references an identifier that matches no active Deal, THEN THE Click_Service SHALL return an HTTP 404 response without persisting a Click_Event and without modifying any click count.
6. IF a Deal click request omits the identifier, exceeds the maximum identifier length, or omits a required field, THEN THE Click_Service SHALL return an HTTP 400 response indicating the invalid field without persisting a Click_Event and without modifying any click count.

### Requirement 10: Deals Listing Page

**User Story:** As a Visitor, I want a page listing all deals, so that I can browse coupons across stores.

#### Acceptance Criteria

1. WHEN a Visitor requests the path `/deals`, THE Public_Site SHALL render every active Deal as a Coupon_Card, ordered by descending Deal creation date.
2. WHILE at least 21 active Deals exist, THE Public_Site SHALL display the first 20 Deals on initial load and provide a "Load More" control that appends the next 20 Deals each time it is activated.
3. WHEN a Visitor activates the "Load More" control and no further unrendered active Deals remain, THE Public_Site SHALL append the remaining Deals and hide the "Load More" control.
4. WHERE 20 or fewer active Deals exist, THE Public_Site SHALL render all active Deals and hide the "Load More" control.
5. IF zero active Deals exist when a Visitor requests `/deals`, THEN THE Public_Site SHALL render an empty-state message indicating no deals are currently available.

### Requirement 11: Search

**User Story:** As a Visitor, I want to search products and coupons, so that I can find specific items quickly.

#### Acceptance Criteria

1. WHEN a Visitor requests `/search?q=[query]`, THE Public_Site SHALL pre-fill the search input with the first 200 characters of the query value.
2. WHILE a Visitor is typing a query of at least 2 characters in the search input, THE Public_Site SHALL submit the query 500 milliseconds after the most recent keystroke.
3. WHEN the Search_Service receives a query, THE Search_Service SHALL match the query against Product title, Product description, Store name, Category name, Deal headline, and Deal coupon code.
4. THE Search_Service SHALL perform case-insensitive matching.
5. THE Search_Service SHALL match query substrings within candidate fields.
6. THE Search_Service SHALL rank results with exact Product title matches before partial matches.
7. THE Public_Site SHALL render results in two tabs labeled "Products ([count])" and "Coupons ([count])" with the Products tab selected by default.
8. THE Public_Site SHALL display search results in pages of 20 results and provide a "Load More" control while additional unshown results remain.
9. WHEN a Visitor activates the "Load More" control, THE Public_Site SHALL append the next 20 search results to the currently displayed results.
10. WHEN the Search_Service receives a query, THE Search_Service SHALL return results within 2 seconds.
11. IF the Search_Service returns an error or does not return results within 2 seconds, THEN THE Public_Site SHALL render an error message indicating the search could not be completed and SHALL retain the entered query in the search input.
12. IF a query returns zero results, THEN THE Public_Site SHALL render a no-results message, between 3 and 5 search suggestions, and between 4 and 8 popular Products.

### Requirement 12: Static Pages and Contact

**User Story:** As a Visitor, I want informational pages and a contact form, so that I can learn about the site and reach the operator.

#### Acceptance Criteria

1. WHEN a Visitor requests `/about`, `/terms`, or `/privacy`, THE Public_Site SHALL render the corresponding static content page within 2 seconds.
2. WHEN a Visitor requests `/contact`, THE Public_Site SHALL render a form with a Name field (1 to 100 characters), an Email field (1 to 254 characters), a Subject field (1 to 150 characters), and a Message field (1 to 2,000 characters).
3. WHEN a Visitor submits the contact form with all required fields populated and the Email value matching the pattern local-part@domain.tld, THE System SHALL persist a ContactMessage record and send a notification email to the configured admin email address.
4. WHEN the System persists a ContactMessage and dispatches the notification email, THE Public_Site SHALL render a success confirmation message to the Visitor.
5. IF a Visitor submits the contact form with a missing required field, a field exceeding its maximum length, or an Email value not matching local-part@domain.tld, THEN THE Public_Site SHALL render a validation message identifying each invalid field, SHALL retain the previously entered values, and SHALL NOT send a notification email.
6. IF persisting the ContactMessage or sending the notification email fails, THEN THE Public_Site SHALL render an error indication and prompt the Visitor to retry.

### Requirement 13: Admin Authentication

**User Story:** As an Administrator, I want secure password-protected access, so that only I can manage content and view analytics.

#### Acceptance Criteria

1. WHEN a Visitor requests any `/admin` path other than `/admin/login` without a valid Session_Cookie, THE System SHALL redirect the request to `/admin/login`.
2. WHEN an Administrator submits credentials at `/admin/login` that match the stored Administrator account, THE Auth_Service SHALL establish an httpOnly Session_Cookie that expires 24 hours after creation and SHALL redirect to `/admin/dashboard` within 2 seconds.
3. IF an Administrator submits credentials that do not match the stored Administrator account, THEN THE Auth_Service SHALL render the message "Invalid email or password" within 2 seconds and SHALL NOT establish a Session_Cookie.
4. IF an Administrator submits the login form with an empty email field or an empty password field, THEN THE Auth_Service SHALL render an error message indicating which required field is missing and SHALL NOT establish a Session_Cookie.
5. IF an Administrator submits non-matching credentials 5 consecutive times within a 15-minute window, THEN THE Auth_Service SHALL reject all further login attempts for that account for 15 minutes from the 5th failed attempt and SHALL render a message indicating the account is temporarily locked.
6. THE Auth_Service SHALL store the Administrator password as a bcrypt hash.
7. WHEN an Administrator activates the logout action, THE Auth_Service SHALL invalidate the Session_Cookie and SHALL redirect to `/admin/login`.
8. WHEN any `/api/admin` endpoint receives a request without a valid Session_Cookie, THE System SHALL return an HTTP 401 response.

### Requirement 14: Admin Dashboard

**User Story:** As an Administrator, I want a dashboard overview, so that I can monitor catalog size and engagement at a glance.

#### Acceptance Criteria

1. WHEN an authenticated Administrator requests `/admin/dashboard`, THE Admin_Panel SHALL render metric cards for total Products, total Deals, total Categories, and total clicks recorded during the current calendar day in the system time zone, defaulting any metric with no data to 0.
2. IF a request to `/admin/dashboard` is made without a valid Administrator session, THEN THE System SHALL redirect the request to `/admin/login` and SHALL NOT render dashboard data.
3. THE Admin_Panel SHALL render a line chart of total clicks per day for the trailing 30 calendar days in chronological order, rendering a value of 0 for any day with no clicks.
4. THE Admin_Panel SHALL render a horizontal bar chart of up to the 10 Products with the highest click counts and a horizontal bar chart of up to the 10 Deals with the highest click counts, each ordered by descending click count and breaking ties by most recent creation timestamp.
5. THE Admin_Panel SHALL render a chart of click counts grouped by Category, including every Category and rendering a value of 0 for any Category with no clicks.
6. THE Admin_Panel SHALL render a table of up to the 50 most recent Click_Events ordered by descending timestamp, showing timestamp, item name, click type, and device type.
7. THE Admin_Panel SHALL render quick-action controls to add a Product, add a Deal, and add a Category.

### Requirement 15: Category Management

**User Story:** As an Administrator, I want to manage categories, so that I can organize the catalog and control homepage placement.

#### Acceptance Criteria

1. WHEN an authenticated Administrator requests `/admin/categories`, THE Admin_Panel SHALL render a table of Categories showing icon, name, slug, parent, active Product count, an inline active toggle, an inline show-on-homepage toggle, and edit and delete controls.
2. WHERE no Categories exist, THE Admin_Panel SHALL render an empty-state message in place of the Categories table.
3. WHEN an Administrator submits a Category create or edit form with a name of 1 to 100 trimmed characters, THE System SHALL persist the Category and render a success notification within 3 seconds.
4. IF an Administrator submits a Category form with a name that is empty, whitespace-only, or exceeds 100 characters, THEN THE Admin_Panel SHALL render a validation message and SHALL NOT persist the Category.
5. WHEN an Administrator enters a Category name and has not manually edited the slug, THE Admin_Panel SHALL derive the slug from the name as a lowercase value in which each run of non-alphanumeric characters becomes a single hyphen with leading and trailing hyphens removed.
6. IF an Administrator submits a Category whose slug duplicates an existing Category slug, THEN THE System SHALL reject the submission, render a uniqueness validation message, and SHALL NOT persist the Category.
7. THE Admin_Panel SHALL provide Category form fields for parent Category, icon image upload (JPEG, PNG, WebP, or SVG, at most 2 MB) with preview, description, show-on-homepage flag, homepage section title, display order (0 to 9999), status, meta title, and meta description.
8. IF an Administrator submits a Category icon that is not JPEG, PNG, WebP, or SVG or exceeds 2 MB, or a display order outside 0 to 9999, THEN THE Admin_Panel SHALL render a validation message and SHALL NOT persist the Category.
9. WHEN an Administrator creates a Category without entering a meta title, THE System SHALL default the meta title to "[Category] Deals & Coupons | DealSpark".
10. IF an Administrator attempts to delete a Category that has associated Products or child Categories, THEN THE System SHALL reject the deletion and render a message indicating the Category cannot be deleted while it has dependents.

### Requirement 16: Product Management

**User Story:** As an Administrator, I want to create and manage products with affiliate links, so that visitors can discover and buy them.

#### Acceptance Criteria

1. WHEN an authenticated Administrator requests `/admin/products`, THE Admin_Panel SHALL render a table of Products in pages of 25 showing image, title truncated to 60 characters, Category, Store, current price, discount percentage, a featured toggle, an active toggle, total clicks, last updated date, and edit, view, and delete controls.
2. WHEN an Administrator searches, filters, or sorts the Products list, THE Admin_Panel SHALL return the updated list within 3 seconds, supporting search by title or Store, filter by Category, Store, status, and featured flag, and sort by newest, oldest, clicks, or price.
3. IF a search or filter combination matches no Products, THEN THE Admin_Panel SHALL render an empty-state message in place of the table rows.
4. WHEN an Administrator submits a Product form with a title of 1 to 200 characters, Store, Category, a current price between 0.01 and 999,999,999.99, primary image, and Affiliate_URL all populated, THE System SHALL persist the Product and render a success notification.
5. IF an Administrator submits a Product form missing any of title, Store, Category, current price, primary image, or Affiliate_URL, or with a current price outside 0.01 to 999,999,999.99, THEN THE Admin_Panel SHALL render a validation message identifying the invalid field and SHALL NOT persist the Product.
6. WHERE an Administrator provides both a current price and an original price greater than the current price, THE System SHALL calculate the discount percentage as the original price minus the current price, divided by the original price, multiplied by 100, rounded to the nearest integer.
7. IF an Administrator provides an original price less than or equal to the current price, THEN THE Admin_Panel SHALL render a validation message and SHALL NOT persist the Product.
8. WHEN an Administrator enters a Store name that does not match any existing Store under case-insensitive comparison, THE System SHALL create a new Store record using that name.
9. WHEN an Administrator activates "Save as Draft", THE System SHALL persist the Product with inactive status.
10. WHEN an Administrator activates "Save & Publish", THE System SHALL persist the Product with active status.
11. THE Admin_Panel SHALL allow up to 4 additional Product images, each JPEG, PNG, or WebP and at most 5 MB, with drag-to-reorder ordering.
12. IF an Administrator uploads an additional image that is not JPEG, PNG, or WebP or exceeds 5 MB, THEN THE Admin_Panel SHALL reject the image and render a validation message.
13. THE Admin_Panel SHALL provide a rich-text editor for the Product full description supporting bold, italic, bullet lists, numbered lists, H2 and H3 headings, and tables.
14. THE Admin_Panel SHALL allow up to 8 key-feature bullet points per Product, each at most 120 characters.
15. WHEN an Administrator confirms a bulk activate, deactivate, or delete on selected Products, THE System SHALL apply the chosen action to all selected Products and render a confirmation reporting the count affected, requiring a confirmation prompt before any bulk delete.
16. WHEN an Administrator activates Export CSV on the Products list, THE System SHALL generate a UTF-8 CSV file of the listed Products containing the columns title, Store, Category, current price, original price, discount percentage, status, featured flag, and total clicks.

### Requirement 17: Deal Management

**User Story:** As an Administrator, I want to create and manage deals and coupons, so that visitors can find and redeem offers.

#### Acceptance Criteria

1. WHEN an authenticated Administrator requests `/admin/deals`, THE Admin_Panel SHALL render a table of Deals showing Store logo, Store name, headline truncated to 60 characters with an ellipsis, coupon code in monospace, discount badge, Category, expiry date, total clicks, a featured toggle, an active toggle, and edit, view, and delete controls.
2. WHERE a Deal expiry date is earlier than the current date, THE Admin_Panel SHALL render the expiry date in the error color; WHERE a Deal expiry date is within the next 7 days inclusive, THE Admin_Panel SHALL render the expiry date in the warning color.
3. WHEN an Administrator submits a Deal form with a headline of 1 to 120 characters, Store, Category, and a destination URL using the http or https scheme of at most 2048 characters all populated, THE System SHALL persist the Deal and render a success notification.
4. IF an Administrator submits a Deal form missing any of headline, Store, Category, or destination URL, or with a destination URL not using http or https, THEN THE Admin_Panel SHALL render a validation message identifying the invalid field, SHALL retain the entered values, and SHALL NOT persist the Deal.
5. THE Admin_Panel SHALL provide a deal-type selector offering exactly these four options: coupon code, direct deal, bank-card offer, and cashback deal.
6. WHERE the selected deal type is coupon code, THE Admin_Panel SHALL display a coupon code input field accepting 1 to 50 characters.
7. IF the selected deal type is coupon code and the coupon code field is empty on submission, THEN THE Admin_Panel SHALL render a validation message and SHALL NOT persist the Deal.
8. THE Admin_Panel SHALL provide Deal form fields for discount value, button label, terms and conditions, up to 5 how-to-use steps, valid-from date, valid-until date, minimum order value, maximum discount cap, and applicable-for options.
9. IF an Administrator submits a Deal with a valid-from date later than the valid-until date, THEN THE Admin_Panel SHALL render a validation message and SHALL NOT persist the Deal.
10. WHEN an Administrator confirms a bulk activate or deactivate on selected Deals, THE System SHALL apply the chosen action to all selected Deals and render a confirmation reporting the count affected.
11. WHEN an Administrator confirms a bulk delete on selected Deals through a confirmation prompt, THE System SHALL delete all selected Deals and render a confirmation reporting the count deleted.
12. IF an Administrator activates a bulk action with no Deals selected, THEN THE Admin_Panel SHALL render a message indicating that no Deals are selected and SHALL NOT modify any Deal.

### Requirement 18: Banner and Homepage Management

**User Story:** As an Administrator, I want to manage hero banners and homepage placement, so that I can promote priority content.

#### Acceptance Criteria

1. WHEN an authenticated Administrator requests `/admin/banners`, THE Admin_Panel SHALL render a table of Banners showing thumbnail, internal name, link destination, active status, drag-reorderable display order, and edit and delete controls.
2. WHEN an authenticated Administrator requests `/admin/banners` and no Banners exist, THE Admin_Panel SHALL render an empty-state message indicating that no Banners have been created.
3. WHEN an Administrator submits a Banner form with an internal name of 1 to 100 characters, a banner image in JPEG, PNG, or WebP format not exceeding 5 MB, and a link URL using the http or https scheme all populated, THE System SHALL persist the Banner.
4. IF an Administrator submits a Banner form missing an internal name, a banner image, or a link URL, OR with an internal name exceeding 100 characters, OR with a banner image that is not JPEG, PNG, or WebP or exceeds 5 MB, OR with a link URL that does not use the http or https scheme, THEN THE Admin_Panel SHALL render a validation message identifying the invalid field, SHALL retain all previously entered form values, and SHALL NOT persist the Banner.
5. THE Admin_Panel SHALL provide Banner form fields for an optional separate mobile image, optional headline text of up to 100 characters, optional CTA button text of up to 30 characters, a link target tab selectable as either same tab or new tab, display order, and status.
6. WHEN an Administrator reorders Banners via drag-and-drop and confirms the new arrangement, THE System SHALL persist the updated display order values.
7. WHEN the homepage is requested, THE Public_Site SHALL display only active Banners in the homepage hero carousel, ordered by ascending display order, showing at most 10 Banners.

### Requirement 19: Analytics

**User Story:** As an Administrator, I want analytics on clicks and searches, so that I can understand engagement without collecting personal data.

#### Acceptance Criteria

1. WHEN an authenticated Administrator requests `/admin/analytics`, THE Admin_Panel SHALL render a date-range selector offering today, 7 days, 30 days, 3 months, and a custom range of at most 366 days.
2. WHEN an Administrator selects a date range, THE System SHALL compute analytics using only Click_Events whose creation timestamp falls within the inclusive start and end of the selected range expressed in the Administrator's time zone.
3. IF an Administrator selects a custom range whose start is later than its end or whose span exceeds 366 days, THEN THE Admin_Panel SHALL render a validation message, SHALL retain the previous range, and SHALL NOT recompute analytics.
4. WHEN an Administrator selects a date range covering up to 1,000,000 Click_Events, THE System SHALL compute and render the analytics within 5 seconds, including overview cards for total clicks in the period, clicks today, the most-clicked Product, and the most-clicked Deal.
5. THE Admin_Panel SHALL render a daily clicks line chart, a clicks-by-type chart distinguishing Products from Deals, a clicks-by-device chart, and a clicks-by-Category chart for the selected period.
6. WHERE the selected period contains zero Click_Events, THE Admin_Panel SHALL render an empty-state indication in place of each chart and table.
7. THE Admin_Panel SHALL render a top Products table and a top Deals table, each showing at most 20 rows ordered by descending period clicks, displaying period clicks and all-time clicks, with each row linking to the public page.
8. WHERE search queries are logged, THE Admin_Panel SHALL render the top 20 queries by frequency and up to 20 queries that returned zero results.
9. WHEN an Administrator activates export for a selected date range covering up to 1,000,000 Click_Events, THE System SHALL generate a CSV file of the analytics data for that range within 10 seconds.
10. IF the analytics export fails or does not complete within 10 seconds, THEN THE Admin_Panel SHALL cancel the export and render an error indication.
11. THE System SHALL exclude all personally identifiable information from analytics views and exported CSV files.

### Requirement 20: Settings

**User Story:** As an Administrator, I want to configure site, SEO, social, affiliate, and account settings, so that I can control global behavior.

#### Acceptance Criteria

1. WHEN an authenticated Administrator submits the Site Settings form with all required fields valid, THE System SHALL persist the site name (1 to 100 characters), tagline (0 to 200 characters), logo image, favicon image, contact email (valid email format, 1 to 254 characters), and the admin email notifications flag (boolean), and SHALL display a success confirmation within 3 seconds.
2. IF an authenticated Administrator submits the Site Settings form with the site name empty, the site name or tagline exceeding its maximum length, or the contact email not matching a valid email format, THEN THE System SHALL reject the submission, SHALL NOT modify any persisted setting, and SHALL render a validation message identifying each invalid field.
3. WHEN an authenticated Administrator submits the SEO Settings form with all fields valid, THE System SHALL persist the default meta title suffix (0 to 70 characters), default meta description (0 to 160 characters), GA4 measurement identifier (0 to 50 characters), and search console verification code (0 to 200 characters), and SHALL display a success confirmation within 3 seconds.
4. WHEN an authenticated Administrator submits the Social Links form with each provided link being a valid absolute URL (0 to 2048 characters per link) for Facebook, Instagram, Twitter/X, and YouTube, THE System SHALL persist the provided links and SHALL display a success confirmation within 3 seconds.
5. WHEN the Public_Site renders the footer, THE Public_Site SHALL display only the social links that are populated and SHALL omit any link left empty.
6. IF an authenticated Administrator submits the Social Links form with any provided link that is not a valid absolute URL or exceeds 2048 characters, THEN THE System SHALL reject the submission, SHALL NOT modify any persisted link, and SHALL render a validation message identifying each invalid link.
7. WHEN an authenticated Administrator submits the Affiliate Settings form, THE System SHALL persist the default affiliate disclosure text (0 to 1000 characters) and SHALL display a success confirmation within 3 seconds.
8. WHEN an Administrator submits a password change in which the current password is verified and the new password satisfies the password policy (8 to 128 characters), THE System SHALL persist the new password as a bcrypt hash and SHALL display a success confirmation within 3 seconds.
9. IF an Administrator submits a password change with an incorrect current password, THEN THE System SHALL reject the change, SHALL retain the existing password unchanged, and SHALL render a validation message indicating the current password is incorrect.
10. IF an Administrator submits a password change in which the new password fails the password policy (fewer than 8 or more than 128 characters), THEN THE System SHALL reject the change, SHALL retain the existing password unchanged, and SHALL render a validation message indicating the new password does not meet the policy.

### Requirement 21: Public API Endpoints

**User Story:** As a Visitor's browser, I want public API endpoints for search, clicks, and contact, so that the website functions interactively.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/public/search` with a query parameter of 1 to 100 characters and an optional type parameter whose value is "product", "deal", or "all", THE Search_Service SHALL return up to 50 matching Products and Deals in the response body within 2 seconds.
2. WHERE a search request matches no Products or Deals, THE Search_Service SHALL return an empty result collection with a success response rather than an error.
3. WHEN a POST request is sent to `/api/public/click` with a type of "product" or "deal" and an identifier corresponding to an existing active record, THE Click_Service SHALL log the Click_Event and return the corresponding Affiliate_URL.
4. IF a POST request to `/api/public/click` references an identifier that corresponds to no existing active record, THEN THE Click_Service SHALL return a not-found response without logging a Click_Event.
5. WHEN a POST request is sent to `/api/public/contact` with a Name of 1 to 100 characters, an Email of at most 254 characters in valid email format, a Subject of 1 to 150 characters, and a Message of 1 to 2,000 characters, THE System SHALL persist a ContactMessage and trigger an admin notification email.
6. IF the admin notification email for a contact submission fails to send, THEN THE System SHALL retain the persisted ContactMessage.
7. IF a request to a public API endpoint contains a malformed or missing required parameter, THEN THE System SHALL return an HTTP 400 response identifying the invalid parameter without mutating any stored data.

### Requirement 22: Image Upload

**User Story:** As an Administrator, I want to upload images for categories, products, deals, banners, and settings, so that the public site displays visual content.

#### Acceptance Criteria

1. WHEN an authenticated Administrator sends an image of type JPEG, PNG, WebP, or GIF that is 1 byte to 5 MB in size to `/api/admin/upload`, THE System SHALL store the image and return an HTTP 200 response containing a publicly accessible URL that resolves to the stored image.
2. IF a request is sent to `/api/admin/upload` without valid Administrator authentication credentials, THEN THE System SHALL reject the request with an HTTP 401 response and SHALL NOT store any image.
3. IF a request is sent to `/api/admin/upload` with a file whose type is not JPEG, PNG, WebP, or GIF, THEN THE System SHALL reject the request with an HTTP 400 response containing an error indicating the file type is unsupported and SHALL NOT store the file.
4. IF a request is sent to `/api/admin/upload` with a file larger than 5 MB, THEN THE System SHALL reject the request with an HTTP 400 response containing an error indicating the file exceeds the maximum allowed size and SHALL NOT store the file.
5. IF a request is sent to `/api/admin/upload` with no file attached, THEN THE System SHALL reject the request with an HTTP 400 response containing an error indicating that a file is required.

### Requirement 23: Slug Generation and Round-Trip Integrity

**User Story:** As an Administrator, I want predictable, SEO-friendly slugs, so that public URLs remain stable and search-engine readable.

#### Acceptance Criteria

1. WHEN the System generates a Slug from a name or title, THE System SHALL produce a value of 1 to 200 characters containing only lowercase letters, digits, and hyphens, with non-allowed characters removed, runs of whitespace or removed characters collapsed to a single hyphen, and no leading, trailing, or consecutive hyphens.
2. IF the source name or title produces an empty value after sanitization, THEN THE System SHALL generate a non-empty fallback Slug.
3. THE System SHALL ensure each generated Product, Deal, and Category Slug is unique within its collection under case-sensitive exact comparison.
4. IF a derived Slug collides with an existing Slug in the same collection, THEN THE System SHALL append a hyphen followed by the smallest integer starting at 2 that yields a unique Slug, repeating until uniqueness is achieved while keeping the Slug within 200 characters.
5. WHEN a Visitor requests a page using a valid active entry's Slug, THE Public_Site SHALL resolve the request to the single active entry whose Slug exactly matches the requested Slug under case-sensitive comparison.
6. IF a Visitor requests a Slug that matches no active entry in the corresponding collection, THEN THE Public_Site SHALL return an HTTP 404 response and SHALL NOT resolve to any other entry.

### Requirement 24: SEO and Structured Data

**User Story:** As a site operator, I want strong on-page SEO, so that the site earns organic search traffic as its primary acquisition channel.

#### Acceptance Criteria

1. THE Public_Site SHALL render every public page using server-side rendering or static generation such that the complete HTML markup, including title, meta tags, and structured data, is present in the initial HTTP response body before any client-side JavaScript executes.
2. WHEN a request is made to `/sitemap.xml`, THE Sitemap_Generator SHALL return a valid XML sitemap listing every active Category, Product, and Deal, where each entry includes its absolute canonical URL, and SHALL exclude any Category, Product, or Deal that is inactive, deleted, or unpublished.
3. WHERE the count of active Categories, Products, and Deals exceeds 50,000, THE Sitemap_Generator SHALL split entries across multiple sitemap files of at most 50,000 URLs each and reference them from a sitemap index returned at `/sitemap.xml`.
4. IF the Sitemap_Generator cannot retrieve the list of active Categories, Products, or Deals, THEN THE Sitemap_Generator SHALL return an error response indicating the sitemap could not be generated, without returning a partial or empty sitemap as a successful response.
5. THE Public_Site SHALL serve a `robots.txt` that disallows crawling of `/admin` and `/api`.
6. THE Public_Site SHALL render exactly one canonical URL link element containing an absolute URL on every public page.
7. THE Public_Site SHALL render Open Graph title, description, image, and URL meta tags, each with a non-empty value, on every public page.
8. IF a page has no associated image, THEN THE Public_Site SHALL set the Open Graph image meta tag to a designated default site image so that the tag value is never empty.
9. THE Public_Site SHALL render Product JSON_LD structured data on Product pages, Offer JSON_LD on Deal pages, WebSite JSON_LD with a SearchAction on the homepage, and BreadcrumbList JSON_LD on Category and Product pages.
10. THE Public_Site SHALL render a non-empty alt attribute, containing between 1 and 125 characters that describe the image subject, on every content image, and SHALL render an empty alt attribute on every purely decorative image.
11. WHERE a listing page is paginated, THE Public_Site SHALL set the canonical URL of every page in the set to the absolute URL of the first page.
12. THE Public_Site SHALL include the Store name within every generated Product and Deal Slug, and SHALL generate each Slug as a unique, lowercase, URL-safe string.

### Requirement 25: Performance and Rendering

**User Story:** As a mobile Visitor on 4G, I want fast page loads, so that I can browse without delay.

#### Acceptance Criteria

1. WHEN the homepage is loaded on a 4G mobile connection, THE Public_Site SHALL achieve a Largest Contentful Paint of less than 2.5 seconds at the 75th percentile of measured page loads.
2. WHEN a Visitor performs any tap, click, or keyboard interaction on a public page, THE Public_Site SHALL achieve an Interaction to Next Paint of less than 100 milliseconds at the 75th percentile of measured interactions.
3. THE Public_Site SHALL maintain a Cumulative Layout Shift below 0.1 at the 75th percentile of measured page loads on every public page.
4. WHEN a public page is requested, THE Public_Site SHALL achieve a Time To First Byte of less than 400 milliseconds at the 75th percentile of measured requests.
5. THE Public_Site SHALL deliver no more than 150 kilobytes of gzipped JavaScript on the largest public page.
6. WHEN a content image is requested, THE Public_Site SHALL serve it in WebP format through the Next.js image pipeline.
7. IF the requesting browser does not support WebP, THEN THE Public_Site SHALL serve the image in an alternative raster format supported by the browser without returning an error.
8. THE Public_Site SHALL regenerate the homepage, Category pages, and Deal pages on a 300-second revalidation interval and Product pages on a 600-second revalidation interval.
9. IF regeneration of a public page fails, THEN THE Public_Site SHALL continue serving the most recently successfully generated version of that page without displaying an error to the Visitor.
10. THE Admin_Panel SHALL render its pages on the client.
11. THE Public_Site SHALL render the search results page using server-side rendering.

### Requirement 26: Design System Conformance

**User Story:** As a Visitor, I want a consistent, accessible visual design, so that the site feels trustworthy and is easy to use on mobile.

#### Acceptance Criteria

1. THE Public_Site SHALL apply the defined color tokens: background `#F8F8F6`, card `#FFFFFF`, primary text `#1A1A1A`, secondary text `#6B6B6B`, muted text `#9E9E9E`, border `#E8E8E5`, accent `#FF5722`, accent hover `#E64A19`, success `#2E7D32`, warning `#F57C00`, and error `#C62828`.
2. THE Admin_Panel SHALL render its sidebar using color value `#1E1E1E`.
3. THE System SHALL render text using the Inter font family.
4. IF the Inter font fails to load, THEN THE System SHALL render text using a system sans-serif fallback font.
5. THE Public_Site SHALL apply a 12px corner radius to cards, an 8px corner radius to buttons, inputs, and images, a pill radius of 100px to badges, and a 16px corner radius to modals.
6. THE Public_Site SHALL constrain primary content to a maximum width of 1200px.
7. WHILE the viewport width is below 768px, THE Public_Site SHALL render product card grids at 2 columns; WHILE the viewport width is from 768px to 1023px, THE Public_Site SHALL render product card grids at 3 columns; WHILE the viewport width is 1024px and above, THE Public_Site SHALL render product card grids at 4 columns.
8. WHEN an interactive element receives keyboard focus, THE Public_Site SHALL render a focus indicator of at least 2px thickness with a contrast ratio of at least 3:1 against the adjacent background, persisting for the duration of the focus.
9. THE Public_Site SHALL render normal-size text at a contrast ratio of at least 4.5:1 and large-size text and user-interface component boundaries at a contrast ratio of at least 3:1 against their backgrounds.
10. WHERE a Visitor's system requests reduced motion, THE Public_Site SHALL disable the hero carousel auto-advance and card hover transition animations while retaining instantaneous state changes required for interaction.

### Requirement 27: Data Retention and Privacy

**User Story:** As a privacy-conscious operator, I want anonymous-only tracking, so that the site complies with its stated privacy posture.

#### Acceptance Criteria

1. WHEN a Click_Event is recorded, THE System SHALL store it excluding personally identifiable information, where personally identifiable information includes full IP address, email address, full name, phone number, government identifier, and any browser-supplied user account identifier.
2. IF an incoming Click_Event payload contains a field classified as personally identifiable information, THEN THE System SHALL reject or strip that field before persistence and store only the non-identifying remainder.
3. WHERE a Click_Event time-to-live policy is configured, THE System SHALL delete every Click_Event whose stored creation timestamp is more than 90 days (7,776,000 seconds) before the current time.
4. WHERE a Click_Event time-to-live policy is configured, THE System SHALL execute the deletion process at least once every 24 hours.
5. THE System SHALL serve all public and admin pages over HTTPS.
6. IF a request for any public or admin page is received over HTTP, THEN THE System SHALL redirect the request to the equivalent HTTPS URL without serving page content over HTTP.
