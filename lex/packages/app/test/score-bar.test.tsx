// Score bar (DESIGN §7.1): short display names + the live move-clock that
// rides the side-to-move seat only when a deadline is supplied.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScoreBar } from '../src/game/ScoreBar';

afterEach(cleanup);

const noop = () => {};
const NOW = 1_750_000_000_000;

describe('ScoreBar names', () => {
  it('shortens full names to first names', () => {
    render(
      <ScoreBar
        names={['Mike Borrebach', 'Zachary Fleischman']}
        scores={[78, 36]}
        toMove={0}
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByTestId('score-seat-0').textContent).toContain('Mike');
    expect(screen.getByTestId('score-seat-0').textContent).not.toContain('Borrebach');
    expect(screen.getByTestId('score-seat-1').textContent).toContain('Zachary');
  });
});

describe('ScoreBar move clock', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the clock on the side-to-move seat only', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    render(
      <ScoreBar
        names={['Mike', 'Zachary']}
        scores={[78, 36]}
        toMove={0}
        onOpenSheet={noop}
        deadlineAtMs={NOW + 26 * 3_600_000}
      />,
    );
    const clock = screen.getByTestId('turn-clock');
    // Compact form in the bar (the clock icon carries the "left" meaning).
    expect(clock.textContent).toBe('26h');
    // It lives inside the to-move seat, not the opponent's.
    expect(screen.getByTestId('score-seat-0').contains(clock)).toBe(true);
    expect(screen.getByTestId('score-seat-1').contains(clock)).toBe(false);
  });

  it('renders no clock without a deadline (hot-seat / no time control)', () => {
    render(
      <ScoreBar names={['Mike', 'Zachary']} scores={[78, 36]} toMove={0} onOpenSheet={noop} />,
    );
    expect(screen.queryByTestId('turn-clock')).toBeNull();
  });
});
