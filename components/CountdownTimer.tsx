import { CountdownTimerClient } from "./CountdownTimerClient";

/*
 * CountdownTimer (Server Component) — Req 6.5/6.6 (product offer expiry) and
 * Req 8.6/8.12 (deal expiry).
 *
 * This is intentionally a Server Component (no `'use client'`). It resolves the
 * expiry instant and computes the *initial* remaining time once, on the server,
 * then hands those concrete values to a small client subcomponent. Because the
 * first paint is produced from server-computed props (not from a client-side
 * `Date.now()` read during render), the days/hours/minutes/seconds are present
 * in the initial HTML — avoiding both Cumulative Layout Shift and a hydration
 * mismatch. The client subcomponent hydrates with these exact values as its
 * initial state and only then begins ticking once per second.
 */

export interface CountdownTimerProps {
  /** The expiry instant, as a `Date` or an ISO-8601 string. */
  expiry: Date | string;
  /**
   * Optional server-computed reference "now" in epoch milliseconds. Supplying
   * this from the rendering page keeps the initial countdown deterministic and
   * aligned with the page's server time. Defaults to the server's `Date.now()`.
   */
  nowMs?: number;
  /** Accessible/visible label describing what is counting down. */
  label?: string;
  /** Message shown once the expiry instant is reached. */
  expiredLabel?: string;
  /** Optional extra classes for the outer container. */
  className?: string;
}

function toEpochMs(expiry: Date | string): number {
  return expiry instanceof Date ? expiry.getTime() : new Date(expiry).getTime();
}

export function CountdownTimer({
  expiry,
  nowMs,
  label = "Offer ends in",
  expiredLabel = "This offer has expired",
  className,
}: CountdownTimerProps) {
  const expiryMs = toEpochMs(expiry);

  // Guard against an unparseable expiry: render the expired state rather than
  // ticking against NaN. Callers normally only mount this when expiry is valid
  // and in the future (Req 6.5) or within 7 days (Req 8.6).
  if (Number.isNaN(expiryMs)) {
    return (
      <CountdownTimerClient
        expiryMs={0}
        initialRemainingMs={0}
        label={label}
        expiredLabel={expiredLabel}
        className={className}
      />
    );
  }

  const reference = nowMs ?? Date.now();
  const initialRemainingMs = expiryMs - reference;

  return (
    <CountdownTimerClient
      expiryMs={expiryMs}
      initialRemainingMs={initialRemainingMs}
      label={label}
      expiredLabel={expiredLabel}
      className={className}
    />
  );
}
