// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import ClickCTA from './ClickCTA';

const DEST = 'https://affiliate.example.com/go?id=abc';

/** Builds a fetch Response-like object the component consumes. */
function jsonResponse(ok: boolean, body: unknown) {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

/** A promise whose resolution we control, used to drive timeout branches. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let openSpy: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openSpy = vi.fn().mockReturnValue({} as Window);
  fetchSpy = vi.fn();
  vi.stubGlobal('open', openSpy);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ClickCTA success path (Req 7.5/7.6)', () => {
  it('opens the URL returned by the click endpoint in a new tab', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(true, { url: DEST }));
    render(<ClickCTA kind="product" id="p1" label="VIEW DEAL" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view deal/i }));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/public/click',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(openSpy).toHaveBeenCalledWith(DEST, '_blank', 'noopener,noreferrer');
    // No error/fallback messaging on success.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does nothing when disabled (Req 2.9)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(true, { url: DEST }));
    render(<ClickCTA kind="product" id="p1" label="VIEW DEAL" disabled />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view deal/i }));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('ClickCTA product 5s timeout (Req 7.7)', () => {
  it('informs the visitor without navigating when the request stalls', async () => {
    vi.useFakeTimers();
    // Request never resolves within the budget.
    fetchSpy.mockReturnValue(new Promise(() => {}));
    render(<ClickCTA kind="product" id="p1" label="VIEW DEAL" />);

    fireEvent.click(screen.getByRole('button', { name: /view deal/i }));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('ClickCTA deal 3s timeout best-effort (Req 8.11)', () => {
  it('stops blocking at 3s then opens the destination once the request resolves', async () => {
    vi.useFakeTimers();
    const d = deferred<Response>();
    fetchSpy.mockReturnValue(d.promise);
    render(<ClickCTA kind="deal" id="d1" label="GET COUPON" />);

    fireEvent.click(screen.getByRole('button', { name: /get coupon/i }));

    // At 3s the control stops showing the blocking "Opening…" state, but the
    // request is still in flight so nothing has opened yet.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText(/opening/i)).not.toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();

    // The late resolution still opens the destination (best-effort).
    await act(async () => {
      d.resolve(jsonResponse(true, { url: DEST }));
    });
    expect(openSpy).toHaveBeenCalledWith(DEST, '_blank', 'noopener,noreferrer');
  });
});

describe('ClickCTA popup-block fallback (Req 7.8)', () => {
  it('surfaces an explicit destination anchor when the new tab is blocked', async () => {
    openSpy.mockReturnValue(null);
    fetchSpy.mockResolvedValue(jsonResponse(true, { url: DEST }));
    render(<ClickCTA kind="product" id="p1" label="VIEW DEAL" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view deal/i }));
    });

    const anchor = screen.getByRole('link', { name: /open the link/i });
    expect(anchor).toHaveAttribute('href', DEST);
    expect(anchor).toHaveAttribute('target', '_blank');
  });

  it('informs the visitor when the endpoint returns no usable URL', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(true, { url: '' }));
    render(<ClickCTA kind="product" id="p1" label="VIEW DEAL" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view deal/i }));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
