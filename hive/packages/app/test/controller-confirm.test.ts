// "Confirm move" staging: with the setting on a move applies only to a local
// preview until the player confirms it; the board offers no other affordances
// while a move is staged, and turning the setting off flushes a pending move.
import { beforeEach, describe, expect, it } from 'vitest';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';

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
