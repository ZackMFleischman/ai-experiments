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
import { NoticeToast } from '../game/NoticeToast';
import { HotSeatSetup } from '../game/HotSeatSetup';
import { PassDeviceInterstitial } from '../game/PassDeviceInterstitial';
import { ScoreSheet } from '../game/ScoreSheet';
import { AuthContext, HOTSEAT_AUTH, InstallCoachMark } from '@parlor/web';
import type { TileSkinId } from '../board/skin';
import { SkinContext } from '../board/skinContext';
import { Landing } from '../screens/Landing';
import { Settings } from '../screens/Settings';
import { LandingLayout } from '../screens/LandingLayout';
import { JoinCard } from '../screens/Join';
import { LobbyView, type LobbyGameSummary } from '../screens/lobbyView';
import { NewGameForm } from '../screens/newGameView';
import { WaitingForOpponent } from '../screens/waitingView';
import { fixtureController, fixturePublic, WithController } from './fixtures';

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

/** Pin a skin for a gallery entry (?static=1 determinism — no live context). */
const skinned = (skin: TileSkinId, node: React.ReactNode) => (
  <SkinContext.Provider value={{ skin, setSkin: () => {} }}>{node}</SkinContext.Provider>
);

const game = (make: Parameters<typeof WithController>[0]['make'], names?: readonly string[]) => (
  <WithController
    make={make}
    render={(c) => <GameBoard controller={c} {...(names ? { seatNames: names } : {})} />}
  />
);

/** Stage CATS from the rigged fresh rack (C A T S ? E R). */
/** A committed phoney: CATS staged and played in a 'costs-turn' game whose
 * dictionary refuses it. The beat is up until the caller dismisses it. */
const playedPhoney = () =>
  fixtureController(
    null,
    (c) => {
      stageCats(c);
      c.submitPlay();
    },
    ['CATS'],
    [],
    'costs-turn',
  );

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

// Lobby fixtures (T4.7): every group populated; timestamps pinned (?static=1
// determinism — `now` is fixed, so relative times never drift).
const LOBBY_NOW = 1_750_000_000_000;
const lobbyGame = (partial: Partial<LobbyGameSummary> & { id: string }): LobbyGameSummary => ({
  mySeat: 0,
  opponentName: 'Sam',
  status: 'active',
  toMove: 0,
  updatedAtMs: LOBBY_NOW - 8 * 60_000,
  public: fixturePublic(earlyGame),
  rulesetId: 'classic',
  scores: [24, 18],
  ...partial,
});
const LOBBY_GAMES: LobbyGameSummary[] = [
  lobbyGame({ id: 'c1', status: 'open', challenge: { direction: 'incoming', name: 'Ada' } }),
  lobbyGame({
    id: 'y1',
    toMove: 0,
    scores: [212, 198],
    lastPlay: { by: 1, word: 'QUIZ', score: 68 },
    public: fixturePublic(midGame),
    deadlineAtMs: LOBBY_NOW + 26 * 3_600_000,
  }),
  lobbyGame({
    id: 'w1',
    toMove: 1,
    opponentName: 'Noor',
    updatedAtMs: LOBBY_NOW - 3_600_000,
    // Waiting card: the opponent's clock is visible too (current player's deadline).
    deadlineAtMs: LOBBY_NOW + 9 * 3_600_000,
  }),
  lobbyGame({ id: 'o1', status: 'open', opponentName: null, updatedAtMs: LOBBY_NOW - 60_000 }),
  lobbyGame({
    id: 'f1',
    status: 'finished',
    result: 'p0',
    scores: [301, 288],
    public: fixturePublic(FULL_GAME),
  }),
  lobbyGame({ id: 'f2', status: 'finished', result: 'draw', scores: [212, 212] }),
];

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
  {
    id: 'coach-mark',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2, maxWidth: 480 }}>
        <InstallCoachMark onDismiss={() => {}} />
      </Box>
    ),
  },
  {
    id: 'lobby',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2, maxWidth: 560 }}>
        <LobbyView games={LOBBY_GAMES} now={LOBBY_NOW} onOpen={() => {}} onRespondChallenge={() => {}} />
      </Box>
    ),
  },
  {
    id: 'lobby-empty',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2 }}>
        <LobbyView games={[]} now={LOBBY_NOW} onOpen={() => {}} onNewGame={() => {}} />
      </Box>
    ),
  },
  // The hot-seat creation form: the same option pickers as `new-game`, minus
  // the settings one device can't honour (turn order, the clock).
  {
    id: 'hotseat-setup',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2 }}>
        <HotSeatSetup onStart={() => {}} />
      </Box>
    ),
  },
  {
    id: 'new-game',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2 }}>
        <NewGameForm
          onCreate={() => {}}
          friends={[
            { uid: 'u1', name: 'Sam' },
            { uid: 'u2', name: 'Noor' },
          ]}
        />
      </Box>
    ),
  },
  {
    id: 'join',
    render: () => (
      <Box data-gallery-ready>
        <LandingLayout>
          <JoinCard
            state={{
              kind: 'ready',
              hostName: 'Ada',
              hostSeat: 'p0',
              options: {
                rulesetId: 'classic',
                dictionaryId: '2of12inf',
                timeControl: { days: 3 },
                invalidWords: 'costs-turn',
              },
            }}
            onAccept={() => {}}
          />
        </LandingLayout>
      </Box>
    ),
  },
  {
    id: 'waiting',
    render: () => (
      <Box data-gallery-ready>
        <WaitingForOpponent code="LEX4EVER" onCancel={() => {}} />
      </Box>
    ),
  },
  { id: 'board-empty-classic', render: () => <EmptyBoard rulesetId="classic" /> },
  { id: 'board-empty-modern', render: () => <EmptyBoard rulesetId="modern" /> },
  // Tile skins (T6.1): §4.1 requires the empty board per skin; the mid-game
  // variants put real tiles/premiums/rack under each palette for review.
  {
    id: 'board-empty-walnut',
    render: () => skinned('walnut', <EmptyBoard rulesetId="classic" />),
  },
  {
    id: 'board-empty-high-contrast',
    render: () => skinned('high-contrast', <EmptyBoard rulesetId="classic" />),
  },
  {
    id: 'board-mid-walnut',
    render: () => skinned('walnut', game(() => fixtureController(midGame))),
  },
  {
    id: 'board-mid-high-contrast',
    render: () => skinned('high-contrast', game(() => fixtureController(midGame))),
  },
  {
    id: 'settings',
    render: () => (
      <Box data-gallery-ready>
        <Settings />
      </Box>
    ),
  },
  { id: 'board-early', render: () => game(() => fixtureController(earlyGame)) },
  { id: 'board-mid', render: () => game(() => fixtureController(midGame)) },
  // Long full names must shorten to first names (no bar-wrapping, DESIGN §7.1).
  {
    id: 'board-long-names',
    render: () => game(() => fixtureController(midGame), ['Mike Borrebach', 'Zachary Fleischman']),
  },
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
  // The case the preview card exists for: a play that forms cross words. As
  // chips (one per word, anchored over each word's first cell) these piled
  // onto each other and onto the letters; as one card they stack in rows.
  {
    id: 'pending-cross-words',
    render: () =>
      game(() =>
        fixtureController(midGame, (c) => {
          // Three tiles under the row-7 word: the main word plus a cross word
          // per tile — four scores, whose chips used to land on top of each
          // other and on the letters they annotated.
          c.placeAt({ row: 8, col: 1 }, 0);
          c.placeAt({ row: 8, col: 2 }, 1);
          c.placeAt({ row: 8, col: 3 }, 2);
        }),
      ),
  },
  // The worst case the card has to stay readable in: a seven-tile bingo laid
  // under a full row — eight words, the bonus line, and the total.
  {
    id: 'pending-bingo',
    render: () =>
      game(() =>
        fixtureController(midGame, (c) => {
          for (let i = 0; i < 7; i++) c.placeAt({ row: 8, col: 1 + i }, i);
        }),
      ),
  },
  // invalidWords: 'costs-turn' (§2.3): the same staged play as `pending-valid`,
  // with the dictionary column withheld — every row's mark is a "—" and nothing
  // on the card or the board can be red, however bad the word is.
  {
    id: 'pending-words-unchecked',
    render: () => game(() => fixtureController(null, stageCats, ['CATS'], [], 'costs-turn')),
  },
  // The moment that setting exists for: the verdict comes due after the commit.
  {
    id: 'phoney-beat',
    render: () => game(playedPhoney),
  },
  // What the NEXT player arrives to. The board is untouched, so this strip is
  // the only thing on screen saying a turn was just burned.
  {
    id: 'phoney-banner',
    render: () =>
      game(async () => {
        const c = await playedPhoney();
        c.dismissPhoney();
        return c;
      }),
  },
  // The same turn in the history both players read: marked, not just worded.
  {
    id: 'score-sheet-phoney',
    render: () => (
      <WithController
        make={playedPhoney}
        render={(c) => (
          <ScoreSheet open onClose={() => {}} rows={c.getSnapshot().sheet} names={['Player 1', 'Player 2']} />
        )}
      />
    ),
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
  // A play that BRIDGES committed tiles, laid out of reading order: the score
  // badge has to follow the word, not the last tile dropped (which is what put
  // it on top of a letter).
  {
    id: 'last-play-bridged',
    render: () =>
      game(() =>
        fixtureController(null, (c) => {
          stageCats(c);
          c.submitPlay();
          c.placeAt({ row: 7, col: 11 }, 1);
          c.placeAt({ row: 7, col: 6 }, 0);
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
    id: 'notice-toast',
    render: () => (
      <>
        {game(() => fixtureController(midGame))}
        <NoticeToast notice={{ id: 1, text: 'Move rejected — undone.' }} />
      </>
    ),
  },
  {
    id: 'actions-idle',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        {/* Nothing staged: Play is the dimmed-but-dominant CTA; Recall is
            disabled; Exchange/Pass sit low-emphasis; Resign hides in ⋯. */}
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
        />
      </Box>
    ),
  },
  {
    id: 'actions-playable',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        {/* A valid move staged: Play lights up as the full-width primary CTA. */}
        <GameActions
          playable
          hasPending
          interactive
          canExchange
          exchangeMinBag={7}
          bagCount={86}
          onPlay={() => {}}
          onRecall={() => {}}
          onExchange={() => {}}
          onPass={() => {}}
          onResign={() => {}}
        />
      </Box>
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
  {
    id: 'confirm-play',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        {/* Opt-in "Confirm before playing": Play routes through the same dialog. */}
        <GameActions
          playable
          hasPending
          interactive
          canExchange
          exchangeMinBag={7}
          bagCount={86}
          confirmBeforePlay
          playScore={24}
          onPlay={() => {}}
          onRecall={() => {}}
          onExchange={() => {}}
          onPass={() => {}}
          onResign={() => {}}
          initialConfirm="play"
        />
      </Box>
    ),
  },
];
