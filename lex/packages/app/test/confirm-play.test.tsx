// "Confirm before playing" preference: stored read/fallback, provider
// persistence (lex.confirmPlay.v1), and the Settings toggle round-trip.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../src/App';
import {
  CONFIRM_PLAY_STORAGE_KEY,
  ConfirmPlayProvider,
  storedConfirmPlay,
  useConfirmPlay,
} from '../src/game/confirmPlayContext';
import { Settings } from '../src/screens/Settings';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe('storedConfirmPlay', () => {
  it('reads a stored "true"', () => {
    window.localStorage.setItem(CONFIRM_PLAY_STORAGE_KEY, 'true');
    expect(storedConfirmPlay(window.localStorage)).toBe(true);
  });

  it('falls back to false on missing, junk, undefined, or throwing storage', () => {
    expect(storedConfirmPlay(window.localStorage)).toBe(false);
    window.localStorage.setItem(CONFIRM_PLAY_STORAGE_KEY, 'yes');
    expect(storedConfirmPlay(window.localStorage)).toBe(false);
    expect(storedConfirmPlay(undefined)).toBe(false);
    expect(
      storedConfirmPlay({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBe(false);
  });
});

function Probe() {
  const { confirmPlay, setConfirmPlay } = useConfirmPlay();
  return (
    <button data-testid="probe" onClick={() => setConfirmPlay(!confirmPlay)}>
      {String(confirmPlay)}
    </button>
  );
}

describe('ConfirmPlayProvider', () => {
  it('starts from localStorage and persists changes back', () => {
    window.localStorage.setItem(CONFIRM_PLAY_STORAGE_KEY, 'true');
    render(
      <ConfirmPlayProvider>
        <Probe />
      </ConfirmPlayProvider>,
    );
    const probe = screen.getByTestId('probe');
    expect(probe.textContent).toBe('true');
    fireEvent.click(probe);
    expect(probe.textContent).toBe('false');
    expect(window.localStorage.getItem(CONFIRM_PLAY_STORAGE_KEY)).toBe('false');
  });
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <AppProviders>
        <Settings />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('Settings — confirm before playing', () => {
  it('defaults to "Play instantly" and toggles + persists (lex.confirmPlay.v1)', () => {
    renderSettings();
    expect(screen.getByTestId('confirm-play-off').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('confirm-play-on'));
    expect(screen.getByTestId('confirm-play-on').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('confirm-play-off').getAttribute('aria-pressed')).toBe('false');
    expect(window.localStorage.getItem(CONFIRM_PLAY_STORAGE_KEY)).toBe('true');
  });
});
