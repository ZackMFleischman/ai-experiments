// The top-level render guard (src/ErrorBoundary.tsx): the app had no error
// boundary, so a failed lazy-chunk import behind the game route threw through
// the unguarded Suspense and blanked the page to white ("click into a game
// after the opponent moved → white screen, sometimes"). A stale-chunk failure
// auto-reloads once (transient — a redeploy rotated the hashes); a repeat
// within the window, or any other error, falls back to a manual-reload card.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/ErrorBoundary';

function Boom({ error }: { error: Error }): never {
  throw error;
}

function chunkError(): Error {
  return new Error('Failed to fetch dynamically imported module: https://x/assets/Game-abc123.js');
}

const RELOAD_KEY = 'lex.chunkReloadAt';

let reload: ReturnType<typeof vi.fn>;
let now = 1_000_000;

beforeEach(() => {
  window.sessionStorage.clear();
  reload = vi.fn();
  // jsdom's location.reload isn't spyable in place; swap it wholesale.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  // React logs the caught error; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('auto-reloads once on a stale-chunk import failure', () => {
    render(
      <ErrorBoundary>
        <Boom error={chunkError()} />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBe(String(now));
    // Shows the neutral updating beat, not the failure card.
    expect(screen.getByTestId('error-reloading')).toBeTruthy();
    expect(screen.queryByTestId('error-boundary')).toBeNull();
  });

  it('does not loop: a chunk failure right after a reload shows the card', () => {
    window.sessionStorage.setItem(RELOAD_KEY, String(now - 2_000)); // reloaded 2s ago
    render(
      <ErrorBoundary>
        <Boom error={chunkError()} />
      </ErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-boundary')).toBeTruthy();
  });

  it('reloads again for a genuinely new stale chunk (outside the window)', () => {
    window.sessionStorage.setItem(RELOAD_KEY, String(now - 60_000)); // last reload a minute ago
    render(
      <ErrorBoundary>
        <Boom error={chunkError()} />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the fallback card (no auto-reload) for a non-chunk render error', () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error('boom in render')} />
      </ErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-boundary')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('the card reload button clears the loop guard and reloads', () => {
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
    render(
      <ErrorBoundary>
        <Boom error={new Error('boom in render')} />
      </ErrorBoundary>,
    );
    screen.getByTestId('error-reload').click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });
});
