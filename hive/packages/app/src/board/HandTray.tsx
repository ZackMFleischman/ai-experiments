// Hand tray (T3.7): the side-to-move's unplaced bugs — per-kind counts,
// disabled when no legal placement, tap-to-place or drag-to-place, queen pulse
// when queen-by-4 is binding.
import { Box, Paper } from '@mui/material';
import type { BugKind } from '@hive/engine';
import type { GameController } from '../controller/GameController';
import { useGameController } from '../controller/useGameController';
import { BUG_SYMBOL } from './sprites';
import './board.css';

const TRAY_ORDER: BugKind[] = ['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P'];
const TILE = 52; // ≥44px touch target (checklist)

export function HandTray({ controller }: { controller: GameController }) {
  const snap = useGameController(controller);
  const color = snap.toMove;
  const hand = snap.state.hands[color];
  const kinds = TRAY_ORDER.filter((k) => initialCount(k, snap) > 0); // bugs in this game's options

  return (
    <Paper
      elevation={3}
      className="hive-board-scope"
      data-testid="hand-tray"
      sx={{ display: 'flex', gap: 0.5, px: 1, py: 0.75, justifyContent: 'center', flexWrap: 'wrap' }}
    >
      {kinds.map((kind) => {
        const count = hand[kind];
        const enabled = !snap.end && count > 0 && snap.placeableBugs.has(kind);
        const selected = snap.selection?.kind === 'hand' && snap.selection.tile.kind === kind;
        const pulse = kind === 'Q' && snap.mustPlaceQueen;
        return (
          <Box
            key={kind}
            component="button"
            aria-label={`place ${kind}`}
            data-testid={`tray-${kind}`}
            data-selected={selected || undefined}
            disabled={!enabled}
            onClick={() => enabled && controller.selectHandBug(kind)}
            onPointerDown={() => {
              if (!enabled) return;
              controller.selectHandBug(kind);
              controller.handDragActive = true;
            }}
            sx={{
              position: 'relative',
              border: 'none',
              background: 'none',
              p: 0.25,
              cursor: enabled ? 'pointer' : 'default',
              opacity: count === 0 ? 0.25 : enabled ? 1 : 0.45,
              outline: selected ? '2px solid #e8a013' : 'none',
              borderRadius: 1,
              touchAction: 'none',
            }}
          >
            <svg
              width={TILE}
              height={TILE}
              className={`hive-tile-${color} ${pulse ? 'hive-queen-pulse' : ''}`}
              role="img"
              aria-hidden
            >
              <use href="#hex-base" width={TILE} height={TILE} />
              <use href={`#${BUG_SYMBOL[kind]}`} x={TILE * 0.1} y={TILE * 0.1} width={TILE * 0.8} height={TILE * 0.8} />
            </svg>
            {count > 1 && (
              <Box
                component="span"
                data-testid={`tray-count-${kind}`}
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  // T6.3: primary-tinted badge — background.paper vanished on
                  // the dark tray.
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  lineHeight: '18px',
                  boxShadow: 1,
                }}
              >
                {count}
              </Box>
            )}
          </Box>
        );
      })}
    </Paper>
  );
}

function initialCount(kind: BugKind, snap: ReturnType<GameController['getSnapshot']>): number {
  const { options } = snap.state;
  return { Q: 1, A: 3, S: 2, G: 3, B: 2, M: options.mosquito ? 1 : 0, L: options.ladybug ? 1 : 0, P: options.pillbug ? 1 : 0 }[kind];
}
