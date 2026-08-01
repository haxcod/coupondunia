// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CountdownTimer } from './CountdownTimer';

const T0 = new Date('2025-01-01T00:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CountdownTimer expiry swap (Req 6.6, 8.12)', () => {
  it('shows the live countdown while time remains', () => {
    render(<CountdownTimer expiry={new Date(T0 + 3000)} nowMs={T0} expiredLabel="Offer over" />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.queryByText('Offer over')).not.toBeInTheDocument();
  });

  it('swaps to the expired message when the expiry instant is reached (Req 6.6)', () => {
    render(<CountdownTimer expiry={new Date(T0 + 3000)} nowMs={T0} expiredLabel="Offer over" />);
    expect(screen.getByRole('timer')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText('Offer over')).toBeInTheDocument();
  });

  it('renders the expired message immediately when already past expiry', () => {
    render(<CountdownTimer expiry={new Date(T0 - 1000)} nowMs={T0} expiredLabel="Deal ended" />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText('Deal ended')).toBeInTheDocument();
  });

  it('treats an unparseable expiry as expired rather than ticking against NaN', () => {
    render(<CountdownTimer expiry="not-a-date" nowMs={T0} expiredLabel="Deal ended" />);
    expect(screen.getByText('Deal ended')).toBeInTheDocument();
  });
});
