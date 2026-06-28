// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, fill, sizes, priority, ...rest }: any) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={typeof src === 'string' ? src : ''} alt={alt} {...rest} />
  ),
}));

import HeroCarousel, { type HeroBanner } from './HeroCarousel';

function makeBanner(id: string, overrides: Partial<HeroBanner> = {}): HeroBanner {
  return {
    id,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    mobileImageUrl: null,
    headline: `Banner ${id}`,
    ctaText: 'Shop now',
    linkUrl: 'https://example.com/deal',
    linkTarget: 'new_tab',
    ...overrides,
  };
}

/** Installs a matchMedia stub returning the supplied reduced-motion preference. */
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function activeSlideLabel(): string | null {
  // The active slide is the one not aria-hidden.
  const slides = document.querySelectorAll('[aria-roledescription="slide"]');
  for (const slide of Array.from(slides)) {
    if (slide.getAttribute('aria-hidden') === 'false') {
      return slide.getAttribute('aria-label');
    }
  }
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('HeroCarousel (Req 1.4, 1.5, 1.6, 26.10)', () => {
  it('renders nothing when there are zero banners (Req 1.6)', () => {
    const { container } = render(<HeroCarousel banners={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('auto-advances every 4s when there is more than one banner (Req 1.4)', () => {
    render(<HeroCarousel banners={[makeBanner('a'), makeBanner('b'), makeBanner('c')]} />);
    expect(activeSlideLabel()).toBe('Banner 1 of 3');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(activeSlideLabel()).toBe('Banner 2 of 3');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(activeSlideLabel()).toBe('Banner 3 of 3');

    // Wraps back around to the first slide.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(activeSlideLabel()).toBe('Banner 1 of 3');
  });

  it('does not auto-advance with a single banner (Req 1.4)', () => {
    render(<HeroCarousel banners={[makeBanner('only')]} />);
    expect(activeSlideLabel()).toBe('Banner 1 of 1');
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(activeSlideLabel()).toBe('Banner 1 of 1');
    // Single banner shows no navigation controls.
    expect(screen.queryByRole('button', { name: /next banner/i })).not.toBeInTheDocument();
  });

  it('pauses auto-advance while hovered (Req 1.5)', () => {
    render(<HeroCarousel banners={[makeBanner('a'), makeBanner('b')]} />);
    const region = screen.getByRole('region', { name: /promotional banners/i });

    act(() => {
      fireEvent.mouseEnter(region);
    });
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    // Still on the first slide because hover pauses the timer.
    expect(activeSlideLabel()).toBe('Banner 1 of 2');

    act(() => {
      fireEvent.mouseLeave(region);
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(activeSlideLabel()).toBe('Banner 2 of 2');
  });

  it('does not auto-advance under reduced motion (Req 26.10)', () => {
    mockMatchMedia(true);
    render(<HeroCarousel banners={[makeBanner('a'), makeBanner('b'), makeBanner('c')]} />);
    expect(activeSlideLabel()).toBe('Banner 1 of 3');
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(activeSlideLabel()).toBe('Banner 1 of 3');
  });

  it('renders a banner with a valid link as an activatable anchor (Req 1.7)', () => {
    const { container } = render(
      <HeroCarousel banners={[makeBanner('a', { linkUrl: 'https://example.com/x' })]} />,
    );
    const anchor = container.querySelector('a[href="https://example.com/x"]');
    expect(anchor).toBeInTheDocument();
  });

  it('renders a banner with a malformed link as inert (non-navigating) (Req 1.14)', () => {
    const { container } = render(
      <HeroCarousel banners={[makeBanner('a', { linkUrl: 'not-a-url' })]} />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[aria-roledescription="slide"]')).toBeInTheDocument();
  });
});
