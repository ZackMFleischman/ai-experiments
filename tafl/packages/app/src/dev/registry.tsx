// The gallery registry: every visual state of the screens, reproducible by
// folding real engine moves (or hand-built positions) — never the clock or
// the network. validate:visual walks these × viewports × themes.
import Box from '@mui/material/Box';
import type { KeyValueStorage } from '@parlor/core';
import type { GalleryEntry } from '@parlor/harness';
import { applyTafl, initialTafl, type TaflState } from '@tafl/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { Board } from '../board/Board';
import { GameScreen } from '../game/GameScreen';
import { createLocalSession, type TaflSession } from '../game/localSession';
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

/** A real four-ply opening, folded through the engine (crashes loudly here
 * if a listed move ever goes illegal — the gallery is honest by force). */
function midGame(): TaflState {
  let s = initialTafl();
  for (const move of [
    { from: 16, to: 12 }, // attacker sweeps left along the second rank
    { from: 38, to: 36 }, // the vanguard defender steps out
    { from: 3, to: 25 }, // attacker drops down the d-file
    { from: 48, to: 26 }, // a defender screens the e-file
  ]) {
    s = applyTafl(s, move);
  }
  return s;
}

/** A hand-built endgame: the king one step from the corner, guard thinned. */
const ENDGAME: TaflState = {
  board:
    '.K.........' +
    '..A........' +
    '...........' +
    'A....D.....' +
    '...........' +
    '....A......' +
    '...........' +
    '......D....' +
    '...........' +
    '.........A.' +
    '...........',
  toMove: 'defenders',
  moveCount: 22,
  seen: {},
  result: null,
};

function HotSeatFixture() {
  const [session, setSession] = useState<TaflSession | null>(null);
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
          hostSeat: 'attackers',
          options: { timeControl: { days: 3 } },
        }}
        onAccept={() => {}}
      />,
    ),
  },
];
