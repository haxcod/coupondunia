'use client';

/**
 * ShowMoreDescription — the expand/collapse control for a Product's full
 * description (Req 6.8).
 *
 * The product detail page passes the complete description text. When it exceeds
 * {@link DESCRIPTION_PREVIEW_LIMIT} characters the component initially shows
 * only the first 300 characters followed by an ellipsis and a "Show more"
 * toggle; activating the toggle reveals the full text and swaps the control to
 * "Show less". When the description is at or below the limit the full text is
 * shown with no toggle.
 *
 * The description is rendered as **plain text** (whitespace preserved) rather
 * than via `dangerouslySetInnerHTML`, so admin-authored content can never inject
 * markup or script into the page.
 */
import { useState } from 'react';

export interface ShowMoreDescriptionProps {
  /** The full product description text. */
  description: string;
}

/** Initial visible length before the show-more toggle appears (Req 6.8). */
export const DESCRIPTION_PREVIEW_LIMIT = 300;

export function ShowMoreDescription({ description }: ShowMoreDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const text = description ?? '';
  const isLong = text.length > DESCRIPTION_PREVIEW_LIMIT;
  const visible = expanded || !isLong ? text : `${text.slice(0, DESCRIPTION_PREVIEW_LIMIT)}…`;

  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">
        {visible}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-2 cursor-pointer text-sm font-semibold text-accent transition-colors duration-200 hover:text-accent-hover"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}
