// Rejected-move toast (T6.2): the controller raises a notice when the server
// rejects an optimistic move and the session rolls back (T4.6) — this is the
// only place that notice reaches the player. Keyed by notice id so a fresh
// rejection reappears even after the previous toast was dismissed.
import { Alert, Snackbar } from '@mui/material';
import { useState } from 'react';

export interface Notice {
  id: number;
  text: string;
}

export function NoticeToast({ notice }: { notice: Notice | undefined }) {
  const [dismissedId, setDismissedId] = useState(0);
  const dismiss = () => notice && setDismissedId(notice.id);
  return (
    <Snackbar
      key={notice?.id ?? 0}
      open={notice !== undefined && notice.id !== dismissedId}
      autoHideDuration={5000}
      onClose={dismiss}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="error" variant="filled" onClose={dismiss} data-testid="notice-toast">
        {notice?.text}
      </Alert>
    </Snackbar>
  );
}
