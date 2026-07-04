// The action row (T3.6/T3.7): Play / Recall / Exchange / Pass / Resign.
// Pure props — enablement comes from the controller's verdicts upstream
// (the UI never computes rules). Pass and Resign confirm via dialog.
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useState } from 'react';

export interface GameActionsProps {
  playable: boolean;
  hasPending: boolean;
  interactive: boolean;
  canExchange: boolean;
  exchangeMinBag: number;
  bagCount: number;
  onPlay: () => void;
  onRecall: () => void;
  onExchange: () => void;
  onPass: () => void;
  onResign: () => void;
}

export function GameActions({
  playable,
  hasPending,
  interactive,
  canExchange,
  exchangeMinBag,
  bagCount,
  onPlay,
  onRecall,
  onExchange,
  onPass,
  onResign,
}: GameActionsProps) {
  const [confirm, setConfirm] = useState<'pass' | 'resign' | null>(null);
  const exchangeShort = interactive && !canExchange && bagCount < exchangeMinBag;

  return (
    <Box data-testid="game-actions" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, flexWrap: 'wrap' }}>
      <Button variant="contained" size="small" disabled={!playable} onClick={onPlay}>
        Play
      </Button>
      <Button size="small" disabled={!hasPending} onClick={onRecall}>
        Recall
      </Button>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Button size="small" disabled={!interactive || !canExchange} onClick={onExchange}>
          Exchange
        </Button>
        {exchangeShort && (
          <Typography data-testid="exchange-reason" variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
            needs {exchangeMinBag} in bag
          </Typography>
        )}
      </Box>
      <Button size="small" disabled={!interactive} onClick={() => setConfirm('pass')}>
        Pass
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button size="small" color="error" disabled={!interactive} onClick={() => setConfirm('resign')}>
        Resign
      </Button>

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
