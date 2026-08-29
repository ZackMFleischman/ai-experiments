// Hot-seat setup (DESIGN §7.1): the game-creation form the one-device game
// never had. Without it a hot-seat game was always classic/NWL2023 under the
// default rules, so none of the per-game options (FR-6/FR-7/FR-9b) were
// reachable at all in the static build — which is also the only build a PR
// preview deploys, making the options untestable there.
//
// It offers exactly the three settings a single device can honour, using the
// same pickers as the multiplayer form (optionPickers). Turn order and the
// async time control are deliberately absent: on one device p0 always starts,
// and there is no clock to run.
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import {
  BoardPicker,
  DictionaryPicker,
  InvalidWordsPicker,
} from '../screens/optionPickers';
import type { InvalidWordRule } from '../gameOptions';
import { DEFAULT_HOTSEAT, type HotSeatChoices } from './localSession';

export function HotSeatSetup({
  onStart,
  busy = false,
  error,
  /** Shown when there is a game to go back to — starting a new one would
   * discard it, and there is exactly one hot-seat slot in storage. */
  onCancel,
}: {
  onStart: (choices: HotSeatChoices) => void;
  busy?: boolean;
  error?: string | null;
  onCancel?: () => void;
}) {
  const [rulesetId, setRulesetId] = useState(DEFAULT_HOTSEAT.rulesetId);
  const [dictionaryId, setDictionaryId] = useState(DEFAULT_HOTSEAT.dictionaryId);
  const [invalidWords, setInvalidWords] = useState<InvalidWordRule>(
    DEFAULT_HOTSEAT.invalidWords,
  );

  return (
    <Box data-testid="hotseat-setup" sx={{ p: 3 }}>
      <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto' }}>
        <Stack spacing={0.5}>
          <Typography variant="h5" component="h1">
            New hot-seat game
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Two players, one device — pass it over between turns.
          </Typography>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <BoardPicker value={rulesetId} onChange={setRulesetId} />
        <DictionaryPicker value={dictionaryId} onChange={setDictionaryId} />
        <InvalidWordsPicker value={invalidWords} onChange={setInvalidWords} />

        <Stack direction="row" spacing={1}>
          {onCancel && (
            <Button size="large" onClick={onCancel} disabled={busy} data-testid="setup-cancel">
              Keep playing
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="contained"
            size="large"
            disabled={busy}
            onClick={() => onStart({ rulesetId, dictionaryId, invalidWords })}
            data-testid="start-hotseat"
          >
            Start game
          </Button>
        </Stack>

        {onCancel && (
          <Typography variant="body2" color="text.secondary">
            Starting a new game ends the one in progress — there is only one
            hot-seat game on this device.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
