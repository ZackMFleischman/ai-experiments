// Pan/zoom viewport around BoardView (T3.3). The transform is CONTROLLED —
// the GameController owns it (auto-fit = null view; reset after hive growth).
// T3.6 adds interaction routing: tile pointers go to the drag layer, background
// pointers pan/pinch, and coordinate conversion is exposed imperatively so the
// hand tray can drag into board space. Hit-testing is done in board space via
// pixelToHex, so pan/zoom mid-drag can never invalidate it (DESIGN §9.8).
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { Box, IconButton } from '@mui/material';
import type { Hex } from '@hive/engine';
import type { PointerEvent as ReactPointerEvent, Ref, WheelEvent as ReactWheelEvent } from 'react';
import { useImperativeHandle, useRef } from 'react';
import type { BoardViewProps } from './BoardView';
import { autoFitViewBox, BoardView } from './BoardView';
import { keyToHex } from './hexGeometry';

export interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

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

export interface BoardInteraction {
  /** Pointer went down on a tile or ghost cell (board coords). */
  onTileDown(cell: Hex, pt: { x: number; y: number }): void;
  onDragMove(pt: { x: number; y: number }): void;
  onDragEnd(pt: { x: number; y: number }): void;
  /** Background press that never moved — "tap elsewhere". */
  onBackgroundTap(): void;
}

export interface BoardViewportHandle {
  toBoardPoint(clientX: number, clientY: number): { x: number; y: number } | null;
}

export interface BoardViewportProps extends Omit<BoardViewProps, 'viewBox' | 'svgProps'> {
  view: ViewState | null; // null = auto-fit
  onViewChange: (view: ViewState | null) => void;
  interaction?: BoardInteraction;
  handleRef?: Ref<BoardViewportHandle>;
}

interface BaseBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function parseBox(box: string): BaseBox {
  const [x, y, w, h] = box.split(' ').map(Number) as [number, number, number, number];
  return { cx: x + w / 2, cy: y + h / 2, w, h };
}

export function BoardViewport({
  view,
  onViewChange,
  interaction,
  handleRef,
  board,
  ui,
  ...boardProps
}: BoardViewportProps) {
  const base = parseBox(autoFitViewBox(board, [...(ui?.targets ?? []), ...(ui?.climbTargets ?? [])]));
  const effective: ViewState = view ?? { cx: base.cx, cy: base.cy, zoom: 1 };
  const w = base.w / effective.zoom;
  const h = base.h / effective.zoom;
  const viewBox = `${effective.cx - w / 2} ${effective.cy - h / 2} ${w} ${h}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Background pointers only (pan/pinch); the drag pointer is tracked apart.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ id: number; startX: number; startY: number; view: ViewState; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; view: ViewState } | null>(null);
  const dragPointer = useRef<number | null>(null);

  const toBoard = (el: SVGElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 400;
    // viewBox scales with preserveAspectRatio meet — the larger unit wins.
    const unit = Math.max(w / width, h / height);
    return {
      x: effective.cx + (clientX - (rect.left + width / 2)) * unit,
      y: effective.cy + (clientY - (rect.top + height / 2)) * unit,
    };
  };

  useImperativeHandle(handleRef, () => ({
    toBoardPoint: (clientX: number, clientY: number) =>
      svgRef.current ? toBoard(svgRef.current, clientX, clientY) : null,
  }));

  const onPointerDown = (e: ReactPointerEvent<SVGElement>) => {
    const cellEl = (e.target as Element).closest('[data-cell], [data-cell-layer]');
    if (cellEl && interaction && dragPointer.current === null) {
      dragPointer.current = e.pointerId;
      (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
      const cell = keyToHex(
        (cellEl.getAttribute('data-cell') ?? cellEl.getAttribute('data-cell-layer')) as string,
      );
      interaction.onTileDown(cell, toBoard(e.currentTarget, e.clientX, e.clientY));
      return;
    }
    if (cellEl) return; // tiles are inert without an interaction layer

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: effective };
      pan.current = null;
      return;
    }
    pan.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, view: effective, moved: false };
    (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGElement>) => {
    if (dragPointer.current === e.pointerId && interaction) {
      interaction.onDragMove(toBoard(e.currentTarget, e.clientX, e.clientY));
      return;
    }
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0 && dist > 0) {
        const factor = dist / pinch.current.dist;
        const mid = toBoard(e.currentTarget, (a.x + b.x) / 2, (a.y + b.y) / 2);
        onViewChange(zoomViewState(pinch.current.view, factor, mid.x, mid.y));
      }
      return;
    }
    if (pan.current && pan.current.id === e.pointerId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const unit = w / (rect.width || 600);
      const dx = e.clientX - pan.current.startX;
      const dy = e.clientY - pan.current.startY;
      if (Math.hypot(dx, dy) > 3) pan.current.moved = true;
      if (pan.current.moved) {
        onViewChange({
          cx: pan.current.view.cx - dx * unit,
          cy: pan.current.view.cy - dy * unit,
          zoom: pan.current.view.zoom,
        });
      }
    }
  };

  const endPointer = (e: ReactPointerEvent<SVGElement>) => {
    if (dragPointer.current === e.pointerId) {
      dragPointer.current = null;
      interaction?.onDragEnd(toBoard(e.currentTarget, e.clientX, e.clientY));
      return;
    }
    if (pan.current?.id === e.pointerId && !pan.current.moved && e.type === 'pointerup') {
      interaction?.onBackgroundTap();
    }
    pointers.current.delete(e.pointerId);
    if (pan.current?.id === e.pointerId) pan.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onWheel = (e: ReactWheelEvent<SVGElement>) => {
    const factor = Math.exp(-e.deltaY * 0.0015);
    const at = toBoard(e.currentTarget, e.clientX, e.clientY);
    onViewChange(zoomViewState(effective, factor, at.x, at.y));
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <BoardView
        board={board}
        {...(ui ? { ui } : {})}
        viewBox={viewBox}
        {...boardProps}
        svgProps={{
          ref: svgRef,
          onPointerDown,
          onPointerMove,
          onPointerUp: endPointer,
          onPointerCancel: endPointer,
          onWheel,
        }}
      />
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
