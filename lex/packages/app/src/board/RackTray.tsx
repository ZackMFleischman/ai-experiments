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
import { useTheme } from '@mui/material/styles';
import { skinVars } from './skin';
import { useSkinId } from './skinContext';
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
  /** Multiplayer refill in flight (T4.6): this many empty slots render as
   * "drawing…" placeholders until the rack listener lands. */
  drawing?: number;
  /** Slot highlighted for the tap-tap flow (T3.5). */
  selectedIndex?: number | null;
  /** Exchange multi-select mode (T3.6): selected slots raise, others dim. */
  exchangeSelection?: ReadonlySet<number> | null;
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
}

export function RackTray({
  tiles,
  rackSize,
  points,
  bagCount,
  disabled = false,
  drawing = 0,
  selectedIndex = null,
  exchangeSelection = null,
  onTileTap,
  onReorder,
  onShuffle,
  onDragOut,
}: RackTrayProps) {
  const mode = useTheme().palette.mode;
  const skinId = useSkinId();
  const trayRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragRef | null>(null);
  const [dragVisual, setDragVisual] = useState<{ index: number; dx: number } | null>(null);

  // Prefer the slots row for geometry (excludes the shuffle/bag column);
  // jsdom reports 0×0 rects, so tests fall back to the tray itself.
  const slotMetrics = (): { left: number; width: number } => {
    const row = rowRef.current?.getBoundingClientRect();
    const rect = row?.width ? row : trayRef.current?.getBoundingClientRect();
    return { left: rect?.left ?? 0, width: (rect?.width || 52 * rackSize) / rackSize };
  };
  const slotWidth = (): number => slotMetrics().width;

  const reset = () => {
    drag.current = null;
    setDragVisual(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || drag.current) return;
    const target = e.target as Element;
    // The shuffle button and bag chip keep their own behavior.
    if (target.closest('button') || target.closest('[data-testid="bag-count"]')) return;
    const slotEl = target.closest('[data-rack-slot]');
    // Fat hit target (real-device polish): a press ANYWHERE else on the tray
    // grabs the nearest slot — missing a 44px tile must never fall through
    // to the board viewport, which would pan the board instead.
    const { left, width } = slotMetrics();
    const index = slotEl
      ? Number(slotEl.getAttribute('data-rack-slot'))
      : Math.min(rackSize - 1, Math.max(0, Math.floor((e.clientX - left) / width)));
    if (!tiles[index]) return;
    drag.current = { index, pointerId: e.pointerId, startX: e.clientX, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (onDragOut && e.clientY < (rect.top || 0) - DRAG_OUT_PX) {
      // Hand the pointer to the drag layer and forget it NOW — once capture
      // is released, the pointerup lands elsewhere and never reaches the
      // tray, so waiting for it would wedge every subsequent drag.
      reset();
      e.currentTarget.releasePointerCapture?.(e.pointerId);
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
        ...skinVars(mode, skinId),
        // Slots fill the width (phone: ~45px ≥ the 44px target) and cap at
        // 52px; 76px covers paddings + gaps + the shuffle/bag column.
        '--lex-cell': `min(52px, calc((100vw - 76px) / ${rackSize}))`,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        pt: 0.75,
        // Clear the iOS home-indicator: it overlaid the tiles and bag chip.
        pb: 'max(6px, env(safe-area-inset-bottom))',
        touchAction: 'none',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <Box ref={rowRef} sx={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center', minWidth: 0 }}>
        {Array.from({ length: rackSize }, (_, i) => {
          const face = tiles[i] ?? null;
          // The first `drawing` empty slots carry the refill placeholder.
          const emptyOrdinal = face === null ? tiles.slice(0, i).filter((t) => t === null).length : -1;
          const isDrawing = face === null && emptyOrdinal >= 0 && emptyOrdinal < drawing;
          const dragging = dragVisual?.index === i;
          const exchangeSelected = exchangeSelection?.has(i) ?? false;
          // Live reorder preview: while a tile is dragged, the slots between
          // it and its drop target slide one slot over — same splice-move the
          // controller applies on release, shown in real time.
          let slide: string | undefined;
          if (dragVisual && !dragging) {
            const w = slotWidth();
            const to = Math.min(
              tiles.length - 1,
              Math.max(0, dragVisual.index + Math.round(dragVisual.dx / w)),
            );
            if (dragVisual.index < i && i <= to) slide = `translateX(${-w}px)`;
            else if (to <= i && i < dragVisual.index) slide = `translateX(${w}px)`;
          }
          // Transforms ride inline styles (not sx): they change every
          // pointermove, and emotion would mint a class per frame.
          const style: React.CSSProperties = dragging
            ? { transform: `translateX(${dragVisual.dx}px)`, zIndex: 2, position: 'relative' }
            : slide
              ? { transform: slide, transition: 'transform 120ms ease' }
              : {};
          return (
            <Box
              key={i}
              data-rack-slot={i}
              data-selected={selectedIndex === i ? 'true' : undefined}
              data-exchange-selected={exchangeSelected ? 'true' : undefined}
              style={style}
              sx={{
                width: 'var(--lex-cell)',
                height: 'var(--lex-cell)',
                borderRadius: '14%',
                bgcolor: 'action.hover',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline:
                  selectedIndex === i || exchangeSelected
                    ? '2px solid var(--lex-tile-pending-edge)'
                    : 'none',
                ...(exchangeSelection && !exchangeSelected && { opacity: 0.55 }),
                ...(exchangeSelected && { transform: 'translateY(-4px)' }),
                cursor: face && !disabled ? 'grab' : 'default',
              }}
            >
              {face &&
                (face === '?' ? (
                  <Tile letter="" isBlank points={0} />
                ) : (
                  <Tile letter={face} isBlank={false} points={points[face] ?? 0} />
                ))}
              {isDrawing && (
                <Box
                  data-testid="rack-drawing"
                  aria-label="drawing a tile"
                  sx={{
                    width: '80%',
                    height: '80%',
                    borderRadius: '18%',
                    border: '2px dashed',
                    borderColor: 'text.disabled',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.disabled',
                    fontSize: 'calc(var(--lex-cell) * 0.4)',
                    '@keyframes lexDrawPulse': { '50%': { opacity: 0.35 } },
                    animation: 'lexDrawPulse 1.2s ease-in-out infinite',
                  }}
                >
                  …
                </Box>
              )}
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
