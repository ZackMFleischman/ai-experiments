// The action row (T3.6/T3.7, updated for accidental-submit safety): the
// secondary actions — Recall / Exchange / Pass — are a compact icon cluster on
// the LEFT; Play is the prominent contained CTA pinned to the RIGHT ("thumb
// corner"), separated from the cluster by a spacer so a reach for Recall can't
// fat-finger a turn commit. Resign — rare and game-ending — stays in the ⋯
// overflow so it never occupies the CTA slot. Pure props — enablement comes
// from the controller's verdicts upstream (the UI never computes rules). Pass
// and Resign always confirm via dialog; Play confirms only when the
// "Confirm before playing" setting is on (confirmBeforePlay). Resign stays
// reachable off-turn (canResign) per DESIGN §2.3.
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ReplayIcon from '@mui/icons-material/Replay';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';

// Screen-reader-only style (MUI's visuallyHidden, inlined to avoid an extra
// @mui/utils dependency): keeps the exchange-shortfall reason in the a11y tree
// without occupying visual space in the icon cluster.
const srOnly = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

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
  /** When true, Play opens a confirm dialog before committing (Settings opt-in). */
  confirmBeforePlay?: boolean;
  /** Preview score, used to enrich the Play-confirm copy when available. */
  playScore?: number | undefined;
  onPlay: () => void;
  onRecall: () => void;
  onExchange: () => void;
  onPass: () => void;
  onResign: () => void;
  /** Gallery hook: open a confirm dialog on mount. */
  initialConfirm?: 'pass' | 'resign' | 'play';
}

/** ≥44px hit target (NFR-7); the icon cluster stays tight but tappable. */
const iconBtn = { width: 44, height: 44 } as const;

export function GameActions({
  playable,
  hasPending,
  interactive,
  canResign,
  canExchange,
  exchangeMinBag,
  bagCount,
  confirmBeforePlay,
  playScore,
  onPlay,
  onRecall,
  onExchange,
  onPass,
  onResign,
  initialConfirm,
}: GameActionsProps) {
  const [confirm, setConfirm] = useState<'pass' | 'resign' | 'play' | null>(initialConfirm ?? null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const exchangeShort = interactive && !canExchange && bagCount < exchangeMinBag;
  const resignable = canResign ?? interactive;
  const exchangeDisabled = !interactive || !canExchange;
  const exchangeTitle = exchangeShort ? `Exchange — needs ${exchangeMinBag} in bag` : 'Exchange';

  const dialogCopy = {
    pass: { title: 'Pass your turn?', body: 'You will score nothing this turn.', cta: 'Pass', color: 'primary' as const },
    resign: { title: 'Resign the game?', body: 'Your opponent wins immediately.', cta: 'Resign', color: 'error' as const },
    play: {
      title: 'Play your move?',
      body:
        playScore != null
          ? `Submit for +${playScore} ${playScore === 1 ? 'point' : 'points'}? This ends your turn.`
          : 'Submit your move? This ends your turn.',
      cta: 'Play',
      color: 'primary' as const,
    },
  };

  return (
    <Box
      data-testid="game-actions"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5 }}
    >
      {/* Secondary actions: a compact icon cluster, kept away from Play. */}
      <Tooltip title="Recall">
        <span>
          <IconButton aria-label="Recall" disabled={!hasPending} onClick={onRecall} sx={iconBtn}>
            <ReplayIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={exchangeTitle}>
        <span>
          <IconButton aria-label="Exchange" disabled={exchangeDisabled} onClick={onExchange} sx={iconBtn}>
            <SwapHorizIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {exchangeShort && (
        <Typography data-testid="exchange-reason" component="span" sx={srOnly}>
          needs {exchangeMinBag} in bag
        </Typography>
      )}
      <Tooltip title="Pass">
        <span>
          <IconButton aria-label="Pass" disabled={!interactive} onClick={() => setConfirm('pass')} sx={iconBtn}>
            <SkipNextIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="More actions">
        <span>
          <IconButton
            aria-label="more actions"
            data-testid="more-actions"
            disabled={!resignable}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={iconBtn}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {/* Spacer pushes Play to the far right — the thumb corner — so it never
          sits adjacent to a secondary action. */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Primary CTA: prominent, isolated on the right. */}
      <Button
        variant="contained"
        disabled={!playable}
        onClick={() => (confirmBeforePlay ? setConfirm('play') : onPlay())}
        sx={{ minWidth: 96, minHeight: 44, px: 2.5, fontWeight: 700 }}
      >
        Play
      </Button>

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
        <DialogTitle>{confirm !== null && dialogCopy[confirm].title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirm !== null && dialogCopy[confirm].body}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={confirm !== null ? dialogCopy[confirm].color : 'primary'}
            onClick={() => {
              if (confirm === 'pass') onPass();
              else if (confirm === 'resign') onResign();
              else if (confirm === 'play') onPlay();
              setConfirm(null);
            }}
          >
            {confirm !== null && dialogCopy[confirm].cta}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
