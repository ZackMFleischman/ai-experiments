// Player bar (T3.8): name, queen-liberties indicator, turn highlight.
import { Box, Chip, Typography } from '@mui/material';
import type { CellKey, Color } from '@hive/engine';
import type { Snapshot } from '../controller/GameController';
import { keyToHex } from '../board/hexGeometry';
import { neighbors } from '@hive/engine';

export function queenLiberties(snap: Snapshot, color: Color): number | null {
  let queenKey: CellKey | undefined;
  for (const [key, stack] of snap.state.board) {
    if (stack.some((t) => t.kind === 'Q' && t.color === color)) queenKey = key;
  }
  if (!queenKey) return null;
  const cell = keyToHex(queenKey);
  return neighbors(cell).filter((n) => !snap.state.board.has(`${n.q},${n.r}`)).length;
}

export function PlayerBar({ snap, color }: { snap: Snapshot; color: Color }) {
  const active = !snap.end && snap.toMove === color;
  const liberties = queenLiberties(snap, color);
  const name = color === 'w' ? 'White' : 'Black';
  return (
    <Box
      data-testid={`player-bar-${color}`}
      data-active={active || undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        borderLeft: 3,
        borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'action.hover' : 'transparent',
      }}
    >
      <Box
        sx={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          bgcolor: color === 'w' ? '#f3e9d2' : '#3a3733',
          border: 1,
          borderColor: 'divider',
        }}
      />
      <Typography variant="subtitle2" sx={{ fontWeight: active ? 700 : 500 }}>
        {name}
      </Typography>
      {snap.pendingDrawOffer === color && <Chip size="small" label="offered a draw" />}
      <Box sx={{ flex: 1 }} />
      {liberties !== null && (
        <Typography
          variant="caption"
          color={liberties <= 2 ? 'error' : 'text.secondary'}
          data-testid={`liberties-${color}`}
          title="Queen liberties"
        >
          ♛ {liberties}
        </Typography>
      )}
    </Box>
  );
}
