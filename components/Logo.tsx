/*
 * Coupon Saga brand lockup — the tilted ticket mark + wordmark ("Coupon" in
 * ink, "Saga" in the brand purple). `tone="light"` flips it for the purple
 * footer. Renders as a home link by default; pass `href={null}` for a bare mark.
 */
import Link from 'next/link';
import Image from 'next/image';

interface LogoProps {
  tone?: 'dark' | 'light';
  href?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { width: 80, height: 30, className: 'h-7 w-auto' },
  md: { width: 104, height: 39, className: 'h-9 w-auto' },
  lg: { width: 128, height: 48, className: 'h-11 w-auto' },
};

export function Logo({
  tone = 'dark',
  href = '/',
  className = '',
  size = 'md',
}: LogoProps) {
  const currentSize = SIZES[size] ?? SIZES.md;
  const src = '/logo.png';

  const inner = (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src={src}
        alt="Coupon Saga"
        width={currentSize.width}
        height={currentSize.height}
        className={`${currentSize.className} object-contain`}
        priority
      />
    </span>
  );

  if (!href) return inner;

  return (
    <Link
      href={href}
      aria-label="Coupon Saga home"
      className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {inner}
    </Link>
  );
}
