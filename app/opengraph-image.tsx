import { ImageResponse } from "next/og";

/**
 * Default site Open Graph image (Task 12.6, Req 24.8).
 *
 * This is the `app/opengraph-image` generated-image route convention from
 * Next 16: a route segment that default-exports a function returning an
 * `ImageResponse`. Next emits the `og:image` / `og:image:width` /
 * `og:image:height` / `og:image:type` / `og:image:alt` tags for it
 * automatically, and `lib/seo.ts` (`DEFAULT_OG_IMAGE_PATH = '/opengraph-image'`)
 * points the per-page metadata fallback here so the Open Graph image tag is
 * never empty when a page has no image of its own (Req 24.8).
 *
 * It renders a branded 1200×630 DealSpark card on the brand background. It uses
 * only static branding (no database, no request-time APIs) so it is statically
 * optimized at build time — keeping `next build` working without a database and
 * ensuring the image carries no affiliate/destination URLs (Req 7.9 / 24.1).
 */

// Image metadata — exported per the Next 16 `opengraph-image` convention.
export const alt = "DealSpark — Discover the best deals, coupons, and offers";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

// Brand tokens mirrored from app/globals.css (`@theme`).
const BRAND_BACKGROUND = "#f8f8f6";
const BRAND_FOREGROUND = "#1a1a1a";
const BRAND_SECONDARY = "#6b6b6b";
const BRAND_ACCENT = "#ff5722";
const BRAND_CARD = "#ffffff";

const SITE_NAME = "DealSpark";
const SITE_TAGLINE = "Discover the best deals, coupons, and offers from top stores.";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: BRAND_BACKGROUND,
          padding: "96px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand lockup: an accent spark mark + the wordmark. */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "112px",
              height: "112px",
              borderRadius: "28px",
              backgroundColor: BRAND_ACCENT,
              color: BRAND_CARD,
              fontSize: "72px",
              fontWeight: 800,
            }}
          >
            D
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "96px",
              fontWeight: 800,
              color: BRAND_FOREGROUND,
              letterSpacing: "-2px",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        {/* Tagline. */}
        <div
          style={{
            display: "flex",
            marginTop: "48px",
            maxWidth: "880px",
            fontSize: "44px",
            lineHeight: 1.25,
            fontWeight: 500,
            color: BRAND_SECONDARY,
          }}
        >
          {SITE_TAGLINE}
        </div>

        {/* Accent underline rule for visual balance. */}
        <div
          style={{
            display: "flex",
            marginTop: "56px",
            width: "200px",
            height: "12px",
            borderRadius: "6px",
            backgroundColor: BRAND_ACCENT,
          }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
