'use client';

/**
 * Client-only 1:1 product image with lazy loading and a placeholder fallback.
 *
 * `next/image` handles the lazy-loading + responsive `srcset`; this thin client
 * wrapper exists solely so we can react to a load failure (`onError`) and swap
 * in an in-DOM SVG placeholder occupying the same 1:1 container (Req 2.6, 2.7).
 * The parent supplies a `position: relative` square so `fill` can size to it.
 */
import { useState } from 'react';
import Image from 'next/image';

interface ProductCardImageProps {
  src: string;
  /** Accessible description — the product title (Req 2.1, a11y). */
  alt: string;
}

export function ProductCardImage({ src, alt }: ProductCardImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="flex h-full w-full items-center justify-center bg-background text-muted"
      >
        {/* Heroicons "photo" outline — decorative placeholder glyph. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
          className="h-12 w-12"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      loading="lazy"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
