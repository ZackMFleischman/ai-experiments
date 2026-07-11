// The gallery registry: every visual state of the screens, reproducible by
// folding real engine moves (or hand-built positions) — never the clock or
// the network. validate:visual walks these × viewports × themes.
import Box from '@mui/material/Box';
import type { KeyValueStorage } from '@parlor/core';
import type { GalleryEntry } from '@parlor/harness';
import { applyCheckers, initialCheckers, type CheckersState } from '@checkers/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { Board } from '../board/Board';
import { GameScreen } from '../game/GameScreen';
import { createLocalSession, type CheckersSession } from '../game/localSession';
import { JoinCard } from '../screens/Join';
import { Landing } from '../screens/Landing';
import { Lobby } from '../screens/Lobby';

const memoryStorage = (): KeyValueStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

// ---- deterministic positions ------------------------------------------------

/** A real six-ply opening — two of them jumps — folded through the engine
 * (crashes loudly here if a listed move ever goes illegal, mandatory
 * captures included — the gallery is honest by force). */
function midGame(): CheckersState {
  let s = initialCheckers();
  for (const path of [
    [17, 26], // dark b3-c4
    [40, 33], // light a6-b5
    [26, 40], // dark c4×a6 — the mandatory jump
    [42, 33], // light c6-b5
    [19, 26], // dark d3-c4
    [33, 19], // light b5×d3 — mandatory again
  ]) {
    s = applyCheckers(s, { path });
  }
  return s;
}

/** A hand-built endgame: a crowned king each, dark a man up and closing. */
const ENDGAME: CheckersState = {
  board:
    '........' +
    '........' +
    '.....d..' +
    '........' +
    '...D....' +
    '..l.....' +
    '........' +
    '....L...',
  toMove: 'light',
  moveCount: 30,
  seen: {},
  result: null,
};

function HotSeatFixture() {
  const [session, setSession] = useState<CheckersSession | null>(null);
  useEffect(() => {
    void createLocalSession(memoryStorage()).then(setSession);
  }, []);
  if (!session) return null;
  return (
    <GameScreen session={session} mode={{ kind: 'hotseat' }} seatNames={[null, null]} onExit={() => {}} />
  );
}

const framed = (node: ReactNode): (() => ReactNode) =>
  function render() {
    return <Box sx={{ p: 2, maxWidth: 520, mx: 'auto' }}>{node}</Box>;
  };

export const GALLERY: GalleryEntry[] = [
  { id: 'landing', render: () => <Landing /> },
  { id: 'lobby-hotseat', render: () => <Lobby /> },
  { id: 'game-hotseat-start', render: () => <HotSeatFixture /> },
  { id: 'board-mid', render: framed(<Board state={midGame()} />) },
  { id: 'board-endgame', render: framed(<Board state={ENDGAME} />) },
  {
    id: 'join-card',
    render: framed(
      <JoinCard
        state={{
          kind: 'ready',
          hostName: 'Ada',
          hostSeat: 'dark',
          options: { timeControl: { days: 3 } },
        }}
        onAccept={() => {}}
      />,
    ),
  },
];
