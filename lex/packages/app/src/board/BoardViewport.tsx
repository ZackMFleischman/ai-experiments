// ported from hive/packages/app/src/board/BoardViewport.tsx (adapted)
// Pan/zoom viewport around the DOM board grid — hive's SVG viewBox math
// re-expressed as a CSS transform (DESIGN §7.2). The transform is CONTROLLED:
// the GameController owns it (auto-fit = null view). Interaction routing:
// pending tiles go to the drag layer, everything else pans/pinches, motionless
// presses become cell/background taps, and coordinate conversion is exposed
// imperatively so the rack can drag into board space. Hit-testing happens in
// board space, so pan/zoom mid-drag can never invalidate it.
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { Box, IconButton } from '@mui/material';
import type { Cell } from '@lex/engine';
import { parseCellKey } from '@lex/engine';
import type { PointerEvent as ReactPointerEvent, ReactNode, Ref, WheelEvent as ReactWheelEvent } from 'react';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

export interface ViewState {
  cx: number; // board-space point shown at the container center
  cy: number;
  zoom: number; // relative to fit: 1 = whole board visible
}

export interface BoardPoint {
  x: number;
  y: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
/** Double-tap target: absolute scale where cells are placement-sized. */
const PLACEMENT_SCALE = 1.2;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 30;

export function zoomViewState(view: ViewState, factor: number, px: number, py: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const applied = zoom / view.zoom;
  // Keep the board point under the pointer fixed while zooming.
  return {
    cx: px + (view.cx - px) / applied,
    cy: py + (view.cy - py) / applied,
    zoom,
  };
}

export function fitScale(cw: number, ch: number, bw: number, bh: number): number {
  return Math.min(cw / bw, ch / bh);
}

export function viewTransform(
  cw: number,
  ch: number,
  bw: number,
  bh: number,
  view: ViewState,
): { scale: number; tx: number; ty: number } {
  const scale = fitScale(cw, ch, bw, bh) * view.zoom;
  return { scale, tx: cw / 2 - scale * view.cx, ty: ch / 2 - scale * view.cy };
}

export interface BoardInteraction {
  /** Pointer went down on a pending (staged) tile — the drag layer takes it. */
  onPendingDown(cell: Cell, pt: BoardPoint): void;
  onDragMove(pt: BoardPoint): void;
  onDragEnd(pt: BoardPoint): void;
  /** A press that never moved, on a cell: tap-tap placement / selection. */
  onCellTap(cell: Cell): void;
  /** A press that never moved, off the board: "tap elsewhere" cancels. */
  onBackgroundTap(): void;
}

export interface BoardViewportHandle {
  toBoardPoint(clientX: number, clientY: number): BoardPoint | null;
}

export interface BoardViewportProps {
  boardWidth: number; // untransformed board px (from layout × cell size)
  boardHeight: number;
  view: ViewState | null; // null = auto-fit
  onViewChange: (view: ViewState | null) => void;
  interaction?: BoardInteraction;
  handleRef?: Ref<BoardViewportHandle>;
  children: ReactNode;
}

export function BoardViewport({
  boardWidth,
  boardHeight,
  view,
  onViewChange,
  interaction,
  handleRef,
  children,
}: BoardViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // jsdom reports 0×0; fall back to a sane box so tests and SSR-ish renders work.
  const [size, setSize] = useState({ w: 600, h: 400 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width && rect.height) setSize({ w: rect.width, h: rect.height });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // iOS Safari: a two-finger pinch on the board must zoom the BOARD, never the
  // page. touch-action:none isn't enough — Safari's page zoom rides its
  // proprietary gesture events and multi-touch touchmove, so both are
  // swallowed here (non-passive; React can't attach those). (hive §8.7)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const eat = (e: Event) => e.preventDefault();
    const eatMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    el.addEventListener('gesturestart', eat);
    el.addEventListener('gesturechange', eat);
    el.addEventListener('gestureend', eat);
    el.addEventListener('touchmove', eatMultiTouch, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', eat);
      el.removeEventListener('gesturechange', eat);
      el.removeEventListener('gestureend', eat);
      el.removeEventListener('touchmove', eatMultiTouch);
    };
  }, []);

  const effective: ViewState = view ?? { cx: boardWidth / 2, cy: boardHeight / 2, zoom: 1 };
  const { scale, tx, ty } = viewTransform(size.w, size.h, boardWidth, boardHeight, effective);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{
    id: number;
    startX: number;
    startY: number;
    view: ViewState;
    moved: boolean;
    onButton: boolean;
    cell: Cell | null;
  } | null>(null);
  const pinch = useRef<{ dist: number; view: ViewState } | null>(null);
  const dragPointer = useRef<number | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const toBoard = (clientX: number, clientY: number): BoardPoint => {
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const cw = rect?.width || 600;
    const ch = rect?.height || 400;
    const t = viewTransform(cw, ch, boardWidth, boardHeight, effective);
    return {
      x: (clientX - (rect?.left ?? 0) - t.tx) / t.scale,
      y: (clientY - (rect?.top ?? 0) - t.ty) / t.scale,
    };
  };

  useImperativeHandle(handleRef, () => ({
    toBoardPoint: (clientX: number, clientY: number) =>
      containerRef.current ? toBoard(clientX, clientY) : null,
  }));

  const placementZoom = () => {
    const fit = fitScale(size.w, size.h, boardWidth, boardHeight);
    return Math.min(MAX_ZOOM, Math.max(1, PLACEMENT_SCALE / fit));
  };

  const handleDoubleTap = (clientX: number, clientY: number) => {
    const target = placementZoom();
    if (effective.zoom >= target - 0.05) {
      onViewChange(null); // already at placement scale: refit
      return;
    }
    const at = toBoard(clientX, clientY);
    onViewChange({ cx: at.x, cy: at.y, zoom: target });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const pendingEl = target.closest('[data-pending="true"]');
    const cellEl = target.closest('[data-cell]');
    if (pendingEl && cellEl && interaction && dragPointer.current === null) {
      dragPointer.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      interaction.onPendingDown(
        parseCellKey(cellEl.getAttribute('data-cell') as string),
        toBoard(e.clientX, e.clientY),
      );
      return;
    }

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [BoardPoint, BoardPoint];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: effective };
      pan.current = null;
      return;
    }
    pan.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      view: effective,
      moved: false,
      onButton: !!target.closest('button'),
      cell: cellEl ? parseCellKey(cellEl.getAttribute('data-cell') as string) : null,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointer.current === e.pointerId && interaction) {
      interaction.onDragMove(toBoard(e.clientX, e.clientY));
      return;
    }
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [BoardPoint, BoardPoint];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0 && dist > 0) {
        const factor = dist / pinch.current.dist;
        const mid = toBoard((a.x + b.x) / 2, (a.y + b.y) / 2);
        onViewChange(zoomViewState(pinch.current.view, factor, mid.x, mid.y));
      }
      return;
    }
    if (pan.current && pan.current.id === e.pointerId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cw = rect.width || 600;
      const ch = rect.height || 400;
      const s = fitScale(cw, ch, boardWidth, boardHeight) * pan.current.view.zoom;
      const dx = e.clientX - pan.current.startX;
      const dy = e.clientY - pan.current.startY;
      if (Math.hypot(dx, dy) > 3) pan.current.moved = true;
      if (pan.current.moved) {
        onViewChange({
          cx: pan.current.view.cx - dx / s,
          cy: pan.current.view.cy - dy / s,
          zoom: pan.current.view.zoom,
        });
      }
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointer.current === e.pointerId) {
      dragPointer.current = null;
      interaction?.onDragEnd(toBoard(e.clientX, e.clientY));
      return;
    }
    const p = pan.current;
    if (p?.id === e.pointerId && !p.moved && !p.onButton && e.type === 'pointerup') {
      const prev = lastTap.current;
      const now = performance.now();
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_PX) {
        lastTap.current = null;
        handleDoubleTap(e.clientX, e.clientY);
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        if (p.cell) interaction?.onCellTap(p.cell);
        else interaction?.onBackgroundTap();
      }
    }
    pointers.current.delete(e.pointerId);
    if (pan.current?.id === e.pointerId) pan.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const factor = Math.exp(-e.deltaY * 0.0015);
    const at = toBoard(e.clientX, e.clientY);
    onViewChange(zoomViewState(effective, factor, at.x, at.y));
  };

  return (
    <Box
      ref={containerRef}
      data-testid="board-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <Box
        sx={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' }}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          width: boardWidth,
          height: boardHeight,
        }}
      >
        {children}
      </Box>
      <IconButton
        aria-label="recenter"
        size="small"
        onClick={() => onViewChange(null)}
        sx={{ position: 'absolute', right: 8, bottom: 8, bgcolor: 'background.paper', boxShadow: 1 }}
      >
        <CenterFocusStrongIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
