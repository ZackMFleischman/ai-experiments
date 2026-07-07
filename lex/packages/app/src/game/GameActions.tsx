// The action row (T3.6/T3.7): Play is the primary CTA (contained, grows to
// fill); Recall pairs with it; Exchange / Pass are low-emphasis turn choices;
// Resign — rare and game-ending — lives in the ⋯ overflow so it never occupies
// the natural CTA slot. Pure props — enablement comes from the controller's
// verdicts upstream (the UI never computes rules). Pass and Resign confirm via
// dialog; Resign stays reachable off-turn (canResign) per DESIGN §2.3.
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { useState } from 'react';

export interface GameActionsProps {
  playable: boolean;
  hasPending: boolean;
  interactive: boolean;
  /** Resign is legal ANY time while the game runs (DESIGN §2.3) — even off
   * turn in multiplayer. Defaults to `interactive` for fixture back-compat. */
  canResign?: boolean;
  canExchange: boolean;
  exchangeMinBag: number;
  bagCount: number;
  onPlay: () => void;
  onRecall: () => void;
  onExchange: () => void;
  onPass: () => void;
  onResign: () => void;
  /** Gallery hook: open a confirm dialog on mount. */
  initialConfirm?: 'pass' | 'resign';
}

export function GameActions({
  playable,
  hasPending,
  interactive,
  canResign,
  canExchange,
  exchangeMinBag,
  bagCount,
  onPlay,
  onRecall,
  onExchange,
  onPass,
  onResign,
  initialConfirm,
}: GameActionsProps) {
  const [confirm, setConfirm] = useState<'pass' | 'resign' | null>(initialConfirm ?? null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const exchangeShort = interactive && !canExchange && bagCount < exchangeMinBag;
  const resignable = canResign ?? interactive;
  // Drop MUI's 64px button min-width so the secondary actions stay tight; Play
  // keeps a real footprint and grows to fill (T6.2). flexWrap is the safety net.
  const compact = { minWidth: 0, px: 1 } as const;

  return (
    <Box data-testid="game-actions" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, flexWrap: 'wrap' }}>
      {/* Primary CTA: grows to dominate the row so Play is unmistakably the
          action of the turn. */}
      <Button
        variant="contained"
        size="small"
        disabled={!playable}
        onClick={onPlay}
        sx={{ flexGrow: 1, minWidth: 64, px: 1.5, fontWeight: 700 }}
      >
        Play
      </Button>
      <Button variant="outlined" size="small" disabled={!hasPending} onClick={onRecall} sx={compact}>
        Recall
      </Button>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Button size="small" disabled={!interactive || !canExchange} onClick={onExchange} sx={compact}>
          Exchange
        </Button>
        {exchangeShort && (
          <Typography data-testid="exchange-reason" variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
            needs {exchangeMinBag} in bag
          </Typography>
        )}
      </Box>
      <Button size="small" disabled={!interactive} onClick={() => setConfirm('pass')} sx={compact}>
        Pass
      </Button>
      <IconButton
        size="small"
        aria-label="more actions"
        data-testid="more-actions"
        disabled={!resignable}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MenuItem
          data-testid="resign-action"
          onClick={() => {
            setMenuAnchor(null);
            setConfirm('resign');
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <FlagOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Resign
        </MenuItem>
      </Menu>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)}>
        <DialogTitle>{confirm === 'pass' ? 'Pass your turn?' : 'Resign the game?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirm === 'pass'
              ? 'You will score nothing this turn.'
              : 'Your opponent wins immediately.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={confirm === 'resign' ? 'error' : 'primary'}
            onClick={() => {
              if (confirm === 'pass') onPass();
              else onResign();
              setConfirm(null);
            }}
          >
            {confirm === 'pass' ? 'Pass' : 'Resign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
