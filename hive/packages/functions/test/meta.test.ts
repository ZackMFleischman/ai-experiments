// T4.5: resign / offerDraw / respondDraw / rematch — meta events land in the
// same ordered move log (DESIGN §2.4/§5.2), pendingDrawOffer lifecycle incl.
// offer-clears-on-move, rematch links via rematchOf with colors swapped.
import type { GameOptions } from '@hive/engine';
import { describe, expect, it } from 'vitest';
import { adminGetDoc, adminListDocs, call, createJoinedGame, signUp } from './helpers';

const OPTIONS: GameOptions = {
  mosquito: true,
  ladybug: true,
  pillbug: true,
  tournamentOpening: true,
};

describe('resign', () => {
  it('ends the game for the opponent and logs the meta event', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('submitMove', { gameId, expectedMoveCount: 0, uhpMove: 'wS1' }, white);
    const res = await call('resign', { gameId }, black);
    expect(res.status).toBe(200);

    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('white');
    expect(game?.['endedBy']).toBe('resign');
    expect(game?.['moveCount']).toBe(2);

    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );
    expect(log[1]).toMatchObject({ n: 1, kind: 'resign', by: black.uid });
  });

  it('rejects resigning a finished game', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('resign', { gameId }, white);
    const res = await call('resign', { gameId }, black);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });

  it('rejects non-players', async () => {
    const { gameId } = await createJoinedGame(OPTIONS);
    const res = await call('resign', { gameId }, await signUp('Eve'));
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });
});

describe('draw offers', () => {
  it('offer sets pendingDrawOffer; decline clears it; both are logged', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    const offer = await call('offerDraw', { gameId }, white);
    expect(offer.status).toBe(200);
    expect((await adminGetDoc(`games/${gameId}`))?.['pendingDrawOffer']).toBe('white');

    const decline = await call('respondDraw', { gameId, accept: false }, black);
    expect(decline.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['pendingDrawOffer']).toBeUndefined();
    expect(game?.['status']).toBe('active');

    const log = (await adminListDocs(`games/${gameId}/moves`)).sort(
      (a, b) => (a['n'] as number) - (b['n'] as number),
    );
    expect(log[0]).toMatchObject({ n: 0, kind: 'draw-offer', by: white.uid });
    expect(log[1]).toMatchObject({ n: 1, kind: 'draw-decline', by: black.uid });
  });

  it('accept ends the game as an agreed draw', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('offerDraw', { gameId }, black);
    const accept = await call('respondDraw', { gameId, accept: true }, white);
    expect(accept.status).toBe(200);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['status']).toBe('finished');
    expect(game?.['result']).toBe('draw');
    expect(game?.['endedBy']).toBe('draw-agreed');
  });

  it('a move clears the pending offer', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('offerDraw', { gameId }, black);
    await call('submitMove', { gameId, expectedMoveCount: 1, uhpMove: 'wS1' }, white);
    const game = await adminGetDoc(`games/${gameId}`);
    expect(game?.['pendingDrawOffer']).toBeUndefined();
  });

  it('rejects a second offer while one is pending, and self-response', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('offerDraw', { gameId }, white);
    expect((await call('offerDraw', { gameId }, black)).errorStatus).toBe('FAILED_PRECONDITION');
    expect((await call('respondDraw', { gameId, accept: true }, white)).errorStatus).toBe(
      'FAILED_PRECONDITION',
    );
  });

  it('rejects responding when nothing is pending', async () => {
    const { gameId, white } = await createJoinedGame(OPTIONS);
    expect((await call('respondDraw', { gameId, accept: true }, white)).errorStatus).toBe(
      'FAILED_PRECONDITION',
    );
  });
});

describe('rematch', () => {
  it('creates the colors-swapped return game linked via rematchOf', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('resign', { gameId }, white);
    const res = await call('rematch', { gameId }, black);
    expect(res.status).toBe(200);
    const newId = (res.result as { gameId: string }).gameId;
    expect(newId).not.toBe(gameId);

    const game = await adminGetDoc(`games/${newId}`);
    expect(game?.['status']).toBe('active');
    expect(game?.['rematchOf']).toBe(gameId);
    const players = game?.['players'] as Record<string, unknown>;
    // colors swapped: old white is new black
    expect(players['black']).toBe(white.uid);
    expect(players['white']).toBe(black.uid);
    expect(game?.['moveCount']).toBe(0);
  });

  it('is idempotent: both players get the same return game', async () => {
    const { gameId, white, black } = await createJoinedGame(OPTIONS);
    await call('resign', { gameId }, white);
    const a = await call('rematch', { gameId }, black);
    const b = await call('rematch', { gameId }, white);
    expect((a.result as { gameId: string }).gameId).toBe((b.result as { gameId: string }).gameId);
  });

  it('rejects rematch on an unfinished game', async () => {
    const { gameId, white } = await createJoinedGame(OPTIONS);
    const res = await call('rematch', { gameId }, white);
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });
});
