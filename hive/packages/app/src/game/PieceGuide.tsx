// Piece reference (the "key"): every piece, its tile glyph, and how it moves,
// plus the rest of the rules at the bottom. Rules text is descriptive only —
// legality still comes from the engine.
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { BugKind } from '@hive/engine';
import { useState } from 'react';
import '../board/board.css';
import { hexPoints } from '../board/hexGeometry';
import { BEAR_NAME, usePieceArt } from '../board/pieceArt';
import { FittedGlyph } from '../board/sprites';
import { GAME_RULES, PIECES } from './pieceInfo';

export function GuideTile({ kind, size = 44 }: { kind: BugKind; size?: number }) {
  const { symbolFor } = usePieceArt();
  return (
    <svg
      className="hive-board-scope"
      viewBox="-40 -40 80 80"
      width={size}
      height={size}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <g className="hive-tile-w">
        <polygon
          points={hexPoints(38)}
          fill="var(--hive-tile)"
          stroke="var(--hive-tile-edge)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <FittedGlyph symbol={symbolFor(kind)} size={46} />
      </g>
    </svg>
  );
}

export function PieceGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bearMode, toggle } = usePieceArt();
  return (
    <Dialog open={open} onClose={onClose} scroll="paper" data-testid="piece-guide">
      <DialogTitle>How the pieces move</DialogTitle>
      <DialogContent dividers>
        <List dense disablePadding>
          {PIECES.map((p) => (
            <ListItem key={p.kind} disableGutters sx={{ alignItems: 'center', gap: 1.5 }}>
              <GuideTile kind={p.kind} />
              <ListItemText
                primary={bearMode ? `${BEAR_NAME[p.kind]} · ${p.name}` : p.name}
                secondary={p.rule}
              />
            </ListItem>
          ))}
        </List>
        <Typography variant="overline" color="text.secondary" component="h3" sx={{ mt: 2 }}>
          How the game works
        </Typography>
        <Stack spacing={0.75} data-testid="rules-summary">
          {GAME_RULES.map((r) => (
            <Typography key={r.title} variant="body2" color="text.secondary">
              <Typography component="span" variant="body2" fontWeight={700} color="text.primary">
                {r.title}.
              </Typography>{' '}
              {r.text}
            </Typography>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        {/* Reachable from any game in progress via the ? button — the list
            above re-renders live when toggled. */}
        <FormControlLabel
          control={
            <Switch
              checked={bearMode}
              onChange={toggle}
              size="small"
              inputProps={{ 'data-testid': 'guide-bear-toggle' } as never}
            />
          }
          label="Bear mode"
        />
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
