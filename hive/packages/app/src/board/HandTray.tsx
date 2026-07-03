// Hand tray (T3.7): the side-to-move's unplaced bugs — per-kind counts,
// disabled when no legal placement, tap-to-place or drag-to-place, queen pulse
// when queen-by-4 is binding.
import { Box, Paper } from '@mui/material';
import type { BugKind } from '@hive/engine';
import { useRef } from 'react';
import type { GameController } from '../controller/GameController';
import { PIECE_INFO } from '../game/pieceInfo';
import { useGameController } from '../controller/useGameController';
import { usePieceArt } from './pieceArt';
import './board.css';

const TRAY_ORDER: BugKind[] = ['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P'];
const TILE = 52; // ≥44px touch target (checklist)

const LONG_PRESS_MS = 550;

export function HandTray({
  controller,
  onPieceInfo,
}: {
  controller: GameController;
  /** Long-press piece info (GameScreen renders the card). */
  onPieceInfo?: (kind: BugKind | null) => void;
}) {
  const snap = useGameController(controller);
  const { symbolFor } = usePieceArt();
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const color = snap.toMove;
  const hand = snap.state.hands[color];
  const kinds = TRAY_ORDER.filter((k) => initialCount(k, snap) > 0); // bugs in this game's options

  const armInfo = (kind: BugKind) => {
    if (!onPieceInfo) return;
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => onPieceInfo(kind), LONG_PRESS_MS);
  };
  const disarmInfo = () => {
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = null;
    onPieceInfo?.(null);
  };

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
            title={`${PIECE_INFO[kind].name} — ${PIECE_INFO[kind].rule}`}
            data-testid={`tray-${kind}`}
            data-selected={selected || undefined}
            disabled={!enabled}
            onClick={() => enabled && controller.selectHandBug(kind)}
            onPointerDown={() => {
              armInfo(kind);
              if (!enabled) return;
              controller.selectHandBug(kind);
              controller.handDragActive = true;
            }}
            onPointerUp={disarmInfo}
            onPointerCancel={disarmInfo}
            onPointerLeave={disarmInfo}
            onContextMenu={(e: { preventDefault(): void }) => e.preventDefault()}
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
              <use href={`#${symbolFor(kind)}`} x={TILE * 0.1} y={TILE * 0.1} width={TILE * 0.8} height={TILE * 0.8} />
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
