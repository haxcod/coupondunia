"use client";

import { useEffect, useState } from "react";

/*
 * CountdownTimerClient — the ticking half of CountdownTimer.
 *
 * It hydrates with the server-computed `initialRemainingMs` as its initial
 * state, so its first client render is byte-identical to the server HTML
 * (no hydration mismatch, no layout shift). After mounting it ticks once per
 * second, recomputing the remainder from the absolute `expiryMs` so drift and
 * background-tab throttling never accumulate. On reaching expiry it stops the
 * interval and swaps to the expired message (Req 6.6 / 8.12).
 */

interface CountdownTimerClientProps {
  /** Expiry instant in epoch milliseconds. */
  expiryMs: number;
  /** Server-computed remaining milliseconds at render time. */
  initialRemainingMs: number;
  /** Accessible/visible label describing what is counting down. */
  label: string;
  /** Message shown once the expiry instant is reached. */
  expiredLabel: string;
  /** Optional extra classes for the outer container. */
  className?: string;
}

interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const SECOND = 1000;

function splitRemaining(remainingMs: number): TimeParts {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / SECOND));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function describe(parts: TimeParts): string {
  return `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds remaining`;
}

export function CountdownTimerClient({
  expiryMs,
  initialRemainingMs,
  label,
  expiredLabel,
  className,
}: CountdownTimerClientProps) {
  // Clamp at zero so the very first paint can already show the expired state
  // when the server determined the offer was over.
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, initialRemainingMs),
  );

  useEffect(() => {
    // Already expired: nothing to tick.
    if (expiryMs - Date.now() <= 0) {
      setRemainingMs(0);
      return;
    }

    const tick = () => {
      const next = expiryMs - Date.now();
      if (next <= 0) {
        setRemainingMs(0);
        window.clearInterval(intervalId);
        return;
      }
      setRemainingMs(next);
    };

    // Re-sync immediately on mount, then once per second.
    tick();
    const intervalId = window.setInterval(tick, SECOND);
    return () => window.clearInterval(intervalId);
  }, [expiryMs]);

  const containerClass = ["flex flex-col gap-2", className]
    .filter(Boolean)
    .join(" ");

  if (remainingMs <= 0) {
    return (
      <div className={containerClass}>
        <p
          role="status"
          aria-live="polite"
          className="text-sm font-semibold text-error"
        >
          {expiredLabel}
        </p>
      </div>
    );
  }

  const parts = splitRemaining(remainingMs);
  const units: Array<{ key: keyof TimeParts; label: string }> = [
    { key: "days", label: "Days" },
    { key: "hours", label: "Hrs" },
    { key: "minutes", label: "Min" },
    { key: "seconds", label: "Sec" },
  ];

  return (
    <div className={containerClass}>
      <span className="text-xs font-medium uppercase tracking-wide text-secondary">
        {label}
      </span>
      {/*
       * role="timer" carries an implicit aria-live="off", so the per-second
       * updates do not spam assistive tech. The aria-label gives a single
       * human-readable summary of the remaining time.
       */}
      <div
        role="timer"
        aria-label={`${label}: ${describe(parts)}`}
        className="flex items-end gap-1.5"
      >
        {units.map((unit, index) => (
          <div key={unit.key} className="flex items-end gap-1.5">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="inline-flex min-w-[2.5ch] justify-center rounded-control bg-card px-2 py-1.5 text-lg font-bold tabular-nums text-foreground shadow-sm ring-1 ring-border"
              >
                {pad(parts[unit.key])}
              </span>
              <span
                aria-hidden="true"
                className="mt-1 text-[0.625rem] font-medium uppercase tracking-wide text-muted"
              >
                {unit.label}
              </span>
            </div>
            {index < units.length - 1 ? (
              <span
                aria-hidden="true"
                className="pb-5 text-lg font-bold text-muted"
              >
                :
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
