// T6.2 gate: polish pass — typographic minus on negative scores, the rejected-
// move notice actually surfaces as a toast, and the lobby empty state invites.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoticeToast } from '../src/game/NoticeToast';
import { ResultOverlay } from '../src/game/ResultOverlay';
import { formatScore } from '../src/game/score';
import { LobbyView } from '../src/screens/lobbyView';

afterEach(cleanup);

const noop = () => {};

describe('formatScore', () => {
  it('renders negatives with a typographic minus (U+2212), never hyphen-minus', () => {
    expect(formatScore(-7)).toBe('−7');
    expect(formatScore(0)).toBe('0');
    expect(formatScore(212)).toBe('212');
  });
});

describe('ResultOverlay score typography', () => {
  it('uses the minus sign in a negative draw headline and the score rows', () => {
    render(
      <ResultOverlay
        open
        end={{ by: 'scoreless', winner: 'draw', finalScores: [-7, -7], adjustments: [-7, -7] }}
        names={['Player 1', 'Player 2']}
        sheet={[]}
        onRematch={noop}
        onViewBoard={noop}
      />,
    );
    const overlay = screen.getByTestId('result-overlay');
    expect(overlay.textContent).toContain('Draw — −7 apiece');
    expect(overlay.textContent).not.toContain('-7'); // no hyphen-minus anywhere
  });
});

describe('NoticeToast', () => {
  it('surfaces the controller notice and dismisses on close', async () => {
    const { rerender } = render(<NoticeToast notice={{ id: 1, text: 'Move rejected — undone.' }} />);
    expect(screen.getByTestId('notice-toast').textContent).toContain('Move rejected');
    fireEvent.click(screen.getByLabelText(/close/i));
    // The Snackbar exit transition keeps the node mounted briefly.
    await waitFor(() => expect(screen.queryByTestId('notice-toast')).toBeNull());
    // A NEW notice (fresh id) must reappear after a dismissal.
    rerender(<NoticeToast notice={{ id: 2, text: 'Move rejected — undone.' }} />);
    expect(screen.getByTestId('notice-toast')).toBeTruthy();
  });

  it('renders nothing without a notice', () => {
    render(<NoticeToast notice={undefined} />);
    expect(screen.queryByTestId('notice-toast')).toBeNull();
  });
});

describe('lobby empty state', () => {
  it('is a real empty state: headline + invite copy, not a bare line', () => {
    render(<LobbyView games={[]} now={0} onOpen={noop} />);
    const empty = screen.getByTestId('lobby-empty');
    expect(empty.textContent).toContain('No games yet');
    expect(empty.textContent).toMatch(/invite/i);
  });
});
