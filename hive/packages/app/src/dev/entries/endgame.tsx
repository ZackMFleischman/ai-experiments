// End-of-game entries (T3.9): every outcome, beat frame included.
import type { GameOptions } from '@hive/engine';
import { useEffect, useState } from 'react';
import { GameController } from '../../controller/GameController';
import { LocalTransport } from '../../controller/transport';
import { GameScreen } from '../../game/GameScreen';

const BASE_TOURNAMENT: GameOptions = {
  mosquito: false,
  ladybug: false,
  pillbug: false,
  tournamentOpening: true,
};

const SURROUND_WIN = [
  'wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-', 'wA1 \\wQ', 'bA1 bQ-', 'wA1 \\bQ',
  'bG1 bA1-', 'wA2 -wQ', 'bG2 bG1-', 'wA2 \\bA1', 'bG3 bG2-', 'wA3 /wQ',
  'bB1 bG1\\', 'wA3 /bQ', 'bB1 bG1', 'wG1 \\wA1', 'bB1 bA1/', 'wG1 wA3-',
];

const REPETITION = [
  'wS1', 'bS1 wS1-', 'wQ -wS1', 'bQ bS1-', 'wQ \\wS1', 'bQ bS1/',
  'wQ -wS1', 'bQ bS1-', 'wQ \\wS1', 'bQ bS1/', 'wQ -wS1', 'bQ bS1-',
];

function EndedEntry({
  moves,
  prepare,
}: {
  moves: string[];
  prepare?: (c: GameController) => void;
}) {
  const [controller, setController] = useState<GameController | null>(null);
  useEffect(() => {
    void (async () => {
      const transport = new LocalTransport(BASE_TOURNAMENT);
      await transport.reset(BASE_TOURNAMENT);
      for (let i = 0; i < moves.length; i++) {
        await transport.submit({ kind: 'move', uhp: moves[i] as string }, i);
      }
      const c = new GameController(transport, BASE_TOURNAMENT);
      await c.init();
      prepare?.(c);
      setController(c);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!controller) return null;
  return <GameScreen controller={controller} staticMode />;
}

export const endgameEntries = [
  {
    id: 'end-beat-surround',
    render: () => <EndedEntry moves={SURROUND_WIN} />,
  },
  {
    id: 'end-overlay-surround-win',
    render: () => <EndedEntry moves={SURROUND_WIN} prepare={(c) => c.finishBeat()} />,
  },
  {
    id: 'end-overlay-draw-repetition',
    render: () => <EndedEntry moves={REPETITION} prepare={(c) => c.finishBeat()} />,
  },
  {
    id: 'end-overlay-resign',
    render: () => <EndedEntry moves={SURROUND_WIN.slice(0, 8)} prepare={(c) => c.resign('b')} />,
  },
  {
    id: 'end-overlay-draw-agreed',
    render: () => (
      <EndedEntry
        moves={SURROUND_WIN.slice(0, 8)}
        prepare={(c) => {
          c.offerDraw('w');
          c.respondDraw('b', true);
        }}
      />
    ),
  },
  {
    id: 'end-view-board-banner',
    render: () => (
      <EndedEntry
        moves={SURROUND_WIN}
        prepare={(c) => {
          c.finishBeat();
          c.dismissOverlay();
        }}
      />
    ),
  },
  {
    id: 'game-screen-midgame',
    render: () => <EndedEntry moves={SURROUND_WIN.slice(0, 9)} />,
  },
  {
    id: 'game-screen-queen-pulse',
    render: () => (
      <EndedEntry
        moves={['wS1', 'bS1 wS1-', 'wA1 -wS1', 'bA1 bS1-', 'wA2 -wA1', 'bA2 bA1-']}
      />
    ),
  },
];
