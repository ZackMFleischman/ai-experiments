// The §4.1 minimum gallery registry (T3.11). Every [visual] task's states,
// named and reproducible; validate:visual walks these × viewports × themes.
import { Box } from '@mui/material';
import { RULESETS } from '@lex/engine';
import type { GalleryEntry } from '@parlor/harness';
import { FULL_GAME, SCORELESS_GAME, TIE_GAME } from '../../../engine/test/fixtures/full-game';
import { BoardGrid, boardPixelSize } from '../board/BoardGrid';
import { BoardViewport } from '../board/BoardViewport';
import { GameBoard } from '../board/GameBoard';
import { RackTray } from '../board/RackTray';
import { GameActions } from '../game/GameActions';
import { PassDeviceInterstitial } from '../game/PassDeviceInterstitial';
import { ScoreSheet } from '../game/ScoreSheet';
import { AuthContext, HOTSEAT_AUTH } from '@parlor/web';
import { Landing } from '../screens/Landing';
import { fixtureController, WithController } from './fixtures';

const classic = RULESETS['classic']!;

function EmptyBoard({ rulesetId }: { rulesetId: string }) {
  const ruleset = RULESETS[rulesetId]!;
  const { width, height } = boardPixelSize(ruleset.board);
  return (
    <Box sx={{ height: '100dvh' }} data-gallery-ready>
      <BoardViewport boardWidth={width} boardHeight={height} view={null} onViewChange={() => {}}>
        <BoardGrid layout={ruleset.board} points={ruleset.tiles.points} tiles={new Map()} />
      </BoardViewport>
    </Box>
  );
}

const game = (make: Parameters<typeof WithController>[0]['make'], names?: readonly string[]) => (
  <WithController
    make={make}
    render={(c) => <GameBoard controller={c} {...(names ? { seatNames: names } : {})} />}
  />
);

/** Stage CATS from the rigged fresh rack (C A T S ? E R). */
const stageCats = (c: import('../controller/GameController').GameController) => {
  c.placeAt({ row: 7, col: 7 }, 0);
  c.placeAt({ row: 7, col: 8 }, 1);
  c.placeAt({ row: 7, col: 9 }, 2);
  c.placeAt({ row: 7, col: 10 }, 3);
};

const earlyGame = { ...FULL_GAME, moves: FULL_GAME.moves.slice(0, 2) };
const midGame = { ...FULL_GAME, moves: FULL_GAME.moves.slice(0, 6) };

// Full-mode landing (T4.2): sign-in against emulators, injected via context —
// no firebase in the gallery.
const FULL_EMULATOR_AUTH = { ...HOTSEAT_AUTH, mode: 'full' as const, emulators: true };

export const GALLERY: GalleryEntry[] = [
  {
    id: 'landing',
    render: () => (
      <Box data-gallery-ready>
        <Landing />
      </Box>
    ),
  },
  {
    id: 'landing-sign-in',
    render: () => (
      <AuthContext.Provider value={FULL_EMULATOR_AUTH}>
        <Box data-gallery-ready>
          <Landing />
        </Box>
      </AuthContext.Provider>
    ),
  },
  { id: 'board-empty-classic', render: () => <EmptyBoard rulesetId="classic" /> },
  { id: 'board-empty-modern', render: () => <EmptyBoard rulesetId="modern" /> },
  { id: 'board-early', render: () => game(() => fixtureController(earlyGame)) },
  { id: 'board-mid', render: () => game(() => fixtureController(midGame)) },
  {
    id: 'board-late',
    render: () =>
      game(() =>
        fixtureController(FULL_GAME, (c) => {
          c.finishBeat();
          c.dismissOverlay();
        }),
      ),
  },
  { id: 'pending-valid', render: () => game(() => fixtureController(null, stageCats)) },
  {
    id: 'pending-invalid-word',
    render: () => game(() => fixtureController(null, stageCats, ['CATS'])),
  },
  {
    id: 'pending-illegal-geometry',
    render: () =>
      game(() =>
        fixtureController(null, (c) => {
          c.placeAt({ row: 7, col: 7 }, 0);
          c.placeAt({ row: 7, col: 9 }, 2); // gap
        }),
      ),
  },
  {
    id: 'blank-picker',
    render: () =>
      game(() =>
        fixtureController(null, (c) => {
          c.placeAt({ row: 7, col: 7 }, 0);
          c.placeAt({ row: 7, col: 8 }, 4); // the blank, undesignated
        }),
      ),
  },
  {
    id: 'exchange-mode',
    render: () =>
      game(() =>
        fixtureController(null, (c) => {
          c.beginExchange();
          c.toggleExchange(0);
          c.toggleExchange(2);
        }),
      ),
  },
  {
    id: 'last-play',
    render: () =>
      game(() =>
        fixtureController(null, (c) => {
          stageCats(c);
          c.submitPlay();
        }),
      ),
  },
  {
    id: 'rack-full',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        <RackTray tiles={['C', 'A', 'T', 'S', '?', 'E', 'R']} rackSize={7} points={classic.tiles.points} bagCount={86} />
      </Box>
    ),
  },
  {
    id: 'rack-low',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        <RackTray tiles={['Q', 'Z', null, null, null, null, null]} rackSize={7} points={classic.tiles.points} bagCount={0} />
      </Box>
    ),
  },
  {
    id: 'rack-empty',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        <RackTray tiles={[null, null, null, null, null, null, null]} rackSize={7} points={classic.tiles.points} bagCount={0} />
      </Box>
    ),
  },
  {
    id: 'pass-device',
    render: () => (
      <Box data-gallery-ready>
        <PassDeviceInterstitial name="Player 2" onReveal={() => {}} />
      </Box>
    ),
  },
  {
    id: 'score-sheet',
    render: () => (
      <WithController
        make={() => fixtureController(midGame)}
        render={(c) => (
          <ScoreSheet open onClose={() => {}} rows={c.getSnapshot().sheet} names={['Player 1', 'Player 2']} />
        )}
      />
    ),
  },
  {
    id: 'ending-played-out-win',
    render: () => game(() => fixtureController(FULL_GAME, (c) => c.finishBeat()), ['You', 'Opponent']),
  },
  {
    id: 'ending-played-out-loss',
    render: () => game(() => fixtureController(FULL_GAME, (c) => c.finishBeat()), ['Opponent', 'You']),
  },
  {
    id: 'ending-scoreless',
    render: () => game(() => fixtureController(SCORELESS_GAME, (c) => c.finishBeat())),
  },
  {
    id: 'ending-draw',
    render: () => game(() => fixtureController(TIE_GAME, (c) => c.finishBeat())),
  },
  {
    id: 'ending-resign',
    render: () =>
      game(() => fixtureController({ ...TIE_GAME, moves: TIE_GAME.moves.slice(0, 2) }, (c) => c.resign(1))),
  },
  {
    id: 'ending-timeout',
    render: () =>
      game(() =>
        fixtureController({ ...TIE_GAME, moves: TIE_GAME.moves.slice(0, 2) }, undefined, [], [
          { kind: 'timeout', by: 0 },
        ]),
      ),
  },
  {
    id: 'confirm-pass',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        <GameActions
          playable={false}
          hasPending={false}
          interactive
          canExchange
          exchangeMinBag={7}
          bagCount={86}
          onPlay={() => {}}
          onRecall={() => {}}
          onExchange={() => {}}
          onPass={() => {}}
          onResign={() => {}}
          initialConfirm="pass"
        />
      </Box>
    ),
  },
  {
    id: 'confirm-resign',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        <GameActions
          playable={false}
          hasPending={false}
          interactive
          canExchange
          exchangeMinBag={7}
          bagCount={86}
          onPlay={() => {}}
          onRecall={() => {}}
          onExchange={() => {}}
          onPass={() => {}}
          onResign={() => {}}
          initialConfirm="resign"
        />
      </Box>
    ),
  },
];
