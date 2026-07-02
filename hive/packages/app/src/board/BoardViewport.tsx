// Pan/zoom viewport around BoardView (T3.3). The transform is CONTROLLED —
// the GameController owns it (auto-fit = null view; reset after hive growth).
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { Box, IconButton } from '@mui/material';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useRef } from 'react';
import type { BoardViewProps } from './BoardView';
import { autoFitViewBox, BoardView } from './BoardView';

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

export interface BoardViewportProps extends Omit<BoardViewProps, 'viewBox' | 'svgProps'> {
  view: ViewState | null; // null = auto-fit
  onViewChange: (view: ViewState | null) => void;
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

export function BoardViewport({ view, onViewChange, board, ui, ...boardProps }: BoardViewportProps) {
  const base = parseBox(autoFitViewBox(board, [...(ui?.targets ?? []), ...(ui?.climbTargets ?? [])]));
  const effective: ViewState = view ?? { cx: base.cx, cy: base.cy, zoom: 1 };
  const w = base.w / effective.zoom;
  const h = base.h / effective.zoom;
  const viewBox = `${effective.cx - w / 2} ${effective.cy - h / 2} ${w} ${h}`;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ id: number; startX: number; startY: number; view: ViewState } | null>(null);
  const pinch = useRef<{ dist: number; view: ViewState } | null>(null);

  /** Board units per CSS pixel at the current zoom. */
  const unitsPerPixel = (el: SVGElement) => {
    const rect = el.getBoundingClientRect();
    const width = rect.width || 600;
    return w / width;
  };

  const toBoard = (el: SVGElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 400;
    // viewBox is scaled by preserveAspectRatio meet — use the larger unit size.
    const unit = Math.max(w / width, h / height);
    return {
      x: effective.cx + (clientX - (rect.left + width / 2)) * unit,
      y: effective.cy + (clientY - (rect.top + height / 2)) * unit,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGElement>) => {
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
    // Only background drags pan; tiles and ghosts belong to the drag layer.
    if ((e.target as Element).closest('[data-cell]')) return;
    pan.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, view: effective };
    (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGElement>) => {
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
      const unit = unitsPerPixel(e.currentTarget);
      onViewChange({
        cx: pan.current.view.cx - (e.clientX - pan.current.startX) * unit,
        cy: pan.current.view.cy - (e.clientY - pan.current.startY) * unit,
        zoom: pan.current.view.zoom,
      });
    }
  };

  const endPointer = (e: ReactPointerEvent<SVGElement>) => {
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
