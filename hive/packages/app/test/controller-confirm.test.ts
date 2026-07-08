// "Confirm move" staging: with the setting on a move applies only to a local
// preview until the player confirms it; the board offers no other affordances
// while a move is staged, and turning the setting off flushes a pending move.
import { beforeEach, describe, expect, it } from 'vitest';
import { parseUhp, type GameOptions, type Move } from '@hive/engine';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';
import { SURROUND_WIN } from './end-of-game.test';

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeController(): GameController {
  return new GameController(new LocalTransport(ALL_ON), ALL_ON);
}

/** Stage white's opening spider at 0,0 (with confirm mode already on). */
function stageOpening(c: GameController) {
  c.selectHandBug('S');
  c.selectCell({ q: 0, r: 0 });
}

describe('confirm-move staging', () => {
  let c: GameController;
  beforeEach(() => {
    c = makeController();
  });

  it('is off by default: moves commit immediately', () => {
    const s = c.getSnapshot();
    expect(s.confirmMove).toBe(false);
    expect(s.staged).toBe(false);
    stageOpening(c);
    expect(c.getSnapshot().log).toHaveLength(1); // sent, not staged
  });

  it('stages a move as a preview without sending it', () => {
    c.setConfirmMove(true);
    stageOpening(c);
    const s = c.getSnapshot();
    expect(s.staged).toBe(true);
    expect(s.confirmMove).toBe(true);
    expect(s.log).toHaveLength(0); // nothing sent yet
    expect(s.state.board.get('0,0')?.[0]?.kind).toBe('S'); // preview shows the piece
    expect(s.selection).toBeUndefined();
  });

  it('offers no further affordances while a move is staged', () => {
    c.setConfirmMove(true);
    stageOpening(c);
    expect(c.getSnapshot().placeableBugs.size).toBe(0);
    expect(c.getSnapshot().targets.size).toBe(0);
    // interaction is inert until the staged move is resolved
    c.selectHandBug('S');
    expect(c.getSnapshot().selection).toBeUndefined();
    c.selectCell({ q: 3, r: 0 });
    expect(c.getSnapshot().staged).toBe(true); // unchanged
  });

  it('confirm sends the staged move and clears staging', () => {
    c.setConfirmMove(true);
    stageOpening(c);
    c.confirmStaged();
    const s = c.getSnapshot();
    expect(s.staged).toBe(false);
    expect(s.log).toEqual([{ kind: 'move', uhp: 'wS1' }]);
    expect(s.state.board.get('0,0')?.[0]?.kind).toBe('S');
    expect(s.toMove).toBe('b');
  });

  it('cancel discards the staged move and restores the position', () => {
    c.setConfirmMove(true);
    stageOpening(c);
    c.discardStaged();
    const s = c.getSnapshot();
    expect(s.staged).toBe(false);
    expect(s.state.board.size).toBe(0);
    expect(s.log).toHaveLength(0);
    // and the player can stage a different move afterwards
    stageOpening(c);
    expect(c.getSnapshot().staged).toBe(true);
  });

  it('cancel() (esc / tap-out) also discards a staged move', () => {
    c.setConfirmMove(true);
    stageOpening(c);
    c.cancel();
    expect(c.getSnapshot().staged).toBe(false);
    expect(c.getSnapshot().state.board.size).toBe(0);
  });

  it('turning the setting off flushes a pending staged move', () => {
    c.setConfirmMove(true);
    stageOpening(c);
    expect(c.getSnapshot().staged).toBe(true);
    c.setConfirmMove(false);
    const s = c.getSnapshot();
    expect(s.confirmMove).toBe(false);
    expect(s.staged).toBe(false);
    expect(s.log).toHaveLength(1); // the pending move was sent
  });

  it('confirm/discard are no-ops when nothing is staged', () => {
    c.setConfirmMove(true);
    c.confirmStaged();
    c.discardStaged();
    expect(c.getSnapshot().log).toHaveLength(0);
    expect(c.getSnapshot().state.board.size).toBe(0);
  });
});

// The reported bug: with confirm-move on, staging the *winning* move must not
// declare the game over. The end state (beat + overlay) previously fired off
// the unconfirmed preview, hiding the Confirm bar so the move never got sent —
// the winner saw "queen surrounded" but nothing reached the backend.
describe('confirm-move on a game-ending move', () => {
  const TOURNAMENT: GameOptions = {
    mosquito: false,
    ladybug: false,
    pillbug: false,
    tournamentOpening: true,
  };

  async function atMatchPoint(): Promise<GameController> {
    const transport = new LocalTransport(TOURNAMENT);
    await transport.reset(TOURNAMENT);
    for (let i = 0; i < SURROUND_WIN.length - 1; i++) {
      await transport.submit({ kind: 'move', uhp: SURROUND_WIN[i] as string }, i);
    }
    const c = new GameController(transport, TOURNAMENT);
    await c.init();
    c.setConfirmMove(true);
    return c;
  }

  /** Drive the controller to stage the final, game-winning move. */
  function stageWinningMove(c: GameController): void {
    const move = parseUhp(SURROUND_WIN[SURROUND_WIN.length - 1] as string, c.getSnapshot().state);
    const m = move as Extract<Move, { from: unknown; to: unknown }>;
    c.selectCell(m.from);
    c.selectCell(m.to);
  }

  it('staging the winning move shows a preview, not the game-over state', async () => {
    const c = await atMatchPoint();
    const before = c.getSnapshot().log.length;
    stageWinningMove(c);
    const s = c.getSnapshot();
    expect(s.staged).toBe(true);
    expect(s.end).toBeUndefined(); // NOT over yet — must be confirmed first
    expect(s.beat).toBeUndefined();
    expect(s.overlayOpen).toBe(false);
    expect(s.log).toHaveLength(before); // nothing sent to the backend yet
  });

  it('confirming the winning move submits it, then declares the win', async () => {
    const c = await atMatchPoint();
    const before = c.getSnapshot().log.length;
    stageWinningMove(c);
    c.confirmStaged();
    await tick();
    const s = c.getSnapshot();
    expect(s.staged).toBe(false);
    expect(s.log).toHaveLength(before + 1); // persisted
    expect(s.syncStatus).toBeUndefined(); // saved
    expect(s.end).toEqual({ by: 'surround', winner: 'w' });
  });
});
