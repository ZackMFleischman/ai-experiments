import { describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import type { GameOptions } from '@hive/engine';

const BASE_TOURNAMENT: GameOptions = {
  mosquito: false,
  ladybug: false,
  pillbug: false,
  tournamentOpening: true,
};

// The T1.9 base fixture game: white surrounds the black queen on the last ply.
export const SURROUND_WIN = [
  'wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-', 'wA1 \\wQ', 'bA1 bQ-', 'wA1 \\bQ',
  'bG1 bA1-', 'wA2 -wQ', 'bG2 bG1-', 'wA2 \\bA1', 'bG3 bG2-', 'wA3 /wQ',
  'bB1 bG1\\', 'wA3 /bQ', 'bB1 bG1', 'wG1 \\wA1', 'bB1 bA1/', 'wG1 wA3-',
];

export async function endedController(moves: string[], options = BASE_TOURNAMENT) {
  const transport = new LocalTransport(options);
  await transport.reset(options);
  for (let i = 0; i < moves.length; i++) {
    await transport.submit({ kind: 'move', uhp: moves[i] as string }, i);
  }
  const c = new GameController(transport, options);
  await c.init();
  return c;
}

describe('end-of-game beat (T3.9)', () => {
  it('a surround win enters the beat: pulse ring, overlay held back', async () => {
    const c = await endedController(SURROUND_WIN);
    const snap = c.getSnapshot();
    expect(snap.end).toEqual({ by: 'surround', winner: 'w' });
    expect(snap.beat).toBeTruthy();
    expect(snap.beat?.center).toEqual({ q: 2, r: 0 }); // the black queen
    expect(snap.beat?.pulseCells.size).toBe(6);
    expect(snap.overlayOpen).toBe(false);
    expect(snap.movableCells.size).toBe(0); // game over: nothing to move
  });

  it('finishing the beat (timer or tap-skip) opens the overlay', async () => {
    const c = await endedController(SURROUND_WIN);
    c.finishBeat();
    const snap = c.getSnapshot();
    expect(snap.beat).toBeUndefined();
    expect(snap.overlayOpen).toBe(true);
  });

  it('resignations and agreed draws skip the beat entirely', async () => {
    const c = await endedController(SURROUND_WIN.slice(0, 6));
    c.resign('w');
    expect(c.getSnapshot().beat).toBeUndefined();
    expect(c.getSnapshot().overlayOpen).toBe(true);
  });
});
