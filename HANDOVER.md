# handover notes — whats done and whats left

quick note before anyone picks this up. the frontend is fully built out to match the coupon saga design and everything that could be wired to the data we already have IS wired. this file is just me being honest about the parts that still need a backend piece that we dont have yet, so nobody has to go hunting for them. i kept the hints short on purpose, just a pointer each, not a full solution.

## whats actually working rn

so you know the baseline, all of this is real and pulling from mongo:

- home, categories, category pages, product detail, deal detail, the deals listing, stores directory and search all render live data
- the deals page filters (category / coupon type / discount / expiring) are real. they run server side off the url query, not fake dropdowns
- stores directory pagination is real (`?page=`)
- the affiliate click flow is the important one and it works. "get code" / "shop now" / "copy code" all POST to `/api/public/click`, it increments the counter atomically and hands back the destination url. the url is never sitting in the html. this is the money path so i tested it end to end (valid deal -> 200, junk id -> 404)
- contact form actually saves to the db. tested it through the ui, you get the green "message sent" and it clears
- the whole admin panel at `/admin` is full crud (products, deals, categories, stores, banners, settings) plus the click analytics dashboard
- mobile menu, responsive layouts, back to top, all good

## stuff thats not wired yet

these are buttons/bits that look real in the ui but dont have a backend behind them yet. none of them are broken, they just need a piece we dont have. i left them in because they match the design and you'll probably want them later.

1. **login + join free** (top right of the header)
   needs an actual user accounts system (signup / login / session). the admin side already signs a session cookie with `SESSION_SECRET`, so theres a pattern to copy for public users instead of building it from scratch.

2. **subscribe** (the "deals delivered to your inbox" block, shows on most pages)
   needs a subscribers collection and the button to POST the email somewhere. easiest path is to just copy how the contact form works (validate -> POST to a public api route -> save the doc).

3. **notify me** (the "get [store] alerts" box on the stores page)
   same subscribers idea as above, just tied to one store. once #2 exists this is basically the same thing with a store id attached.

4. **the little heart on the store cards** (wishlist)
   this one needs accounts first (a wishlist has to belong to someone). so its blocked on #1. after that its a saved-stores list per user.

5. **the two filter dropdowns on the stores page** ("all categories" / "all coupon types")
   right now theyre just for show. good news is the deals page already does real filtering off url params, so you can lift that same approach here, make the dropdowns set `?category=` / `?type=` and filter the grid server side.

6. **blog cards** (editors picks + latest articles on the /blogs page)
   theres no blog model in the data layer yet so those cards are the design's own sample articles and they dont click through to anything. needs a blog model + a `/blog/[slug]` page. the deal/product detail pages are a decent template for the article page, and the seam to swap is the `PICKS` and `ARTICLES` arrays sitting at the top of `app/blogs/page.tsx`.

7. **no per-store pages yet**
   store cards currently link to a store-filtered search (`/search?q=name`) which works fine. a proper `/store/[slug]` page would be nicer down the line but its not urgent.

## placeholder copy (not broken, just heads up)

a few numbers/text bits are baked in from the figma comp, not live data. fine to ship but worth swapping when the real data exists:

- the "1,245 users" and the generic about-store paragraph on the stores page
- the blog article dates / authors / read times

## what you need to actually take it live

this is the part that matters most for you since you own the backend. all the env vars are documented in `.env.example`, but the short version:

- **mongodb has to be a replica set.** atlas already is one by default. the click tracking uses transactions so a plain standalone `mongod` will not work, it'll throw. this is the one thing that isnt optional.
- **smtp is optional.** without it the contact form still saves the message (you can read them in admin), it just wont send the notification email. set `SMTP_*` + `CONTACT_NOTIFICATION_EMAIL` to turn that on.
- **s3 (or any s3-compatible storage) is optional.** only the admin image upload needs it. set `S3_BUCKET` + the keys. the seed uses placeholder images so the site renders fine without it.
- **set `NEXT_PUBLIC_SITE_URL` in prod** so the canonical / og / sitemap urls point at the right domain.

## running it

`README.md` has the real setup steps. tldr: `npm install`, copy `.env.example` to `.env.local` and fill it, `npm run seed`, `npm run dev`. tests are `npm test` (they spin up their own in-memory mongo, no setup needed).

thats everything. the site is in good shape to ship, the only gaps are the account/subscriber/blog features which all need backend we havent built. shout if any of the seams above arent clear.
