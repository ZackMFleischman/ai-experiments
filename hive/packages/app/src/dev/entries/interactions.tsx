// Interaction-state entries (§6.2): controllers constructed directly into each
// state — no synthetic pointer events (IMPLEMENTATION §4.1).
import { Box } from '@mui/material';
import { hexToPixel } from '@hive/engine';
import type { ReactNode } from 'react';
import { GameBoard } from '../../board/GameBoard';
import { HEX_SIZE } from '../../board/hexGeometry';
import { GameController } from '../../controller/GameController';
import { LocalTransport } from '../../controller/transport';
import { ALL_ON } from '../fixtures';

function Frame({ children }: { children: ReactNode }) {
  return <Box sx={{ width: '100%', height: '100dvh' }}>{children}</Box>;
}

function ControllerBoard({ prepare }: { prepare: (c: GameController) => void }) {
  // Entries render synchronously from a controller settled in the target state.
  const c = new GameController(new LocalTransport(ALL_ON), ALL_ON);
  // Rebuild the MID_GAME position through tap-play so no transport async is needed.
  const taps: Array<['hand', string] | ['cell', number, number]> = [
    ['hand', 'S'], ['cell', 0, 0],
    ['hand', 'S'], ['cell', 1, 0],
    ['hand', 'Q'], ['cell', -1, 0],
    ['hand', 'Q'], ['cell', 2, 0],
    ['hand', 'B'], ['cell', 0, -1],
    ['hand', 'A'], ['cell', 3, 0],
  ];
  for (const t of taps) {
    if (t[0] === 'hand') c.selectHandBug(t[1] as never);
    else c.selectCell({ q: t[1], r: t[2] });
  }
  prepare(c);
  return (
    <Frame>
      <GameBoard controller={c} />
    </Frame>
  );
}

export const interactionEntries = [
  {
    id: 'interact-idle-movable',
    render: () => <ControllerBoard prepare={() => {}} />,
  },
  {
    id: 'interact-selected-ghosts',
    render: () => <ControllerBoard prepare={(c) => c.selectCell({ q: -1, r: 0 })} />,
  },
  {
    id: 'interact-beetle-climb',
    render: () => <ControllerBoard prepare={(c) => c.selectCell({ q: 0, r: -1 })} />,
  },
  {
    id: 'interact-drag-over-target',
    render: () => (
      <ControllerBoard
        prepare={(c) => {
          c.selectCell({ q: -1, r: 0 });
          const target = [...c.getSnapshot().targets][0];
          if (target) {
            const [q, r] = target.split(',').map(Number) as [number, number];
            const { x, y } = hexToPixel({ q, r }, HEX_SIZE);
            c.dragTo(x + 4, y - 3);
          }
        }}
      />
    ),
  },
  {
    id: 'interact-drag-over-invalid',
    render: () => (
      <ControllerBoard
        prepare={(c) => {
          c.selectCell({ q: -1, r: 0 });
          const { x, y } = hexToPixel({ q: 6, r: 3 }, HEX_SIZE);
          c.dragTo(x, y);
        }}
      />
    ),
  },
];

