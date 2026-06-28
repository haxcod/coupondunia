'use client';

/**
 * ClickCTA — shared click handler for "VIEW DEAL →" / "GET COUPON CODE" style
 * affiliate activations (Task 10.4).
 *
 * Implements the click sequence from design "Click flow":
 *   1. POST `{ type, id }` to `/api/public/click` (the only place an
 *      Affiliate_URL ever reaches the browser — it is never embedded in the
 *      server-rendered markup, Req 7.9).
 *   2. On `200 { url }`, open the returned URL in a new tab while retaining the
 *      current tab (Req 2.8, 7.6). If the browser blocks the popup, surface an
 *      explicit destination anchor the Visitor can click (Req 7.8).
 *
 * The product-vs-deal timeout asymmetry is the core of this component:
 *   - product (Req 7.7): if the request fails or does not resolve within 5s,
 *     abort it, inform the Visitor the link could not be opened, and do NOT
 *     navigate away.
 *   - deal (Req 8.5/8.11): if the request does not resolve within 3s, stop
 *     blocking the Visitor; the request keeps running and the destination opens
 *     as soon as it resolves (best-effort), falling back to the explicit anchor
 *     when the late `window.open` is popup-blocked.
 *
 * When `disabled` (e.g. a Product with no Affiliate_URL, Req 2.9) the control
 * renders inert and never issues a request or opens a tab.
 */

import { useCallback, useRef, useState } from 'react';

/** Discriminates the timeout/feedback policy and the POST `type` field. */
export type ClickKind = 'product' | 'deal';

export interface ClickCTAProps {
  /** Selects timeout behavior and the `type` sent to the click endpoint. */
  kind: ClickKind;
  /** Product or Deal identifier; sent as `id` in the request body. */
  id: string;
  /** Visible button text, e.g. "VIEW DEAL →". */
  label: string;
  /** Renders the control inert (no request, no navigation) — Req 2.9. */
  disabled?: boolean;
  /** Optional extra classes appended to the button. */
  className?: string;
}

/** Per-type request budgets (design "Click flow", Req 7.7 / 8.11). */
const PRODUCT_TIMEOUT_MS = 5_000;
const DEAL_TIMEOUT_MS = 3_000;

const CLICK_ENDPOINT = '/api/public/click';

/** The endpoint returns `200 { url }` on success (Req 7.5 / 9.4). */
interface ClickResponseBody {
  url?: unknown;
}

type Feedback =
  | { kind: 'idle' }
  | { kind: 'error' }
  | { kind: 'fallback'; url: string };

const baseButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-control px-5 py-2.5 ' +
  'text-sm font-semibold transition-colors duration-200 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 select-none';

const enabledClasses =
  'cursor-pointer bg-accent text-white hover:bg-accent-hover';

const disabledClasses =
  'cursor-not-allowed bg-border text-muted';

export default function ClickCTA({
  kind,
  id,
  label,
  disabled = false,
  className,
}: ClickCTAProps) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  // Guards against overlapping requests from rapid re-activation.
  const inFlight = useRef(false);

  /**
   * Open the resolved destination in a new tab. A blocked popup returns a
   * falsy handle, so we fall back to an explicit anchor (Req 7.8).
   */
  const openDestination = useCallback((url: string) => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) {
      setFeedback({ kind: 'idle' });
    } else {
      setFeedback({ kind: 'fallback', url });
    }
  }, []);

  const handleActivate = useCallback(async () => {
    if (disabled || inFlight.current) return;

    inFlight.current = true;
    setLoading(true);
    setFeedback({ kind: 'idle' });

    const isProduct = kind === 'product';
    const timeoutMs = isProduct ? PRODUCT_TIMEOUT_MS : DEAL_TIMEOUT_MS;
    // Products abort on timeout; deals keep running in the background.
    const controller = isProduct ? new AbortController() : null;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      if (isProduct) {
        // Req 7.7: give up, inform the Visitor, never navigate away.
        settled = true;
        controller?.abort();
        setFeedback({ kind: 'error' });
        setLoading(false);
        inFlight.current = false;
      } else {
        // Req 8.11: stop blocking; the request keeps going and will open the
        // destination as soon as it resolves.
        setLoading(false);
      }
    }, timeoutMs);

    try {
      const response = await fetch(CLICK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: kind, id }),
        signal: controller?.signal,
      });

      // A product request that already timed out has been handled above.
      if (settled && isProduct) return;
      settled = true;
      clearTimeout(timer);

      if (!response.ok) {
        // No destination available — inform the Visitor (Req 7.7) and do not
        // navigate. There is no URL to "open anyway" for deals here.
        setFeedback({ kind: 'error' });
        return;
      }

      const body = (await response.json()) as ClickResponseBody;
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (url) {
        openDestination(url);
      } else {
        setFeedback({ kind: 'error' });
      }
    } catch {
      // Network error or aborted product request.
      if (settled && isProduct) return;
      settled = true;
      clearTimeout(timer);
      // Req 7.7 (product) and the failed-request case for deals: there is no
      // URL to open, so inform the Visitor without navigating.
      setFeedback({ kind: 'error' });
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [disabled, kind, id, openDestination]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleActivate}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        className={`${baseButtonClasses} ${
          disabled ? disabledClasses : enabledClasses
        } w-full`}
      >
        {loading ? (
          <>
            <Spinner />
            <span>Opening…</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </button>

      {feedback.kind === 'error' && (
        <p role="alert" className="mt-2 text-sm text-error">
          We couldn&apos;t open the link. Please try again.
        </p>
      )}

      {feedback.kind === 'fallback' && (
        <p role="status" className="mt-2 text-sm text-secondary">
          Your browser blocked the new tab.{' '}
          <a
            href={feedback.url}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer font-semibold text-accent underline hover:text-accent-hover"
          >
            Open the link
          </a>
          .
        </p>
      )}
    </div>
  );
}

/** Inline SVG loading spinner (no emoji; honors reduced-motion via CSS). */
function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
