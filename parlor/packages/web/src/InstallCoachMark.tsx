// ported from hive/packages/app/src/screens/InstallCoachMark.tsx (adapted)
// iOS install coach mark: Web Push on iOS needs the app on the Home Screen —
// shown once, dismissible. Firebase-free (gallery-safe).
import CloseIcon from '@mui/icons-material/Close';
import IosShareIcon from '@mui/icons-material/IosShare';
import { Card, CardContent, IconButton, Stack, Typography } from '@mui/material';

export function InstallCoachMark({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card variant="outlined" sx={{ borderColor: 'primary.main' }} data-testid="install-coach-mark">
      <CardContent
        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&:last-child': { pb: 2 } }}
      >
        <IosShareIcon color="primary" sx={{ mt: 0.5 }} />
        <Stack sx={{ flex: 1 }}>
          <Typography fontWeight={600}>Get notified when it&apos;s your turn</Typography>
          <Typography variant="body2" color="text.secondary">
            On iPhone and iPad, notifications need the app installed: tap the share button, then
            &ldquo;Add to Home Screen&rdquo;.
          </Typography>
        </Stack>
        <IconButton
          size="small"
          aria-label="dismiss"
          onClick={onDismiss}
          data-testid="dismiss-coach-mark"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </CardContent>
    </Card>
  );
}
