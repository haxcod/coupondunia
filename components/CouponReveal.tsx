'use client';

/**
 * CouponReveal — the coupon-code reveal + "COPY CODE" flow for the deal detail
 * page (Req 8.3/8.4/8.5/8.10/8.11).
 *
 * The deal's coupon code is already visible inside a dashed reveal block. The
 * single "COPY CODE" control:
 *   1. attempts `navigator.clipboard.writeText(code)`;
 *   2. on success, swaps the label to "COPIED ✓" for 2 seconds, then reverts it
 *      (Req 8.4);
 *   3. on clipboard failure, marks the code as user-selectable text and shows
 *      an error note that the automatic copy did not succeed (Req 8.10); and
 *   4. either way, triggers the destination open via the click endpoint.
 *
 * The destination open mirrors the deal-click policy of {@link ClickCTA}: it
 * POSTs `{ type: 'deal', id }` to `/api/public/click` (the only place the
 * destination URL ever reaches the browser, Req 7.9 / 8.5), stops blocking the
 * Visitor after 3 seconds while the request keeps running, and opens the
 * returned URL in a new tab — falling back to an explicit anchor when the popup
 * is blocked (Req 8.11 / 7.8).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CouponRevealProps {
  /** Deal identifier sent as `id` to the click endpoint. */
  dealId: string;
  /** The coupon code to reveal and copy. */
  couponCode: string;
}

/** The click endpoint that resolves and logs the destination (Req 8.5/9.4). */
const CLICK_ENDPOINT = '/api/public/click';
/** Deal click budget before we stop blocking the Visitor (Req 8.11). */
const DEAL_TIMEOUT_MS = 3_000;
/** How long the "COPIED ✓" label stays before reverting (Req 8.4). */
const COPIED_RESET_MS = 2_000;

interface ClickResponseBody {
  url?: unknown;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function CouponReveal({ dealId, couponCode }: CouponRevealProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  // Guards against overlapping destination requests from rapid re-activation.
  const inFlight = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  /** Open the resolved destination, falling back to an anchor if blocked (Req 7.8). */
  const openDestination = useCallback((url: string) => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      setFallbackUrl(url);
    }
  }, []);

  /**
   * Resolve + open the deal destination. Stops blocking after 3s; the request
   * keeps running and opens the destination as soon as it resolves (Req 8.11).
   */
  const triggerDestination = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    setFallbackUrl(null);

    let settled = false;
    const timer = setTimeout(() => {
      // Req 8.11: stop blocking the Visitor; the in-flight request continues.
      setOpening(false);
    }, DEAL_TIMEOUT_MS);

    fetch(CLICK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'deal', id: dealId }),
    })
      .then(async (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!response.ok) return;
        const body = (await response.json()) as ClickResponseBody;
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        if (url) {
          openDestination(url);
        }
      })
      .catch(() => {
        // Network error: there is no URL to open. Stop blocking (Req 8.11).
        if (settled) return;
        settled = true;
        clearTimeout(timer);
      })
      .finally(() => {
        setOpening(false);
        inFlight.current = false;
      });
  }, [dealId, openDestination]);

  const handleCopy = useCallback(async () => {
    // Req 8.4 / 8.10: attempt the clipboard write, then open the destination
    // regardless of whether the copy succeeded.
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(couponCode);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (copied) {
      setCopyState('copied');
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
    } else {
      // Req 8.10: surface the code as selectable text with an error indication.
      setCopyState('failed');
    }

    triggerDestination();
  }, [couponCode, triggerDestination]);

  const copyFailed = copyState === 'failed';
  const buttonLabel =
    copyState === 'copied' ? 'COPIED ✓' : opening ? 'Opening…' : 'COPY CODE';

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-secondary">
        Coupon code
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {/* Reveal block — the code is always visible; on clipboard failure it
            is explicitly user-selectable so it can be copied manually (Req 8.10). */}
        <div className="flex flex-1 items-center justify-center rounded-control border border-dashed border-border bg-background px-4 py-3">
          <code
            className={`font-mono text-lg font-bold tracking-widest text-foreground ${
              copyFailed ? 'select-text' : ''
            }`}
          >
            {couponCode}
          </code>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          aria-live="polite"
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {buttonLabel}
        </button>
      </div>

      {copyFailed ? (
        <p role="alert" className="mt-2 text-sm text-error">
          We couldn&apos;t copy the code automatically. Select the code above and
          copy it manually.
        </p>
      ) : null}

      {fallbackUrl ? (
        <p role="status" className="mt-2 text-sm text-secondary">
          Your browser blocked the new tab.{' '}
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer font-semibold text-accent underline hover:text-accent-hover"
          >
            Open the store
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
