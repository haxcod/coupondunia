/*
 * Coupon Saga brand lockup — the tilted ticket mark + wordmark ("Coupon" in
 * ink, "Saga" in the brand purple). `tone="light"` flips it for the purple
 * footer. Renders as a home link by default; pass `href={null}` for a bare mark.
 */
import Link from 'next/link';

interface LogoProps {
  tone?: 'dark' | 'light';
  href?: string | null;
  className?: string;
}

function TicketMark({ tone }: { tone: 'dark' | 'light' }) {
  const ticket = tone === 'light' ? '#ffffff' : 'var(--color-accent)';
  const glyph = tone === 'light' ? 'var(--color-accent)' : '#ffffff';
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden="true">
      <g transform="rotate(-8 20 20)">
        <rect x="4" y="10" width="32" height="20" rx="5" fill={ticket} />
        <rect
          x="8"
          y="14"
          width="24"
          height="12"
          rx="3"
          fill="none"
          stroke={glyph}
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.9"
        />
        <text
          x="20"
          y="25"
          textAnchor="middle"
          fontSize="15"
          fontStyle="italic"
          fontWeight="800"
          fill={glyph}
          fontFamily="var(--font-sans)"
        >
          S
        </text>
      </g>
    </svg>
  );
}

export function Logo({ tone = 'dark', href = '/', className }: LogoProps) {
  const inner = (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <TicketMark tone={tone} />
      <span className="text-xl font-extrabold tracking-tight">
        <span className={tone === 'light' ? 'text-white' : 'text-foreground'}>
          Coupon
        </span>
        <span className={tone === 'light' ? 'text-white' : 'text-accent'}>
          {' '}
          Saga
        </span>
      </span>
    </span>
  );

  if (!href) return inner;

  return (
    <Link href={href} aria-label="Coupon Saga home" className="inline-flex">
      {inner}
    </Link>
  );
}
