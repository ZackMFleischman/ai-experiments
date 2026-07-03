import { hexToPixel } from '@hive/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { HEX_SIZE } from '../src/board/hexGeometry';
import { GameController } from '../src/controller/GameController';
import { LocalTransport } from '../src/controller/transport';
import { ALL_ON } from './replay';

const px = (q: number, r: number) => hexToPixel({ q, r }, HEX_SIZE);

function makeController(): GameController {
  return new GameController(new LocalTransport(ALL_ON), ALL_ON);
}

/** Fast-forward through the standard opening with tap-tap moves. */
function opening(c: GameController) {
  c.selectHandBug('S'); // white spider
  c.selectCell({ q: 0, r: 0 });
  c.selectHandBug('S');
  c.selectCell({ q: 1, r: 0 });
  c.selectHandBug('Q');
  c.selectCell({ q: -1, r: 0 });
  c.selectHandBug('Q');
  c.selectCell({ q: 2, r: 0 });
}

describe('GameController (T3.4)', () => {
  let c: GameController;
  beforeEach(() => {
    c = makeController();
  });

  it('starts idle: placements only, tray knows placeable bugs, no queen first (tournament)', () => {
    const s = c.getSnapshot();
    expect(s.toMove).toBe('w');
    expect(s.movableCells.size).toBe(0);
    expect(s.placeableBugs.has('S')).toBe(true);
    expect(s.placeableBugs.has('Q')).toBe(false); // tournament opening
  });

  it('tap-tap placement: select from hand, targets appear, tap a target to place', () => {
    c.selectHandBug('S');
    let s = c.getSnapshot();
    expect(s.selection?.kind).toBe('hand');
    expect(s.targets).toEqual(new Set(['0,0']));
    c.selectCell({ q: 0, r: 0 });
    s = c.getSnapshot();
    expect(s.state.board.get('0,0')?.[0]?.kind).toBe('S');
    expect(s.toMove).toBe('b');
    expect(s.selection).toBeUndefined();
    expect(s.log).toEqual([{ kind: 'move', uhp: 'wS1' }]);
  });

  it('tap elsewhere cancels a selection', () => {
    c.selectHandBug('S');
    c.selectCell({ q: 5, r: 5 });
    expect(c.getSnapshot().selection).toBeUndefined();
    expect(c.getSnapshot().state.board.size).toBe(0);
  });

  it('board selection shows move targets; climbs are separated', () => {
    opening(c);
    // White queen at -1,0 can slide; select it.
    c.selectCell({ q: -1, r: 0 });
    const s = c.getSnapshot();
    expect(s.selection?.kind).toBe('board');
    expect(s.targets.size).toBeGreaterThan(0);
    for (const t of s.targets) expect(s.state.board.has(t)).toBe(false);
  });

  it('drag happy path: pick up, hover snaps on targets, drop commits', () => {
    opening(c);
    c.selectCell({ q: -1, r: 0 }); // pick up wQ
    const target = [...c.getSnapshot().targets][0] as string;
    const [q, r] = target.split(',').map(Number) as [number, number];
    const { x, y } = px(q, r);
    c.dragTo(x + 3, y - 2);
    let s = c.getSnapshot();
    expect(s.drag?.allowed).toBe(true);
    expect(s.drag?.over).toBe(target);
    c.drop(x + 3, y - 2);
    s = c.getSnapshot();
    expect(s.drag).toBeUndefined();
    expect(s.state.board.has(target)).toBe(true);
    expect(s.toMove).toBe('b');
  });

  it('drag over a non-target reads not-allowed; dropping there springs back', () => {
    opening(c);
    c.selectCell({ q: -1, r: 0 });
    const { x, y } = px(8, 8);
    c.dragTo(x, y);
    expect(c.getSnapshot().drag?.allowed).toBe(false);
    c.drop(x, y);
    const s = c.getSnapshot();
    expect(s.selection).toBeUndefined();
    expect(s.drag).toBeUndefined();
    expect(s.state.board.has('-1,0')).toBe(true); // queen stayed home
    expect(s.toMove).toBe('w');
  });

  it('Esc cancels a drag in flight', () => {
    opening(c);
    c.selectCell({ q: -1, r: 0 });
    c.dragTo(0, 0);
    c.cancel();
    const s = c.getSnapshot();
    expect(s.selection).toBeUndefined();
    expect(s.drag).toBeUndefined();
  });

  it('queen-by-4: only the queen is placeable on turn 4', () => {
    // three white placements without the queen (black mirrors)
    const seq: Array<['hand', string] | ['cell', number, number]> = [
      ['hand', 'S'], ['cell', 0, 0],
      ['hand', 'S'], ['cell', 1, 0],
      ['hand', 'A'], ['cell', -1, 0],
      ['hand', 'A'], ['cell', 2, 0],
      ['hand', 'G'], ['cell', -2, 0],
      ['hand', 'G'], ['cell', 3, 0],
    ];
    for (const step of seq) {
      if (step[0] === 'hand') c.selectHandBug(step[1] as never);
      else c.selectCell({ q: step[1], r: step[2] });
    }
    const s = c.getSnapshot();
    expect(s.toMove).toBe('w');
    expect(s.state.turn).toBe(4);
    expect(s.placeableBugs).toEqual(new Set(['Q']));
    expect(s.mustPlaceQueen).toBe(true);
  });

  it('optimistic apply is reconciled back when the transport rejects', async () => {
    class RejectingTransport extends LocalTransport {
      override async submit(): Promise<void> {
        throw new Error('nope');
      }
    }
    const rc = new GameController(new RejectingTransport(ALL_ON), ALL_ON);
    rc.selectHandBug('S');
    rc.selectCell({ q: 0, r: 0 });
    expect(rc.getSnapshot().state.board.size).toBe(1); // optimistic
    await Promise.resolve(); // let the rejection land
    await Promise.resolve();
    expect(rc.getSnapshot().state.board.size).toBe(0); // rolled back
    expect(rc.getSnapshot().log).toEqual([]);
  });

  it('resign ends the game with the opponent winning', () => {
    opening(c);
    c.resign('w');
    const s = c.getSnapshot();
    expect(s.end).toEqual({ by: 'resign', winner: 'b' });
    expect(s.overlayOpen).toBe(true); // no board beat for resignations
    expect(s.movableCells.size).toBe(0);
  });

  it('draw offer → accept ends in an agreed draw; decline clears it; a move clears it too', () => {
    opening(c);
    c.offerDraw('w');
    expect(c.getSnapshot().pendingDrawOffer).toBe('w');
    c.respondDraw('b', false);
    expect(c.getSnapshot().pendingDrawOffer).toBeUndefined();
    c.offerDraw('b');
    c.selectCell({ q: -1, r: 0 });
    const t = [...c.getSnapshot().targets][0] as string;
    const [q, r] = t.split(',').map(Number) as [number, number];
    c.selectCell({ q, r });
    expect(c.getSnapshot().pendingDrawOffer).toBeUndefined(); // move cleared it
    c.offerDraw('w');
    c.respondDraw('b', true);
    expect(c.getSnapshot().end).toEqual({ by: 'draw-agreed' });
  });

  it('refresh resume: a new controller over the same transport replays the log (T3.11 seam)', async () => {
    const transport = new LocalTransport(ALL_ON);
    const first = new GameController(transport, ALL_ON);
    await first.init();
    first.selectHandBug('S');
    first.selectCell({ q: 0, r: 0 });
    first.selectHandBug('S');
    first.selectCell({ q: 1, r: 0 });
    await Promise.resolve();

    const second = new GameController(transport, ALL_ON);
    await second.init();
    const s = second.getSnapshot();
    expect(s.state.board.size).toBe(2);
    expect(s.toMove).toBe('w');
    expect(s.log).toHaveLength(2);
  });

  it('new game resets everything through the transport', async () => {
    opening(c);
    await c.newGame();
    const s = c.getSnapshot();
    expect(s.state.board.size).toBe(0);
    expect(s.log).toEqual([]);
    expect(s.end).toBeUndefined();
  });

  it('pass is exposed only when forced', () => {
    expect(c.getSnapshot().canPass).toBe(false);
  });
});
