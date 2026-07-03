// Drag layer (T3.6): raw pointer events over the same controller state machine
// as tap-tap — pick up, snap preview on targets, not-allowed tint, spring back,
// Esc cancel. Hand-tray drags enter through the imperative handle.
import type { BugKind, Hex } from '@hive/engine';
import { useEffect, useRef } from 'react';
import type { GameController } from '../controller/GameController';
import { useGameController } from '../controller/useGameController';
import { snapshotToBoardUi } from './boardUi';
import type { BoardViewportHandle } from './BoardViewport';
import { BoardViewport } from './BoardViewport';
import { usePieceArt } from './pieceArt';
import { cellCenter, HEX_SIZE, hexKey, hexPoints, keyToHex } from './hexGeometry';

const DRAG_THRESHOLD = HEX_SIZE * 0.3;

const LONG_PRESS_MS = 550;

export function GameBoard({
  controller,
  onPieceInfo,
}: {
  controller: GameController;
  /** Long-press piece info (GameScreen renders the card). */
  onPieceInfo?: (kind: BugKind | null) => void;
}) {
  const snap = useGameController(controller);
  const { symbolFor } = usePieceArt();
  const handle = useRef<BoardViewportHandle | null>(null);
  const press = useRef<{ cell: Hex; x: number; y: number; dragging: boolean; wasTarget: boolean } | null>(null);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInfo = (hide: boolean) => {
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = null;
    if (hide) onPieceInfo?.(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controller.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // Hand-tray drags: while a hand bug is selected and a tray pointer is down,
  // window-level moves are converted into board space (see HandTray, T3.7).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (snap.selection?.kind !== 'hand' || !controller.handDragActive) return;
      const pt = handle.current?.toBoardPoint(e.clientX, e.clientY);
      if (pt) controller.dragTo(pt.x, pt.y);
    };
    const onUp = (e: PointerEvent) => {
      if (snap.selection?.kind !== 'hand' || !controller.handDragActive) return;
      controller.handDragActive = false;
      const pt = handle.current?.toBoardPoint(e.clientX, e.clientY);
      if (pt && snap.drag) controller.drop(pt.x, pt.y);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [controller, snap.selection, snap.drag]);

  const interaction = {
    onTileDown: (cell: Hex, pt: { x: number; y: number }) => {
      const key = hexKey(cell);
      const isTarget = snap.targets.has(key) || snap.climbTargets.has(key);
      press.current = { cell, x: pt.x, y: pt.y, dragging: false, wasTarget: isTarget };
      // Hold a piece still to learn what it is (T6: long-press info).
      const stack = snap.state.board.get(key);
      const top = stack?.[stack.length - 1];
      clearInfo(true);
      if (top && onPieceInfo) {
        infoTimer.current = setTimeout(() => onPieceInfo(top.kind), LONG_PRESS_MS);
      }
      // Immediate lift for movable pieces; targets commit on release.
      if (!isTarget) controller.selectCell(cell);
    },
    onDragMove: (pt: { x: number; y: number }) => {
      const p = press.current;
      if (!p || p.wasTarget) return;
      if (!p.dragging && Math.hypot(pt.x - p.x, pt.y - p.y) > DRAG_THRESHOLD) {
        p.dragging = true;
        clearInfo(true); // a real drag replaces the info card
      }
      if (p.dragging) controller.dragTo(pt.x, pt.y);
    },
    onDragEnd: (pt: { x: number; y: number }) => {
      const p = press.current;
      press.current = null;
      clearInfo(true);
      if (!p) return;
      if (p.dragging) controller.drop(pt.x, pt.y);
      else if (p.wasTarget) controller.selectCell(p.cell); // tap-tap commit
      // plain tap on a piece: selection already happened on pointer-down
    },
    onBackgroundTap: () => {
      clearInfo(true);
      controller.cancel();
    },
  };

  const ui = snapshotToBoardUi(snap);
  const dragTile =
    snap.drag && snap.selection ? snap.selection.tile : undefined;
  const preview =
    snap.drag && dragTile ? (
      <DragPreview
        x={snap.drag.allowed && snap.drag.over ? cellCenter(keyToHex(snap.drag.over)).x : snap.drag.x}
        y={snap.drag.allowed && snap.drag.over ? cellCenter(keyToHex(snap.drag.over)).y : snap.drag.y}
        symbol={symbolFor(dragTile.kind)}
        color={dragTile.color}
        allowed={snap.drag.allowed}
      />
    ) : undefined;
  // Turn 1, nothing placed: show where the first tile lands instead of a
  // blank void. Suppressed once anything is on the board or while dragging.
  const emptyHint =
    snap.state.board.size === 0 && !snap.end && !snap.drag && !snap.selection ? (
      <EmptyBoardHint yourMove={snap.placeableBugs.size > 0} />
    ) : undefined;
  const overlay =
    preview || emptyHint ? (
      <>
        {emptyHint}
        {preview}
      </>
    ) : undefined;

  return (
    <BoardViewport
      board={snap.state.board}
      ui={ui}
      view={snap.view}
      onViewChange={(v) => controller.setView(v)}
      interaction={interaction}
      handleRef={handle}
      {...(overlay ? { overlay } : {})}
    />
  );
}

function EmptyBoardHint({ yourMove }: { yourMove: boolean }) {
  return (
    <g className="hive-empty-hint" data-testid="empty-board-hint" style={{ pointerEvents: 'none' }}>
      <polygon
        points={hexPoints(HEX_SIZE * 0.9)}
        fill="transparent"
        stroke="currentColor"
        strokeWidth={3}
        strokeDasharray="9 7"
        strokeLinejoin="round"
      />
      <text y={HEX_SIZE * 1.8}>
        {yourMove ? (
          <>
            <tspan x={0}>Your first tile goes here —</tspan>
            <tspan x={0} dy="1.4em">
              pick a bug below
            </tspan>
          </>
        ) : (
          'Waiting for the first move…'
        )}
      </text>
    </g>
  );
}

function DragPreview({
  x,
  y,
  symbol,
  color,
  allowed,
}: {
  x: number;
  y: number;
  symbol: string;
  color: 'w' | 'b';
  allowed: boolean;
}) {
  const glyph = HEX_SIZE * 1.15;
  return (
    <g
      className={`hive-tile-${color}`}
      transform={`translate(${x}, ${y})`}
      data-testid="drag-preview"
      data-allowed={allowed}
      style={{ pointerEvents: 'none', opacity: allowed ? 0.95 : 0.75 }}
    >
      <polygon
        points={hexPoints()}
        fill="var(--hive-tile)"
        stroke={allowed ? 'var(--hive-tile-edge)' : '#c62828'}
        strokeWidth={allowed ? 3 : 4}
        strokeLinejoin="round"
      />
      <use href={`#${symbol}`} x={-glyph / 2} y={-glyph / 2} width={glyph} height={glyph} />
      {!allowed && (
        <line x1={-HEX_SIZE * 0.5} y1={HEX_SIZE * 0.5} x2={HEX_SIZE * 0.5} y2={-HEX_SIZE * 0.5} stroke="#c62828" strokeWidth={4} />
      )}
    </g>
  );
}
