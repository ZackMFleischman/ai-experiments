// Overflow menu (T3.8): Pass / Offer draw / Resign / New game, with confirm
// dialogs so touch can't fat-finger a resignation (DESIGN §6.3).
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import { useState } from 'react';
import type { GameController, Snapshot } from '../controller/GameController';

type Confirm = 'resign' | 'draw' | 'new-game' | null;

export function GameMenu({ controller, snap }: { controller: GameController; snap: Snapshot }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const close = () => setAnchor(null);

  // Hot-seat: actions belong to whoever is to move. Multiplayer (T4.6): they
  // always belong to this client's seat.
  const acting = snap.myColor ?? snap.toMove;

  const act = () => {
    if (confirm === 'resign') controller.resign(acting);
    if (confirm === 'draw') controller.offerDraw(acting);
    if (confirm === 'new-game') void controller.newGame();
    setConfirm(null);
  };

  const who = acting === 'w' ? 'White' : 'Black';
  const text = {
    resign: `${who} resigns the game?`,
    draw: `${who} offers a draw?`,
    'new-game': 'Start a new game? The current game will be discarded.',
  } as const;

  return (
    <>
      <IconButton aria-label="game menu" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        <MenuItem
          disabled={!snap.canPass}
          onClick={() => {
            controller.pass();
            close();
          }}
        >
          Pass
        </MenuItem>
        <MenuItem
          disabled={!!snap.end || !!snap.pendingDrawOffer || (!!snap.myColor && snap.toMove !== snap.myColor)}
          onClick={() => {
            setConfirm('draw');
            close();
          }}
        >
          Offer draw
        </MenuItem>
        <MenuItem
          disabled={!!snap.end}
          onClick={() => {
            setConfirm('resign');
            close();
          }}
        >
          Resign
        </MenuItem>
        {!snap.myColor && (
          <MenuItem
            onClick={() => {
              setConfirm('new-game');
              close();
            }}
          >
            New game
          </MenuItem>
        )}
      </Menu>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)}>
        <DialogTitle>Are you sure?</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm ? text[confirm] : ''}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="contained" onClick={act} data-testid="confirm-action">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Draw response: in hot-seat the other player answers on the same
          device; in multiplayer only the non-offering client sees it. */}
      <Dialog open={!!snap.pendingDrawOffer && !snap.end && snap.pendingDrawOffer !== snap.myColor}>
        <DialogTitle>
          {snap.pendingDrawOffer === 'w' ? 'White' : 'Black'} offers a draw
        </DialogTitle>
        <DialogActions>
          <Button
            data-testid="draw-decline"
            onClick={() =>
              controller.respondDraw(snap.myColor ?? (snap.pendingDrawOffer === 'w' ? 'b' : 'w'), false)
            }
          >
            Decline
          </Button>
          <Button
            variant="contained"
            data-testid="draw-accept"
            onClick={() =>
              controller.respondDraw(snap.myColor ?? (snap.pendingDrawOffer === 'w' ? 'b' : 'w'), true)
            }
          >
            Accept
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
