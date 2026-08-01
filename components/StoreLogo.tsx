'use client';

/**
 * StoreLogo — a circular store avatar with a graceful first-letter fallback.
 *
 * Requirement 3.2 mandates that when a store logo image fails to load, the card
 * must render "a placeholder containing the first character of the Store name in
 * place of the logo". Detecting a load failure requires the browser `error`
 * event, so this is necessarily a Client Component; it is kept deliberately tiny
 * and is reused by both `CouponCard` (40px) and `ProductCard`.
 *
 * **Why a native `<img>` and not `next/image`?** Store logos are arbitrary,
 * admin-configured object-storage URLs from an open-ended set of CDN hosts.
 * `next/image` requires every remote host to be pre-declared in the
 * `images.remotePatterns` allowlist, which cannot bound an unknown host set, and
 * its optimizer offers little benefit for a 40px avatar. A native `<img>` with
 * `loading="lazy"` and an `onError` fallback is the appropriate tool here.
 */
import { useState } from 'react';

export interface StoreLogoProps {
  /** Store name; also the source of the first-letter fallback (Req 3.2). */
  name: string;
  /** Logo URL, or null when the store has no configured logo. */
  logoUrl: string | null;
  /** Diameter in pixels. Defaults to 40 to match the Coupon_Card (Req 3.1). */
  size?: number;
}

export function StoreLogo({ name, logoUrl, size = 40 }: StoreLogoProps) {
  const [errored, setErrored] = useState(false);

  const trimmedName = name.trim();
  const fallbackChar = (trimmedName.charAt(0) || '?').toUpperCase();
  const hasUsableLogo =
    logoUrl !== null && logoUrl.trim().length > 0 && !errored;
  const dimension = `${size}px`;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background"
      style={{ width: dimension, height: dimension }}
    >
      {hasUsableLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote CDN hosts + required onError fallback (see file header).
        <img
          src={logoUrl as string}
          alt={`${trimmedName || 'Store'} logo`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="select-none font-semibold leading-none text-secondary"
          style={{ fontSize: `${Math.round(size * 0.4)}px` }}
        >
          {fallbackChar}
        </span>
      )}
    </span>
  );
}
