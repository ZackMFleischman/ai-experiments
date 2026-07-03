// Piece reference (the "key"): every piece, its tile glyph, and how it moves.
// Rules text is descriptive only — legality still comes from the engine.
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import type { BugKind } from '@hive/engine';
import { useState } from 'react';
import '../board/board.css';
import { hexPoints } from '../board/hexGeometry';
import { BEAR_NAME, usePieceArt } from '../board/pieceArt';

const PIECES: ReadonlyArray<{ kind: BugKind; name: string; rule: string }> = [
  {
    kind: 'Q',
    name: 'Queen Bee',
    rule: 'Slides one space. Must be placed by your fourth turn — lose her to a full surround and you lose the game.',
  },
  { kind: 'A', name: 'Ant', rule: 'Slides any distance around the outside of the hive.' },
  { kind: 'S', name: 'Spider', rule: 'Slides exactly three spaces around the hive, no backtracking.' },
  {
    kind: 'G',
    name: 'Grasshopper',
    rule: 'Jumps in a straight line over one or more pieces to the first empty space.',
  },
  {
    kind: 'B',
    name: 'Beetle',
    rule: 'Moves one space, and may climb on top of the hive — the piece it covers is pinned.',
  },
  {
    kind: 'M',
    name: 'Mosquito',
    rule: 'Copies the movement of any piece it touches. On top of the hive it moves as a beetle.',
  },
  {
    kind: 'L',
    name: 'Ladybug',
    rule: 'Moves exactly two spaces on top of the hive, then one space down.',
  },
  {
    kind: 'P',
    name: 'Pillbug',
    rule: 'Moves one space, or instead lifts an adjacent piece and sets it down on an empty space beside it.',
  },
];

function GuideTile({ kind }: { kind: BugKind }) {
  const glyph = 46;
  const { symbolFor } = usePieceArt();
  return (
    <svg className="hive-board-scope" viewBox="-40 -40 80 80" width={44} height={44} aria-hidden>
      <g className="hive-tile-w">
        <polygon
          points={hexPoints(38)}
          fill="var(--hive-tile)"
          stroke="var(--hive-tile-edge)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <use href={`#${symbolFor(kind)}`} x={-glyph / 2} y={-glyph / 2} width={glyph} height={glyph} />
      </g>
    </svg>
  );
}

export function PieceGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bearMode } = usePieceArt();
  return (
    <Dialog open={open} onClose={onClose} scroll="paper" data-testid="piece-guide">
      <DialogTitle>How the pieces move</DialogTitle>
      <DialogContent dividers>
        <List dense disablePadding>
          {PIECES.map((p) => (
            <ListItem key={p.kind} disableGutters sx={{ alignItems: 'flex-start', gap: 1.5 }}>
              <GuideTile kind={p.kind} />
              <ListItemText
                primary={bearMode ? `${BEAR_NAME[p.kind]} · ${p.name}` : p.name}
                secondary={p.rule}
              />
            </ListItem>
          ))}
        </List>
        <Typography variant="caption" color="text.secondary">
          One hive, always: a move may never split the hive, and new pieces enter only beside
          your own color.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function PieceGuideButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton aria-label="piece guide" size="small" onClick={() => setOpen(true)}>
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <PieceGuideDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
