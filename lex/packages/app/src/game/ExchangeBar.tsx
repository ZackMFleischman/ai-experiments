// Exchange confirm bar (T3.6): shown while the rack is in multi-select mode.
import { Box, Button, Paper, Typography } from '@mui/material';

export interface ExchangeBarProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExchangeBar({ count, onConfirm, onCancel }: ExchangeBarProps) {
  return (
    <Paper
      elevation={4}
      data-testid="exchange-bar"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}
    >
      <Typography variant="body2" sx={{ flex: 1 }}>
        {count === 0
          ? 'Tap tiles to exchange — costs your turn'
          : `Exchange ${count} tile${count === 1 ? '' : 's'} — costs your turn`}
      </Typography>
      <Button size="small" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="small" variant="contained" disabled={count === 0} onClick={onConfirm}>
        Exchange
      </Button>
    </Paper>
  );
}
