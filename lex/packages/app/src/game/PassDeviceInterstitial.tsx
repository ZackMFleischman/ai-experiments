// Pass-device interstitial (T3.8, DESIGN §7.3): the one thing hive never
// needed — racks are secret between seats on one device. Fully opaque so
// nothing behind it can be read; shown until the incoming player taps.
import { Box, Typography } from '@mui/material';

export interface PassDeviceInterstitialProps {
  name: string;
  onReveal: () => void;
}

export function PassDeviceInterstitial({ name, onReveal }: PassDeviceInterstitialProps) {
  return (
    <Box
      data-testid="pass-device"
      onClick={onReveal}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: (t) => t.zIndex.modal + 1,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        cursor: 'pointer',
        textAlign: 'center',
        p: 3,
      }}
    >
      <Typography variant="h4" component="p" sx={{ fontWeight: 700 }}>
        Hand the device to {name}
      </Typography>
      <Typography color="text.secondary">Tap to see your rack</Typography>
    </Box>
  );
}
