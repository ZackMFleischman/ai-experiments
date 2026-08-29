// The §4.1 minimum gallery registry (T3.11). Every [visual] task's states,
// named and reproducible; validate:visual walks these × viewports × themes.
import { Box } from '@mui/material';
import { RULESETS, turnQueue } from '@lex/engine';
import type { GameState, Seat } from '@lex/engine';
import type { GalleryEntry } from '@parlor/harness';
import { FULL_GAME, SCORELESS_GAME, TIE_GAME } from '../../../engine/test/fixtures/full-game';
import { BoardGrid, boardPixelSize } from '../board/BoardGrid';
import { BoardViewport } from '../board/BoardViewport';
import { GameBoard } from '../board/GameBoard';
import { RackTray } from '../board/RackTray';
import { GameActions } from '../game/GameActions';
import { NoticeToast } from '../game/NoticeToast';
import { PassDeviceInterstitial } from '../game/PassDeviceInterstitial';
import { ScoreBar } from '../game/ScoreBar';
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
import {
  finishedTableController,
  fixtureController,
  fixturePublic,
  playWord,
  scorelessTableController,
  seatedState,
  tableController,
  WithController,
} from './fixtures';

const classic = RULESETS['classic']!;

// T7.15: a four-handed new game, two of the three past opponents invited.
const FOUR_HANDED = {
  friends: [
    { uid: 'u1', name: 'Sam' },
    { uid: 'u2', name: 'Noor' },
    { uid: 'u3', name: 'Kai' },
  ],
  initial: {
    players: 4,
    invite: [
      { uid: 'u1', name: 'Sam' },
      { uid: 'u2', name: 'Noor' },
    ],
  },
};

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
const stageCats = (c: import('../controller/GameController').GameController) => {
  c.placeAt({ row: 7, col: 7 }, 0);
  c.placeAt({ row: 7, col: 8 }, 1);
  c.placeAt({ row: 7, col: 9 }, 2);
  c.placeAt({ row: 7, col: 10 }, 3);
};

// A four-handed table (T7.14). Ada (seat 0, the reader) opens; then three
// turns happen before it comes back to her — exactly the gap the catch-up
// player exists for. Every row is real recorded verdict data.
const TABLE_NAMES = ['Ada', 'Sam', 'Noor', 'Kai'];
const down = (col: number, rows: readonly number[]) => rows.map((row) => ({ row, col }));
const across = (row: number, cols: readonly number[]) => cols.map((col) => ({ row, col }));

type C = import('../controller/GameController').GameController;

/** Ada plays CATS; Sam passes; Noor plays MINA; Kai plays TOE. */
const tableOpening = (c: C) => {
  playWord(c, 'CATS', across(7, [7, 8, 9, 10])); // Ada
  c.pass(); // Sam
  playWord(c, 'MIN', down(8, [4, 5, 6])); // Noor — MINA, down onto Ada's A
  playWord(c, 'OE', down(9, [8, 9])); // Kai — TOE, down off Ada's T
};

/** …and a second time round the table, so the sheet has two full rounds. */
const tableTwoRounds = (c: C) => {
  tableOpening(c);
  playWord(c, 'RAT', down(10, [4, 5, 6])); // Ada — RATS, down onto her own S
  c.exchangeTiles([0, 1, 2]); // Sam
  c.pass(); // Noor
  c.pass(); // Kai
};

/** The N-seat player bar (T7.13): the turn line from the reader's seat, plus a
 * standings rail ordered by the ENGINE's turn queue (each row carries its
 * 1-based position; a withdrawn seat has none and is marked out). */
const seatBar = (
  state: GameState,
  bar: { names: readonly string[]; scores: readonly number[]; mySeat: Seat },
) => (
  <Box data-gallery-ready>
    <ScoreBar
      names={bar.names}
      scores={bar.scores}
      toMove={state.toMove}
      mySeat={bar.mySeat}
      queue={turnQueue(state)}
      withdrawn={state.withdrawn}
      onOpenSheet={() => {}}
      onBack={() => {}}
      onInfo={() => {}}
    />
  </Box>
);

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

// T7.16: the lobby card at a TABLE — the title names everyone else, and the
// caption is two lines (the standing, then what last happened). Seat indices
// and placings are the summary's, exactly as the sync layer maps them.
const TABLE_LOBBY_GAMES: LobbyGameSummary[] = [
  lobbyGame({
    id: 't1',
    mySeat: 1,
    toMove: 1,
    seatCount: 4,
    scores: [212, 198, 176, 143],
    opponents: [
      { uid: 'u1', name: 'Ada', seat: 0 },
      { uid: 'u2', name: 'Noor', seat: 2 },
      { uid: 'u3', name: 'Kai', seat: 3 },
    ],
    lastPlay: { by: 3, word: 'JINX', score: 40 },
    public: fixturePublic(midGame),
    deadlineAtMs: LOBBY_NOW + 26 * 3_600_000,
  }),
  // An open room genuinely has no `public` — the deal hasn't happened (T7.12),
  // so this card drops it rather than borrowing another game's board.
  (({ public: _unstarted, ...room }) =>
    room)(
    lobbyGame({
      id: 't2',
      status: 'open',
      opponentName: null,
      seatCount: 4,
      openSeats: 2,
      opponents: [{ uid: 'u1', name: 'Ada' }],
      updatedAtMs: LOBBY_NOW - 4 * 60_000,
    }),
  ),
  lobbyGame({
    id: 't3',
    status: 'finished',
    mySeat: 2,
    toMove: 0,
    seatCount: 3,
    scores: [212, 244, 198],
    // Kai left with the best score and still places last (DECISIONS
    // 2026-08-28) — the card reads the standings, it never re-ranks them.
    standings: [[0], [2], [1]],
    withdrawn: [1],
    result: 'p0',
    opponents: [
      { uid: 'u1', name: 'Ada', seat: 0 },
      { uid: 'u3', name: 'Kai', seat: 1 },
    ],
    public: fixturePublic(FULL_GAME),
  }),
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
  // T7.16: 3+ lobby cards — a four-handed game in play, an open room, and a
  // finished table whose withdrawn player outscored the winner.
  {
    id: 'lobby-table',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2, maxWidth: 560 }}>
        <LobbyView games={TABLE_LOBBY_GAMES} now={LOBBY_NOW} onOpen={() => {}} />
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
              options: { rulesetId: 'classic', dictionaryId: '2of12inf', timeControl: { days: 3 } },
            }}
            onAccept={() => {}}
          />
        </LandingLayout>
      </Box>
    ),
  },
  // T7.15: the same form at a four-handed table — the count picker, the
  // multi-select invite chips, the shared 3+ turn-order picker and the pace of
  // a round at four.
  {
    id: 'new-game-4p',
    render: () => (
      <Box data-gallery-ready sx={{ p: 2 }}>
        <NewGameForm onCreate={() => {}} {...FOUR_HANDED} />
      </Box>
    ),
  },
  // The form is taller than any viewport, so the entry above frames its head
  // (count picker + invite chips) and this one its tail: the 3+ turn-order
  // picker and the pace of a round at four.
  {
    id: 'new-game-4p-pace',
    render: () => (
      <Box
        data-gallery-ready
        sx={{
          height: '100dvh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          // Taller than the frame: flex-end pushes the overflow past the TOP,
          // so the capture lands on the tail of the form.
          justifyContent: 'flex-end',
          p: 2,
        }}
      >
        <NewGameForm onCreate={() => {}} {...FOUR_HANDED} />
      </Box>
    ),
  },
  // The 3+ join preview: the room's guest list before you accept, and the
  // closed variant for a room whose last place went to somebody else.
  {
    id: 'join-room',
    render: () => (
      <Box data-gallery-ready>
        <LandingLayout>
          <JoinCard
            state={{
              kind: 'room',
              hostName: 'Ada',
              names: ['Ada', 'Sam'],
              filled: 2,
              maxPlayers: 4,
              options: { rulesetId: 'classic', dictionaryId: '2of12inf', timeControl: { days: 3 } },
            }}
            onAccept={() => {}}
          />
        </LandingLayout>
      </Box>
    ),
  },
  {
    id: 'join-room-full',
    render: () => (
      <Box data-gallery-ready>
        <LandingLayout>
          <JoinCard state={{ kind: 'closed' }} onAccept={() => {}} />
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
  // Three seats, Sam to move: the rail leads with the seat to move, numbered
  // 1-2-3 around the table, read from Ada's seat.
  {
    id: 'score-bar-3-seats',
    render: () =>
      seatBar(seatedState(3, { passes: 1 }), {
        names: ['Ada', 'Sam', 'Noor'],
        scores: [124, 98, 131],
        mySeat: 0,
      }),
  },
  // Four seats — the widest rail — from the seat to move ("Your turn").
  {
    id: 'score-bar-4-seats',
    render: () =>
      seatBar(seatedState(4, { passes: 2 }), {
        names: ['Ada', 'Sam', 'Noor', 'Kai'],
        scores: [124, 98, 131, 76],
        mySeat: 2,
      }),
  },
  // Four seats with Kai withdrawn: no numeral, muted, marked out — and the
  // three still playing renumber 1-2-3.
  {
    id: 'score-bar-4-seats-withdrawn',
    render: () =>
      seatBar(seatedState(4, { passes: 1, out: [3] }), {
        names: ['Ada', 'Sam', 'Noor', 'Kai'],
        scores: [124, 98, 131, 76],
        mySeat: 0,
      }),
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
  // Four-handed, mid-review (T7.14): the board is rewound to Noor's MINA —
  // Kai's TOE is not on it yet — with that move highlighted and the bar
  // saying whose it was. The rack and the action row stay live below.
  {
    id: 'catch-up-review',
    render: () => (
      <WithController
        make={() =>
          tableController(4, (c) => {
            tableOpening(c);
            c.reviewStep(-1);
          })
        }
        render={(c) => <GameBoard controller={c} seatNames={TABLE_NAMES} />}
      />
    ),
  },
  // The same table with the cursor parked on the newest move: the board is
  // live (Live and › are spent) and the bar is a caption of what you missed.
  {
    id: 'catch-up-live',
    render: () => (
      <WithController
        make={() => tableController(4, tableOpening)}
        render={(c) => <GameBoard controller={c} seatNames={TABLE_NAMES} />}
      />
    ),
  },
  // The columnar sheet at four seats: a column per player, a row per round,
  // running totals footing each column (the flat list this replaced joined
  // four totals with dashes).
  {
    id: 'score-sheet-4-seats',
    render: () => (
      <WithController
        make={() => tableController(4, tableTwoRounds)}
        render={(c) => (
          <ScoreSheet open onClose={() => {}} rows={c.getSnapshot().sheet} names={TABLE_NAMES} />
        )}
      />
    ),
  },
  // At 3+ seats leaving is a WITHDRAWAL, not the end of the game — the
  // confirm has to say so (the two-seat copy is confirm-resign, above).
  {
    id: 'confirm-withdraw',
    render: () => (
      <Box sx={{ p: 2 }} data-gallery-ready>
        <GameActions
          playable={false}
          hasPending={false}
          interactive
          seats={4}
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
  // T7.16 — the DECISIONS 2026-08-28 case, made visible: Ada and Sam left the
  // four-handed game, Ada holding the top score, and the podium still places
  // them below Noor and Kai, who played it out. The rail above reads by
  // PLACING (the game is over), not by turn order.
  {
    id: 'ending-4-seats-withdrawn',
    render: () => (
      <WithController
        make={() =>
          finishedTableController({ seats: 4, script: tableTwoRounds, out: [0, 1], mySeat: 2 })
        }
        render={(c) => <GameBoard controller={c} seatNames={TABLE_NAMES} />}
      />
    ),
  },
  // Three seats, two of them level at the top: a shared 1st on the podium and
  // a headline that names them (the two-seat "apiece" draw is below).
  {
    id: 'ending-3-seats-tie',
    render: () => (
      <WithController
        make={() =>
          scorelessTableController([
            ['A', 'E', 'I', 'O', 'U', 'S', 'T'],
            ['A', 'E', 'I', 'O', 'U', 'S', 'T'],
            ['Q', 'Z', 'J', 'X', 'K', 'V', 'W'],
          ])
        }
        render={(c) => <GameBoard controller={c} seatNames={['Ada', 'Sam', 'Noor']} />}
      />
    ),
  },
  // Two seats, and the WINNER IS SEAT 1: the podium leads with them, which the
  // old seat-ordered score list could not do (the one accepted two-seat change).
  {
    id: 'ending-winner-second-seat',
    render: () =>
      game(
        () => fixtureController({ ...TIE_GAME, moves: TIE_GAME.moves.slice(0, 2) }, (c) => c.resign(0)),
        ['Ada', 'Sam'],
      ),
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
