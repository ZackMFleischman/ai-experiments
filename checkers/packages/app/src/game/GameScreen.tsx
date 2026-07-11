// The shared game surface: one board screen over a LogSession, used by both
// hot-seat (acting side follows the turn) and online (perspective locked to
// my side). Renders under the brand AppShell — checkers is the first duo title
// on @parlor/brand. The UI folds engine state only; every mutation is a log
// entry through the session.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell } from '@parlor/brand';
import type { Side, CheckersMove, CheckersState } from '@checkers/engine';
import { useState, useSyncExternalStore } from 'react';
import { sideLabel } from '../gameOptions';
import { otherSide, type CheckersEntry } from './entries';
import type { CheckersSession } from './localSession';
import { Board } from '../board/Board';

export type GameMode = { kind: 'hotseat' } | { kind: 'online'; mySide: Side };

export interface GameScreenProps {
  session: CheckersSession;
  mode: GameMode;
  /** [attackers, defenders] display names. */
  seatNames: readonly [string | null, string | null];
  onExit: () => void;
  /** Online: offer/converge on the next game. Hot-seat: omitted. */
  onRematch?: (() => void) | undefined;
}

function useSessionState(session: CheckersSession): CheckersState | null {
  return useSyncExternalStore(session.subscribe, () => session.state);
}

function outcomeText(state: CheckersState, mode: GameMode): string {
  const result = state.result;
  if (!result) return '';
  if (result.winner === null) return 'A draw — the same position three times.';
  const winner = sideLabel(result.winner);
  const how =
    result.by === 'escape'
      ? 'the king reached a corner'
      : result.by === 'capture'
        ? 'the king was taken'
        : result.by === 'no-moves'
          ? 'no legal moves left'
          : result.by;
  if (mode.kind === 'online') {
    return result.winner === mode.mySide ? `You won — ${how}.` : `You lost — ${how}.`;
  }
  return `${winner} win — ${how}.`;
}

export function GameScreen({ session, mode, seatNames, onExit, onRematch }: GameScreenProps) {
  const state = useSessionState(session);
  const [confirmResign, setConfirmResign] = useState(false);
  if (!state) return null;

  const actingSide: Side | undefined =
    mode.kind === 'hotseat'
      ? state.toMove
      : mode.mySide === state.toMove
        ? mode.mySide
        : undefined;

  const lastEntry = session.log[session.log.length - 1];
  const lastMove: CheckersMove | undefined =
    lastEntry?.kind === 'move' ? { from: lastEntry.from, to: lastEntry.to } : undefined;

  const submitMove = (move: CheckersMove): void => {
    const entry: CheckersEntry = { kind: 'move', ...move };
    // Online transports may refuse (stale/turn) — resync adopts the truth.
    session.submit(entry, mode.kind === 'online' ? 'resync' : 'rollback');
  };

  const resign = (): void => {
    const by: Side = mode.kind === 'online' ? mode.mySide : state.toMove;
    session.submit({ kind: 'resign', by }, mode.kind === 'online' ? 'resync' : 'rollback');
    setConfirmResign(false);
  };

  const name = (side: Side): string =>
    (side === 'attackers' ? seatNames[0] : seatNames[1]) ?? sideLabel(side);

  const statusLine = state.result
    ? outcomeText(state, mode)
    : mode.kind === 'online'
      ? state.toMove === mode.mySide
        ? 'Your move'
        : `Waiting for ${name(state.toMove)}…`
      : `${name(state.toMove)} to move`;

  return (
    <AppShell title="Checkers" onBack={onExit} fullBleed>
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0, px: 1.5, pb: 2, pt: 0.5, width: '100%', maxWidth: 560, mx: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" data-hud>
          <Typography variant="subtitle1" component="p" fontWeight={600} data-testid="status-line">
            {statusLine}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            move {state.moveCount + 1}
          </Typography>
        </Stack>

        <Board
          state={state}
          onMove={submitMove}
          actingSide={state.result ? undefined : actingSide}
          lastMove={lastMove}
        />

        <Stack direction="row" spacing={1} justifyContent="center">
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {name('attackers')} ⚔ {name('defenders')}
          </Typography>
          {!state.result && (mode.kind === 'hotseat' || actingSide !== undefined) && (
            <Button size="small" color="inherit" onClick={() => setConfirmResign(true)}>
              Resign
            </Button>
          )}
        </Stack>
      </Stack>

      <Dialog open={confirmResign} onClose={() => setConfirmResign(false)} aria-labelledby="resign-title">
        <DialogTitle id="resign-title">Resign?</DialogTitle>
        <DialogContent>
          <Typography>
            {mode.kind === 'hotseat'
              ? `${name(state.toMove)} concede — ${name(otherSide(state.toMove))} win.`
              : 'Your opponent wins the game.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResign(false)}>Keep playing</Button>
          <Button color="error" onClick={resign}>
            Resign
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={state.result !== null} aria-labelledby="over-title">
        <DialogTitle id="over-title">Game over</DialogTitle>
        <DialogContent>
          <Typography data-testid="outcome">{outcomeText(state, mode)}</Typography>
        </DialogContent>
        <DialogActions>
          {mode.kind === 'hotseat' ? (
            <Button
              onClick={() => {
                void session.reset(session.options ?? { timeControl: null });
              }}
            >
              Play again
            </Button>
          ) : (
            onRematch && <Button onClick={onRematch}>Rematch</Button>
          )}
          <Button onClick={onExit}>Done</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}

export { useSessionState };
