// Long-press piece info (touch): a small card floated over the board naming
// the held piece and how it moves. Desktop hover gets the same copy via
// native <title> tooltips on tiles. Purely presentational — never intercepts
// pointer events, so the §6.2 drag/tap machine is untouched.
import { Paper, Typography } from '@mui/material';
import type { BugKind } from '@hive/engine';
import { BEAR_NAME, usePieceArt } from '../board/pieceArt';
import { GuideTile } from './PieceGuide';
import { PIECE_INFO } from './pieceInfo';

export function PieceInfoCard({ kind }: { kind: BugKind | null }) {
  const { bearMode } = usePieceArt();
  if (!kind) return null;
  const info = PIECE_INFO[kind];
  return (
    <Paper
      elevation={4}
      data-testid="piece-info-card"
      sx={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(92%, 360px)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <GuideTile kind={kind} size={40} />
      <div>
        <Typography variant="subtitle2">
          {bearMode ? `${BEAR_NAME[kind]} · ${info.name}` : info.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {info.rule}
        </Typography>
      </div>
    </Paper>
  );
}
