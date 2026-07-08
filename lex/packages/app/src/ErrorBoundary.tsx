// Top-level render guard. The app has three lazy chunks behind the game route
// (SyncProviders + MultiplayerGame) — a failed dynamic import (a redeploy
// rotated the chunk hashes the running JS still references, after
// cleanupOutdatedCaches purged the old ones) throws through the unguarded
// Suspense boundary and, with nothing to catch it, blanks the whole page to
// white. That surfaced as "click into a game after the opponent moved → white
// screen, sometimes" (opening from a push navigates straight to /game/:id).
//
// A stale-chunk failure is transient: a hard reload pulls the fresh index +
// chunks and recovers cleanly, so we reload once. A time-window guard stops a
// deterministic failure from looping (reload → crash → reload). Any other
// render error falls back to a self-contained card (plain DOM + inline styles,
// no MUI/providers — those may be the very thing that threw) with a manual
// reload.
import { Component, type ReactNode } from 'react';

const RELOAD_KEY = 'lex.chunkReloadAt';
const RELOAD_WINDOW_MS = 10_000;

/** A dynamic-import / code-split fetch failure, across browsers. Vite/Rollup
 * and the major engines each word this differently; match them all. */
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return /(?:failed to (?:fetch|load)|error loading|importing a module script failed|module script failed).*(?:dynamically imported|module)|dynamically imported module/i.test(
    error.message,
  );
}

function readLastReload(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

function markReload(at: number): void {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(at));
  } catch {
    // Private mode / storage disabled: we simply can't guard the loop, but a
    // one-shot reload on a genuine stale chunk is still the right call.
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** A stale-chunk reload is in flight — show a neutral "updating" beat, not
   * the error card, so the reload isn't preceded by a flash of failure. */
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    if (!isChunkLoadError(error)) return;
    const now = Date.now();
    // Don't reload again if we just did — that means the fresh chunks still
    // fail, so a reload would only loop. Show the card instead.
    if (now - readLastReload() <= RELOAD_WINDOW_MS) return;
    markReload(now);
    this.setState({ reloading: true });
    window.location.reload();
  }

  private handleReload = (): void => {
    // A manual reload is a deliberate fresh start: clear the loop guard so the
    // next genuine stale chunk can auto-recover.
    try {
      window.sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  override render(): ReactNode {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    if (reloading) {
      return (
        <div role="status" style={CENTER} data-testid="error-reloading">
          <p style={{ opacity: 0.7, font: '500 15px system-ui, sans-serif' }}>Updating…</p>
        </div>
      );
    }

    return (
      <div style={CENTER} data-testid="error-boundary">
        <div style={CARD}>
          <h1 style={{ margin: '0 0 8px', font: '700 20px system-ui, sans-serif' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 20px', font: '400 15px system-ui, sans-serif', opacity: 0.75 }}>
            The game hit an unexpected error. Reloading usually clears it.
          </p>
          <button type="button" onClick={this.handleReload} style={BUTTON} data-testid="error-reload">
            Reload
          </button>
        </div>
      </div>
    );
  }
}

const CENTER: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  boxSizing: 'border-box',
};

const CARD: React.CSSProperties = {
  maxWidth: 380,
  textAlign: 'center',
};

const BUTTON: React.CSSProperties = {
  font: '600 15px system-ui, sans-serif',
  padding: '10px 24px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  background: '#3730a3',
};
