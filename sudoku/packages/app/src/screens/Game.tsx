// The play screen: board, digit pad, and a single action row (undo / redo /
// erase / notes). Keyboard works throughout (digits, arrows, backspace, N).
// On solve: stop the clock, record the result once, celebrate quietly.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AppShell } from '@parlor/brand';
import { dayKey } from '@parlor/solo';
import { conflictCells, digitCounts, type SudokuState } from '@sudoku/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Board } from '../board/Board';
import { DigitPad } from '../board/DigitPad';
import { formatElapsed, loadElapsed, saveElapsed } from '../game/clock';
import { useSessionState } from '../game/useSession';
import { useApp } from '../App';

export function Game() {
  const { session, stats, storage } = useApp();
  const navigate = useNavigate();
  const state = useSessionState(session);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);

  const options = session.options;
  const gameKey = options ? `${options.seed}:${options.difficulty}` : null;

  // ---- clock ----
  const [elapsed, setElapsed] = useState(() => (gameKey ? loadElapsed(storage, gameKey) : 0));
  const solved = state?.solved ?? false;
  useEffect(() => {
    if (!gameKey || solved) return;
    const started = Date.now();
    const base = loadElapsed(storage, gameKey);
    setElapsed(base);
    const tick = setInterval(() => {
      const now = base + (Date.now() - started);
      setElapsed(now);
      saveElapsed(storage, gameKey, now);
    }, 1000);
    return () => clearInterval(tick);
  }, [gameKey, solved, storage]);

  // ---- record the win exactly once ----
  const recorded = useRef(false);
  useEffect(() => {
    if (!solved || recorded.current || !options) return;
    recorded.current = true;
    stats.record({
      day: dayKey(new Date()),
      durationMs: loadElapsed(storage, gameKey as string),
      won: true,
      bucket: options.daily ? 'daily' : options.difficulty,
    });
  }, [solved, options, gameKey, stats, storage]);

  // ---- input ----
  const act = useCallback(
    (digit: number) => {
      if (selected === null || solved) return;
      session.submit(notesMode ? { t: 'note', cell: selected, digit } : { t: 'set', cell: selected, digit });
    },
    [selected, solved, notesMode, session],
  );

  const erase = useCallback(() => {
    if (selected === null || solved) return;
    session.submit({ t: 'clear', cell: selected });
  }, [selected, solved, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') act(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete') erase();
      else if (e.key === 'n' || e.key === 'N') setNotesMode((m) => !m);
      else if (e.key.startsWith('Arrow') && selected !== null) {
        const delta = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
        const next = selected + delta;
        if (next >= 0 && next < 81) setSelected(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, erase, selected]);

  const conflicts = useMemo(
    () => new Set(state ? conflictCells(state.grid) : []),
    [state],
  );
  const counts = useMemo(() => (state ? digitCounts(state.grid) : []), [state]);

  if (!state || !options) {
    return (
      <AppShell title="Sudoku" onBack={() => navigate('/')}>
        <Typography sx={{ mt: 4 }} color="text.secondary">
          No game in progress.
        </Typography>
        <Button sx={{ mt: 2 }} variant="contained" onClick={() => navigate('/')}>
          New game
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={options.daily ? 'Daily puzzle' : capitalize(options.difficulty)}
      onBack={() => navigate('/')}
      actions={<Chip label={formatElapsed(elapsed)} size="small" variant="outlined" aria-label="elapsed time" />}
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        <Board state={state} selected={selected} conflicts={conflicts} onSelect={setSelected} />
        <DigitPad counts={counts} notesMode={notesMode} onDigit={act} />
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button size="small" onClick={() => session.undo()} disabled={!session.canUndo} aria-label="undo">
            Undo
          </Button>
          <Button size="small" onClick={() => session.redo()} disabled={!session.canRedo} aria-label="redo">
            Redo
          </Button>
          <Button size="small" onClick={erase} disabled={selected === null} aria-label="erase">
            Erase
          </Button>
          <Button
            size="small"
            onClick={() => setNotesMode((m) => !m)}
            variant={notesMode ? 'contained' : 'text'}
            aria-pressed={notesMode}
            aria-label="notes mode"
          >
            Notes
          </Button>
        </Stack>
      </Stack>

      <Dialog open={solved} aria-labelledby="solved-title">
        <DialogTitle id="solved-title">Solved</DialogTitle>
        <DialogContent>
          <Typography>
            {options.daily ? `Daily puzzle, ${options.daily}` : capitalize(options.difficulty)} in{' '}
            {formatElapsed(elapsed)}.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              session.clear();
              navigate('/');
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type { SudokuState };
