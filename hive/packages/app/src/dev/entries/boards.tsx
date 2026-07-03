import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { BoardView } from '../../board/BoardView';
import { ForcedBearMode } from '../../board/pieceArt';
import { EARLY_GAME, LATE_GAME, MID_GAME, replayUhp, TALL_STACK } from '../fixtures';

function Frame({ children }: { children: ReactNode }) {
  return <Box sx={{ width: '100%', height: '100dvh' }}>{children}</Box>;
}

export const boardEntries = [
  {
    id: 'board-empty',
    render: () => (
      <Frame>
        <BoardView board={new Map()} />
      </Frame>
    ),
  },
  {
    id: 'board-early',
    render: () => (
      <Frame>
        <BoardView board={replayUhp(EARLY_GAME).board} />
      </Frame>
    ),
  },
  {
    id: 'board-mid',
    render: () => (
      <Frame>
        <BoardView
          board={replayUhp(MID_GAME).board}
          ui={{ lastMove: { from: { q: -1, r: -1 }, to: { q: -1, r: 0 } } }}
        />
      </Frame>
    ),
  },
  {
    id: 'board-mid-bears',
    render: () => (
      <ForcedBearMode>
        <Frame>
          <BoardView board={replayUhp(MID_GAME).board} />
        </Frame>
      </ForcedBearMode>
    ),
  },
  {
    id: 'board-late',
    render: () => (
      <Frame>
        <BoardView board={replayUhp(LATE_GAME).board} />
      </Frame>
    ),
  },
  {
    id: 'board-tall-stack',
    render: () => (
      <Frame>
        <BoardView board={replayUhp(TALL_STACK).board} />
      </Frame>
    ),
  },
  {
    id: 'board-stack-fanned',
    render: () => (
      <Frame>
        <BoardView board={replayUhp(TALL_STACK).board} ui={{ fannedStack: '1,0' }} />
      </Frame>
    ),
  },
];
