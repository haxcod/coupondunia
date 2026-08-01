/**
 * Analytics date-range schema (Req 19.1, 19.2, 19.3).
 *
 * The selector offers presets (today / 7d / 30d / 3 months) and a custom range.
 * A custom range is valid only when start ≤ end and the span is ≤ 366 days.
 * Dates are coerced so ISO strings (from query params/forms) and Date objects
 * both validate identically on client and server.
 */
import { z } from 'zod';
import { MAX_RANGE_DAYS, dayspan } from './primitives';

/** Date-range presets surfaced by the analytics selector (Req 19.1). */
export const analyticsPresetSchema = z.enum([
  'today',
  '7d',
  '30d',
  '3months',
  'custom',
]);

export type AnalyticsPreset = z.infer<typeof analyticsPresetSchema>;

/** A start/end range with ordering and ≤366-day span enforced (Req 19.2/19.3). */
export const dateRangeSchema = z
  .object({
    start: z.coerce.date({ message: 'A valid start date is required.' }),
    end: z.coerce.date({ message: 'A valid end date is required.' }),
  })
  .superRefine((value, ctx) => {
    if (value.start.getTime() > value.end.getTime()) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Range start must be on or before range end.',
      });
      return;
    }
    if (dayspan(value.start, value.end) > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `Range span must not exceed ${MAX_RANGE_DAYS} days.`,
      });
    }
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;
