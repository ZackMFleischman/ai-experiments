// End-of-game beat (T3.10): a ~1.2s board moment on the final play before
// the result overlay (skipped by tap; resign/timeout skip it entirely —
// the controller only exposes `beat` for board endings).
import { Box } from '@mui/material';
import { useEffect } from 'react';

const BEAT_MS = 1200;

export function EndBeat({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, BEAT_MS);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <Box
      data-testid="end-beat"
      onClick={onDone}
      sx={{ position: 'fixed', inset: 0, zIndex: (t) => t.zIndex.modal, cursor: 'pointer' }}
    />
  );
}
