// Notifications setup banner (T5.2): decides via pushSetupState, captures the
// FCM token on grant. Rendered by the full-mode lobby only.
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { InstallCoachMark } from '../screens/InstallCoachMark';
import { useAuth } from './authContext';
import { ensureFcmToken, messagingSupported } from './push';
import { pushSetupState, type PushSetup } from './pushState';

const COACH_KEY = 'hive.coachmark.dismissed';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function NotificationsSetup() {
  const { user, emulators } = useAuth();
  const [setup, setSetup] = useState<PushSetup>('nothing');

  useEffect(() => {
    if (!user || emulators) return;
    let cancelled = false;
    void messagingSupported().then((supported) => {
      if (cancelled) return;
      const permission =
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
      const state = pushSetupState({
        permission,
        standalone: isStandalone(),
        isIos: isIos(),
        messagingSupported: supported,
        coachMarkDismissed: localStorage.getItem(COACH_KEY) === '1',
      });
      setSetup(state);
      if (supported && permission === 'granted') {
        void ensureFcmToken(user.uid).catch(() => {}); // best-effort refresh
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, emulators]);

  if (!user || setup === 'nothing') return null;

  if (setup === 'coach-mark') {
    return (
      <InstallCoachMark
        onDismiss={() => {
          localStorage.setItem(COACH_KEY, '1');
          setSetup('nothing');
        }}
      />
    );
  }

  const enable = () => {
    void Notification.requestPermission().then((permission) => {
      if (permission === 'granted') void ensureFcmToken(user.uid).catch(() => {});
      setSetup('nothing');
    });
  };

  return (
    <Card variant="outlined" data-testid="enable-notifications">
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, '&:last-child': { pb: 2 } }}>
      <NotificationsActiveIcon color="primary" />
        <Stack sx={{ flex: 1 }}>
          <Typography fontWeight={600}>Know when it&apos;s your move</Typography>
          <Typography variant="body2" color="text.secondary">
            Get a push when your opponent plays.
          </Typography>
        </Stack>
        <Button variant="contained" size="small" onClick={enable}>
          Enable
        </Button>
      </CardContent>
    </Card>
  );
}
