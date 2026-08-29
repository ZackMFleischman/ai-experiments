// Score bar (DESIGN §7.1): short display names + the live move-clock that
// rides the side-to-move seat only when a deadline is supplied.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('ScoreBar leave button', () => {
  it('fires onBack when the leave button is tapped', () => {
    const onBack = vi.fn();
    render(
      <ScoreBar names={['Mike', 'Zachary']} scores={[0, 0]} toMove={0} onOpenSheet={noop} onBack={onBack} />,
    );
    fireEvent.click(screen.getByTestId('leave-game'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the leave button when no onBack is supplied', () => {
    render(<ScoreBar names={['Mike', 'Zachary']} scores={[0, 0]} toMove={0} onOpenSheet={noop} />);
    expect(screen.queryByTestId('leave-game')).toBeNull();
  });
});

describe('ScoreBar turn line', () => {
  it('reads "Your turn" from the seat to move', () => {
    render(
      <ScoreBar
        names={['Mike', 'Zachary', 'Noor']}
        scores={[78, 36, 51]}
        toMove={1}
        mySeat={1}
        queue={[1, 2, 0]}
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByTestId('turn-line').textContent).toBe('Your turn');
  });

  it('names the seat to move from anyone else\u2019s perspective', () => {
    render(
      <ScoreBar
        names={['Mike', 'Zachary', 'Noor']}
        scores={[78, 36, 51]}
        toMove={1}
        mySeat={0}
        queue={[1, 2, 0]}
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByTestId('turn-line').textContent).toContain('Zachary');
    expect(screen.getByTestId('turn-line').textContent).toContain('turn');
    expect(screen.getByTestId('turn-line').textContent).not.toContain('Your');
  });

  it('says the game is over instead of naming a turn', () => {
    render(
      <ScoreBar
        names={['Mike', 'Zachary']}
        scores={[78, 36]}
        toMove={0}
        mySeat={0}
        queue={[0, 1]}
        ended
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByTestId('turn-line').textContent).toBe('Game over');
  });
});

describe('ScoreBar standings rail', () => {
  const rail = () => screen.getByTestId('standings-rail');
  const seatOrder = () =>
    [...rail().querySelectorAll('[data-testid^="score-seat-"]')].map(
      (el) => el.getAttribute('data-testid'),
    );

  it('orders the rail by the queue and numbers each seat 1-based', () => {
    render(
      <ScoreBar
        names={['Mike', 'Zachary', 'Noor']}
        scores={[78, 36, 51]}
        toMove={2}
        mySeat={0}
        queue={[2, 0, 1]}
        onOpenSheet={noop}
      />,
    );
    expect(seatOrder()).toEqual(['score-seat-2', 'score-seat-0', 'score-seat-1']);
    expect(screen.getByTestId('queue-2').textContent).toBe('1');
    expect(screen.getByTestId('queue-0').textContent).toBe('2');
    expect(screen.getByTestId('queue-1').textContent).toBe('3');
  });

  it('renders four seats, each with its name and score', () => {
    render(
      <ScoreBar
        names={['Mike', 'Zachary', 'Noor', 'Kai']}
        scores={[78, 36, 51, 12]}
        toMove={0}
        mySeat={0}
        queue={[0, 1, 2, 3]}
        onOpenSheet={noop}
      />,
    );
    expect(seatOrder()).toHaveLength(4);
    for (const [seat, name, score] of [
      [0, 'Mike', '78'],
      [1, 'Zachary', '36'],
      [2, 'Noor', '51'],
      [3, 'Kai', '12'],
    ] as const) {
      const row = screen.getByTestId(`score-seat-${seat}`);
      expect(row.textContent).toContain(name);
      expect(row.textContent).toContain(score);
    }
  });

  it('gives a withdrawn seat no numeral, an out marker, and the last row', () => {
    render(
      <ScoreBar
        names={['Mike', 'Zachary', 'Noor', 'Kai']}
        scores={[78, 36, 51, 12]}
        toMove={1}
        mySeat={0}
        // Kai withdrew: the engine's queue skips seat 3 entirely.
        queue={[1, 2, 0]}
        withdrawn={[3]}
        onOpenSheet={noop}
      />,
    );
    expect(seatOrder()).toEqual([
      'score-seat-1',
      'score-seat-2',
      'score-seat-0',
      'score-seat-3',
    ]);
    expect(screen.queryByTestId('queue-3')).toBeNull();
    expect(screen.getByTestId('withdrawn-3').textContent).toBe('out');
    // The seats still playing keep a full 1..3 numbering.
    expect(screen.getByTestId('queue-1').textContent).toBe('1');
    expect(screen.getByTestId('queue-2').textContent).toBe('2');
    expect(screen.getByTestId('queue-0').textContent).toBe('3');
    // The withdrawn seat still shows its frozen score.
    expect(screen.getByTestId('score-seat-3').textContent).toContain('12');
    expect(screen.queryByTestId('withdrawn-0')).toBeNull();
  });
});

describe('ScoreBar rail once the game is over (T7.16)', () => {
  const rail = () => screen.getByTestId('standings-rail');
  const seatOrder = () =>
    [...rail().querySelectorAll('[data-testid^="score-seat-"]')].map((el) =>
      el.getAttribute('data-testid'),
    );

  it('reads by placing, not by turn order, with no seat to move', () => {
    render(
      <ScoreBar
        names={['Ada', 'Sam', 'Noor', 'Kai']}
        scores={[244, 12, 176, 143]}
        toMove={2}
        mySeat={2}
        queue={[2, 3]}
        withdrawn={[0, 1]}
        ended
        // Ada left with the best score and the engine still ranks her third.
        standings={[[2], [3], [0], [1]]}
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByTestId('turn-line').textContent).toBe('Game over');
    expect(seatOrder()).toEqual([
      'score-seat-2',
      'score-seat-3',
      'score-seat-0',
      'score-seat-1',
    ]);
    expect(screen.getByTestId('placing-2').textContent).toBe('1');
    expect(screen.getByTestId('placing-0').textContent).toBe('3');
    // No queue numerals and no to-move highlight survive the ending.
    expect(screen.queryByTestId('queue-2')).toBeNull();
    expect(rail().querySelector('[data-to-move="true"]')).toBeNull();
    // The withdrawn keep their marker and their frozen score.
    expect(screen.getByTestId('withdrawn-0').textContent).toBe('out');
    expect(screen.getByTestId('score-seat-0').textContent).toContain('244');
  });

  it('shares a numeral between tied seats', () => {
    render(
      <ScoreBar
        names={['Ada', 'Sam', 'Noor']}
        scores={[10, 21, 10]}
        toMove={0}
        mySeat={0}
        ended
        standings={[[1], [0, 2]]}
        onOpenSheet={noop}
      />,
    );
    expect(seatOrder()).toEqual(['score-seat-1', 'score-seat-0', 'score-seat-2']);
    expect(screen.getByTestId('placing-0').textContent).toBe('2');
    expect(screen.getByTestId('placing-2').textContent).toBe('2');
  });
});
