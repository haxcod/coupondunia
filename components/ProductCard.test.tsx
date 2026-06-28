// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// next/image renders an <img>-incompatible component outside the Next runtime,
// so stub it with a plain <img> that forwards the props the card relies on
// (src, alt, loading, onError). This keeps the lazy-load + fallback assertions
// honest while staying framework-agnostic.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, loading, onError, fill, sizes, ...rest }: any) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      src={typeof src === 'string' ? src : ''}
      alt={alt}
      loading={loading}
      onError={onError}
      data-fill={fill ? 'true' : undefined}
      {...rest}
    />
  ),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

import { ProductCard } from './ProductCard';
import { ProductCardImage } from './ProductCardImage';
import type { ProductCardDTO } from '@/lib/catalog';

function makeProduct(overrides: Partial<ProductCardDTO> = {}): ProductCardDTO {
  return {
    id: 'p1',
    title: 'Wireless Noise-Cancelling Headphones',
    slug: 'wireless-headphones',
    storeName: 'Sound Co',
    storeLogoUrl: null,
    currentPrice: 499900,
    originalPrice: 999900,
    discountPercent: 50,
    primaryImageUrl: 'https://cdn.example.com/img.jpg',
    hasAffiliateUrl: true,
    ...overrides,
  };
}

beforeEach(() => cleanup());

describe('ProductCard (Req 2.1, 2.7, 2.9)', () => {
  it('applies the 12px card radius and drop shadow classes (Req 2.1)', () => {
    const { container } = render(<ProductCard product={makeProduct()} />);
    const article = container.querySelector('article')!;
    expect(article).toBeInTheDocument();
    expect(article.className).toContain('rounded-card');
    // Drop shadow at rest, deeper shadow on hover — shadow present, no layout shift.
    expect(article.className).toContain('shadow-sm');
    expect(article.className).toContain('hover:shadow-md');
  });

  it('truncates the title to 2 lines (Req 2.1)', () => {
    render(<ProductCard product={makeProduct()} />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.className).toContain('line-clamp-2');
  });

  it('shows an integer % discount badge when a discount is present (Req 2.4)', () => {
    render(<ProductCard product={makeProduct({ discountPercent: 37 })} />);
    expect(screen.getByText('37%')).toBeInTheDocument();
  });

  it('hides the discount badge when there is no discount', () => {
    render(<ProductCard product={makeProduct({ discountPercent: null })} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('renders the original price with strikethrough when higher than current (Req 2.3)', () => {
    const { container } = render(<ProductCard product={makeProduct()} />);
    const struck = container.querySelector('.line-through');
    expect(struck).toBeInTheDocument();
  });

  it('renders an enabled VIEW DEAL link when an affiliate URL exists', () => {
    render(<ProductCard product={makeProduct({ hasAffiliateUrl: true })} />);
    // No disabled button is rendered in the CTA region.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a disabled, non-navigating CTA when there is no affiliate URL (Req 2.9)', () => {
    render(<ProductCard product={makeProduct({ hasAffiliateUrl: false })} />);
    const cta = screen.getByRole('button', { name: /view deal/i });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('aria-disabled', 'true');
    expect(cta.className).toContain('cursor-not-allowed');
  });
});

describe('ProductCardImage lazy load + placeholder (Req 2.6, 2.7)', () => {
  it('lazy-loads the product image', () => {
    render(<ProductCardImage src="https://cdn.example.com/img.jpg" alt="A product" />);
    const img = screen.getByAltText('A product') as HTMLImageElement;
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('swaps to an accessible placeholder when the image fails to load (Req 2.7)', () => {
    render(<ProductCardImage src="https://cdn.example.com/broken.jpg" alt="Broken product" />);
    const img = screen.getByAltText('Broken product');
    fireEvent.error(img);
    // After error the <img> is replaced by a role="img" placeholder.
    const placeholder = screen.getByRole('img', { name: 'Broken product' });
    expect(placeholder.tagName).not.toBe('IMG');
  });

  it('renders the placeholder immediately when src is empty', () => {
    render(<ProductCardImage src="" alt="No image" />);
    const placeholder = screen.getByRole('img', { name: 'No image' });
    expect(placeholder.tagName).toBe('DIV');
  });
});
