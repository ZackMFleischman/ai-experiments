// The assembled play surface (T3.5): viewport + grid + rack + drag layer.
// Drag is raw pointer events, no dnd library (DESIGN §7.2, hive §9.8):
// rack drags ride window listeners after the tray hands the pointer over;
// staged-tile drags ride the viewport's interaction seam. All hit-testing is
// board-space (transform-proof). Rules stay in the controller's verdicts.
import ReplayIcon from '@mui/icons-material/Replay';
import { Box, Button } from '@mui/material';
import type { Cell, CellKey, TileFace } from '@lex/engine';
import { cellKey } from '@lex/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameController } from '../controller/GameController';
import { useGameController } from '../controller/useGameController';
import { BoardGrid, boardPixelSize, pointToCell } from './BoardGrid';
import type { BoardInteraction, BoardPoint, BoardViewportHandle } from './BoardViewport';
import { BoardViewport } from './BoardViewport';
import { RackTray } from './RackTray';
import { useColorMode } from '../theme';
import { skinVars } from './skin';
import { Tile } from './Tile';

interface RackDrag {
  index: number;
  face: TileFace;
  pointerId: number;
  x: number;
  y: number;
}

export function GameBoard({ controller }: { controller: GameController }) {
  const snap = useGameController(controller);
  const { mode } = useColorMode();
  const viewportRef = useRef<BoardViewportHandle | null>(null);
  const [rackDrag, setRackDrag] = useState<RackDrag | null>(null);
  const [hover, setHover] = useState<CellKey | null>(null);
  const pendingDrag = useRef<{ from: Cell; start: BoardPoint; moved: boolean } | null>(null);

  const layout = snap.ruleset.board;
  const points = snap.ruleset.tiles.points;
  const { width, height } = boardPixelSize(layout);

  // Staged-tile drags arrive through the viewport (board coords throughout).
  const interaction: BoardInteraction = useMemo(
    () => ({
      onPendingDown: (cell, pt) => {
        pendingDrag.current = { from: cell, start: pt, moved: false };
        setHover(cellKey(cell));
      },
      onDragMove: (pt) => {
        const d = pendingDrag.current;
        if (!d) return;
        if (Math.hypot(pt.x - d.start.x, pt.y - d.start.y) > 6) d.moved = true;
        const cell = pointToCell(pt, layout);
        setHover(cell ? cellKey(cell) : null);
      },
      onDragEnd: (pt) => {
        const d = pendingDrag.current;
        pendingDrag.current = null;
        setHover(null);
        if (!d) return;
        const cell = pointToCell(pt, layout);
        if (!d.moved || !cell) {
          // A tap bounces the tile home; a drop off-board returns it too.
          controller.returnPending(d.from);
          return;
        }
        controller.movePending(d.from, cell); // occupied target = stays put
      },
      onCellTap: (cell) => controller.tapCell(cell),
      onBackgroundTap: () => controller.cancelSelection(),
    }),
    [controller, layout],
  );

  // Rack drags: the tray hands the pointer over; window listeners take it.
  useEffect(() => {
    if (!rackDrag) return;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== rackDrag.pointerId) return;
      setRackDrag({ ...rackDrag, x: e.clientX, y: e.clientY });
      const pt = viewportRef.current?.toBoardPoint(e.clientX, e.clientY);
      const cell = pt ? pointToCell(pt, layout) : null;
      setHover(cell ? cellKey(cell) : null);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== rackDrag.pointerId) return;
      const pt = viewportRef.current?.toBoardPoint(e.clientX, e.clientY);
      const cell = pt ? pointToCell(pt, layout) : null;
      if (cell) controller.placeAt(cell, rackDrag.index); // occupied/off = no-op
      setRackDrag(null);
      setHover(null);
    };
    const cancel = () => {
      setRackDrag(null);
      setHover(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [rackDrag, controller, layout]);

  // Esc always clears a tap-tap selection.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controller.cancelSelection();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [controller]);

  return (
    <Box data-testid="game-board" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <BoardViewport
          boardWidth={width}
          boardHeight={height}
          view={snap.view}
          onViewChange={(v) => controller.setView(v)}
          interaction={interaction}
          handleRef={viewportRef}
        >
          <BoardGrid
            layout={layout}
            points={points}
            tiles={snap.state.board}
            pending={snap.pending}
            hover={hover}
          />
        </BoardViewport>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, py: 0.5 }}>
        <Button
          size="small"
          startIcon={<ReplayIcon />}
          disabled={snap.pending.size === 0}
          onClick={() => controller.recallAll()}
        >
          Recall
        </Button>
      </Box>
      <RackTray
        tiles={snap.rack}
        rackSize={snap.ruleset.rackSize}
        points={points}
        bagCount={snap.bagCount}
        disabled={!snap.interactive}
        selectedIndex={snap.selection}
        onTileTap={(i) => controller.selectRackSlot(i)}
        onReorder={(from, to) => controller.reorderRack(from, to)}
        onShuffle={() => controller.shuffleRack()}
        onDragOut={(index, pointerId, x, y) => {
          const face = controller.getSnapshot().rack[index];
          if (face) setRackDrag({ index, face, pointerId, x, y });
        }}
      />
      {rackDrag && (
        <Box
          data-testid="drag-ghost"
          sx={{
            ...skinVars(mode),
            position: 'fixed',
            left: rackDrag.x - 24,
            top: rackDrag.y - 48, // lifted above the finger
            pointerEvents: 'none',
            zIndex: (t) => t.zIndex.tooltip,
            opacity: 0.95,
          }}
        >
          {rackDrag.face === '?' ? (
            <Tile letter="" isBlank points={0} pending />
          ) : (
            <Tile letter={rackDrag.face} isBlank={false} points={points[rackDrag.face] ?? 0} pending />
          )}
        </Box>
      )}
    </Box>
  );
}
