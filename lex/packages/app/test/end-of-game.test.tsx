// T3.10 gate: end-of-game beat + result overlay with the score story
// (adjustment line items), across every ending: played-out win, scoreless,
// tie/draw, resign. Fixtures replay the engine's pinned full games.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LocalTransport } from '@parlor/core';
import { describe, expect, it, vi } from 'vitest';
import { FULL_GAME, SCORELESS_GAME, TIE_GAME } from '../../engine/test/fixtures/full-game';
import { stubDict } from '../../engine/test/helpers';
import { GameBoard } from '../src/board/GameBoard';
import type { HotSeatOptions, LexEntry } from '../src/controller/entries';
import { GameController } from '../src/controller/GameController';
import { ResultOverlay } from '../src/game/ResultOverlay';
import { storedGameFromFixture, type GameFixture } from './fixtures';

async function replayController(fixture: GameFixture) {
  const { options, log } = storedGameFromFixture(fixture);
  const transport = new LocalTransport<HotSeatOptions, LexEntry>(options);
  for (let i = 0; i < log.length; i++) await transport.submit(log[i]!, i);
  const controller = new GameController(transport, options, { dict: stubDict(), rng: () => 0.5 });
  await controller.init();
  return controller;
}

describe('controller end states from pinned fixtures', () => {
  it('played-out: winner, finals, and rack-adjustment line items', async () => {
    const controller = await replayController(FULL_GAME);
    const snap = controller.getSnapshot();
    expect(snap.end).toMatchObject({
      by: 'played-out',
      winner: FULL_GAME.winner,
      finalScores: FULL_GAME.finalScores,
    });
    const end = snap.end!;
    if (!('adjustments' in end)) throw new Error('expected adjustments');
    // Adjustments cancel: finisher gains what the loser deducts.
    expect(end.adjustments.reduce((a, b) => a + b, 0)).toBe(0);
    expect(end.adjustments[0]).toBeGreaterThan(0);
    expect(end.adjustments[1]).toBeLessThan(0);
    // The beat is pending; the overlay waits for it.
    expect(snap.beat).toBeTruthy();
    expect(snap.overlayOpen).toBe(false);
    controller.finishBeat();
    expect(controller.getSnapshot().overlayOpen).toBe(true);
  });

  it('scoreless limit: both racks deduct', async () => {
    const controller = await replayController(SCORELESS_GAME);
    const end = controller.getSnapshot().end!;
    expect(end).toMatchObject({ by: 'scoreless', winner: SCORELESS_GAME.winner });
    if (!('adjustments' in end)) throw new Error('expected adjustments');
    expect(end.adjustments[0]).toBeLessThan(0);
    expect(end.adjustments[1]).toBeLessThan(0);
  });

  it('tie: a draw with equal finals', async () => {
    const controller = await replayController(TIE_GAME);
    const end = controller.getSnapshot().end!;
    expect(end.winner).toBe('draw');
    expect(end.finalScores[0]).toBe(end.finalScores[1]);
  });

  it('resign skips the beat: overlay opens immediately', async () => {
    const controller = await replayController({ ...TIE_GAME, moves: TIE_GAME.moves.slice(0, 2) });
    act(() => controller.resign(1));
    const snap = controller.getSnapshot();
    expect(snap.beat).toBeUndefined();
    expect(snap.overlayOpen).toBe(true);
    expect(snap.end).toMatchObject({ by: 'resign', winner: 0 });
  });
});

describe('ResultOverlay', () => {
  const base = { open: true, names: ['Alice', 'Bob'], onRematch: () => {}, onViewBoard: () => {} };

  it('played-out win: headline, score story with line items, stats', async () => {
    const controller = await replayController(FULL_GAME);
    const snap = controller.getSnapshot();
    render(<ResultOverlay {...base} end={snap.end!} sheet={snap.sheet} />);
    const overlay = screen.getByTestId('result-overlay');
    expect(overlay.textContent).toMatch(/Alice wins!/);
    expect(overlay.textContent).toMatch(/played out/i);
    expect(overlay.textContent).toContain(String(FULL_GAME.finalScores[0]));
    const lines = screen.getAllByTestId('adjustment-line');
    expect(lines.some((l) => l.textContent?.includes('from unplayed racks'))).toBe(true);
    expect(lines.some((l) => l.textContent?.includes('unplayed tiles'))).toBe(true);
    expect(screen.getByTestId('result-stats').textContent).toMatch(/\d+ moves/);
    expect(screen.getByTestId('result-stats').textContent).toMatch(/biggest word/i);
  });

  it('draw: “apiece” headline', async () => {
    const controller = await replayController(TIE_GAME);
    const snap = controller.getSnapshot();
    render(<ResultOverlay {...base} end={snap.end!} sheet={snap.sheet} />);
    expect(screen.getByTestId('result-overlay').textContent).toMatch(/Draw — .* apiece/);
  });

  it('resign: names the resigner', async () => {
    const controller = await replayController({ ...TIE_GAME, moves: [] });
    act(() => controller.resign(0));
    const snap = controller.getSnapshot();
    render(<ResultOverlay {...base} end={snap.end!} sheet={snap.sheet} />);
    const overlay = screen.getByTestId('result-overlay');
    expect(overlay.textContent).toMatch(/Bob wins/);
    expect(overlay.textContent).toMatch(/Alice resigned/);
  });
});

describe('GameBoard end-of-game flow', () => {
  it('beat overlay shows first; tapping it opens the result; View board leaves a banner', async () => {
    const controller = await replayController(FULL_GAME);
    render(<GameBoard controller={controller} />);
    const beat = screen.getByTestId('end-beat');
    expect(screen.queryByTestId('result-overlay')).toBeFalsy();
    fireEvent.click(beat); // skip the beat
    expect(screen.getByTestId('result-overlay')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /view board/i }));
    expect(screen.getByTestId('result-banner')).toBeTruthy();
    // (getByRole would miss it: the closing dialog still aria-hides the root.)
    fireEvent.click(screen.getByText(/view result/i));
    expect(screen.getByTestId('result-overlay')).toBeTruthy();
  });

  it('Rematch calls back out (the session owner starts the new game)', async () => {
    const controller = await replayController(FULL_GAME);
    const onRematch = vi.fn();
    render(<GameBoard controller={controller} onRematch={onRematch} />);
    act(() => controller.finishBeat());
    fireEvent.click(screen.getByRole('button', { name: /rematch/i }));
    expect(onRematch).toHaveBeenCalledOnce();
  });
});
