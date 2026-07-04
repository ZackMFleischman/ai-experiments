// Rack tray (T3.3): the player's tiles in rackSize slots — drag-reorder with
// raw pointer events, shuffle, bag-count chip. Order is OWNED BY THE PARENT
// (controller): the tray only reports intents (tap / reorder / drag-out).
// A pointer that leaves the tray upward is handed to the board drag layer
// (T3.5) via onDragOut — the tray forgets it from that moment.
import ShuffleIcon from '@mui/icons-material/Shuffle';
import { Box, Chip, IconButton, Paper } from '@mui/material';
import type { TileFace, TileSet } from '@lex/engine';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import { useColorMode } from '../theme';
import { skinVars } from './skin';
import { Tile } from './Tile';

const DRAG_OUT_PX = 8; // above the tray = the board's territory
const TAP_SLOP_PX = 6;

export interface RackTrayProps {
  /** Slot contents; null = empty slot. '?' renders as a faceless blank. */
  tiles: ReadonlyArray<TileFace | null>;
  rackSize: number;
  points: TileSet['points'];
  bagCount: number;
  disabled?: boolean;
  /** Slot highlighted for the tap-tap flow (T3.5). */
  selectedIndex?: number | null;
  onTileTap?: (index: number) => void;
  onReorder?: (from: number, to: number) => void;
  onShuffle?: () => void;
  /** Pointer left the tray upward while dragging a tile: the drag layer takes over. */
  onDragOut?: (index: number, pointerId: number, clientX: number, clientY: number) => void;
}

interface DragRef {
  index: number;
  pointerId: number;
  startX: number;
  moved: boolean;
  out: boolean;
}

export function RackTray({
  tiles,
  rackSize,
  points,
  bagCount,
  disabled = false,
  selectedIndex = null,
  onTileTap,
  onReorder,
  onShuffle,
  onDragOut,
}: RackTrayProps) {
  const { mode } = useColorMode();
  const trayRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragRef | null>(null);
  const [dragVisual, setDragVisual] = useState<{ index: number; dx: number } | null>(null);

  const slotWidth = (): number => {
    const rect = trayRef.current?.getBoundingClientRect();
    return (rect?.width || 52 * rackSize) / rackSize;
  };

  const reset = () => {
    drag.current = null;
    setDragVisual(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || drag.current) return;
    const slotEl = (e.target as Element).closest('[data-rack-slot]');
    if (!slotEl) return;
    const index = Number(slotEl.getAttribute('data-rack-slot'));
    if (!tiles[index]) return;
    drag.current = { index, pointerId: e.pointerId, startX: e.clientX, moved: false, out: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || d.out) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (onDragOut && e.clientY < (rect.top || 0) - DRAG_OUT_PX) {
      d.out = true;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      setDragVisual(null);
      onDragOut(d.index, e.pointerId, e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > TAP_SLOP_PX) d.moved = true;
    if (d.moved) setDragVisual({ index: d.index, dx });
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.out) {
      reset();
      return;
    }
    if (d.moved) {
      const offset = Math.round((e.clientX - d.startX) / slotWidth());
      const target = Math.min(tiles.length - 1, Math.max(0, d.index + offset));
      if (target !== d.index) onReorder?.(d.index, target);
    } else if (e.type === 'pointerup') {
      onTileTap?.(d.index);
    }
    reset();
  };

  return (
    <Paper
      elevation={3}
      data-testid="rack-tray"
      ref={trayRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      sx={{
        ...skinVars(mode),
        '--lex-cell': '48px',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.75,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.5, flex: 1, justifyContent: 'center' }}>
        {Array.from({ length: rackSize }, (_, i) => {
          const face = tiles[i] ?? null;
          const dragging = dragVisual?.index === i;
          return (
            <Box
              key={i}
              data-rack-slot={i}
              data-selected={selectedIndex === i ? 'true' : undefined}
              sx={{
                width: 'var(--lex-cell)',
                height: 'var(--lex-cell)',
                borderRadius: '14%',
                bgcolor: 'action.hover',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: selectedIndex === i ? '2px solid var(--lex-tile-pending-edge)' : 'none',
                ...(dragging && {
                  transform: `translateX(${dragVisual.dx}px)`,
                  zIndex: 2,
                  position: 'relative',
                }),
                cursor: face && !disabled ? 'grab' : 'default',
              }}
            >
              {face &&
                (face === '?' ? (
                  <Tile letter="" isBlank points={0} />
                ) : (
                  <Tile letter={face} isBlank={false} points={points[face] ?? 0} />
                ))}
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
        <IconButton aria-label="shuffle rack" size="small" disabled={disabled} onClick={onShuffle}>
          <ShuffleIcon fontSize="small" />
        </IconButton>
        <Chip
          data-testid="bag-count"
          aria-label={`${bagCount} tiles in the bag`}
          size="small"
          label={bagCount}
        />
      </Box>
    </Paper>
  );
}
