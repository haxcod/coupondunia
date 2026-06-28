import type { NextConfig } from "next";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

/**
 * Build the `next/image` remote allowlist (Req: homepage/product imagery).
 *
 * Product/banner/store images are admin-uploaded to S3-compatible object
 * storage and served from a CDN host that is only known at runtime via
 * `S3_PUBLIC_BASE_URL`. We therefore:
 *
 *   1. Add a tightly scoped pattern for the configured storage origin when
 *      `S3_PUBLIC_BASE_URL` is set (exact protocol/host/port, any path), so the
 *      optimizer trusts our own bucket explicitly; and
 *   2. Add a general `https` wildcard-hostname pattern as a fallback so images
 *      from arbitrary admin-configured CDNs still render in every environment
 *      (including local/dev where the env var may be absent).
 *
 * Security note: the wildcard-host fallback is deliberately permissive but is
 * constrained to the `https` scheme. It widens the set of hosts the image
 * optimizer will proxy; tightening it to known CDN hosts is recommended for a
 * hardened production deployment, but the open set of admin-configurable image
 * hosts makes an exact allowlist impractical here.
 */
function buildRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = [];

  const base = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      const url = new URL(base);
      const protocol = url.protocol.replace(/:$/, "");
      if (protocol === "http" || protocol === "https") {
        patterns.push({
          protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          pathname: "/**",
        });
      }
    } catch {
      // Malformed S3_PUBLIC_BASE_URL — fall through to the https wildcard.
    }
  }

  // General fallback: any https host, any path (see security note above).
  patterns.push({ protocol: "https", hostname: "**", pathname: "/**" });

  return patterns;
}

const nextConfig: NextConfig = {
  // Cache Components (PPR) enables the `use cache` directive plus
  // `cacheLife`/`cacheTag`, and makes Partial Prerendering the default in the
  // App Router. This underpins the static SEO shell + ISR caching model the
  // DealSpark design relies on (Req 24.1, 25.8).
  cacheComponents: true,

  images: {
    remotePatterns: buildRemotePatterns(),
  },
};

export default nextConfig;
