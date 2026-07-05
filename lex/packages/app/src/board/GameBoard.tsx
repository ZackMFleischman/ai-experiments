// The assembled play surface (T3.5): viewport + grid + rack + drag layer.
// Drag is raw pointer events, no dnd library (DESIGN §7.2, hive §9.8):
// rack drags ride window listeners after the tray hands the pointer over;
// staged-tile drags ride the viewport's interaction seam. All hit-testing is
// board-space (transform-proof). Rules stay in the controller's verdicts.
import { Box } from '@mui/material';
import type { Cell, CellKey, TileFace } from '@lex/engine';
import { cellKey, parseCellKey } from '@lex/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameController } from '../controller/GameController';
import { useGameController } from '../controller/useGameController';
import { BlankPicker } from '../game/BlankPicker';
import { EndBeat } from '../game/EndBeat';
import { ExchangeBar } from '../game/ExchangeBar';
import { GameActions } from '../game/GameActions';
import { ResultOverlay } from '../game/ResultOverlay';
import { ScoreBar } from '../game/ScoreBar';
import { ScoreSheet } from '../game/ScoreSheet';
import { BoardGrid, boardPixelSize, pointToCell } from './BoardGrid';
import { PreviewOverlay } from './PreviewOverlay';
import type { BoardInteraction, BoardPoint, BoardViewportHandle } from './BoardViewport';
import { BoardViewport } from './BoardViewport';
import { RackTray } from './RackTray';
import { useTheme } from '@mui/material/styles';
import { BOARD_PAD_PX, CELL_PX, skinVars } from './skin';
import { useSkinId } from './skinContext';
import { GameInfoDialog } from '../game/GameInfoDialog';
import { NoticeToast } from '../game/NoticeToast';
import { Tile } from './Tile';

/** ONE drag layer for every tile in flight, rack- or board-origin: a fixed-
 * position ghost rides under the finger (fixed = it survives leaving the
 * viewport's overflow) and SNAPS into the free cell under the finger — release
 * commits exactly the cell the ghost sits in, so it never lands anywhere the
 * snap didn't show. Hovering the tray flips into rack-insertion mode with the
 * live slide preview. */
interface DragState {
  source: 'rack' | 'board';
  face: TileFace;
  letter: string | null;
  isBlank: boolean;
  /** Rack origin: the slot the tile left. */
  fromIndex: number | null;
  /** Board origin: the staged cell the tile was picked up from. */
  fromCell: CellKey | null;
  /** Rack origin only: the pointer riding the window listeners. */
  pointerId: number | null;
  x: number; // client coords
  y: number;
}

const HALF_TILE = CELL_PX / 2; // half the free-riding ghost tile

const DEFAULT_NAMES = ['Player 1', 'Player 2'];

export function GameBoard({
  controller,
  seatNames = DEFAULT_NAMES,
  onRematch,
  onBackToLobby,
  timeControl,
}: {
  controller: GameController;
  seatNames?: readonly string[];
  onRematch?: () => void;
  onBackToLobby?: () => void;
  /** Multiplayer: the game's async clock, restated in the info menu (T4.7). */
  timeControl?: { days: 1 | 3 | 7 } | null;
}) {
  const snap = useGameController(controller);
  const mode = useTheme().palette.mode;
  const skinId = useSkinId();
  const viewportRef = useRef<BoardViewportHandle | null>(null);
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [hover, setHover] = useState<CellKey | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const pendingDrag = useRef<{ from: Cell; start: BoardPoint; moved: boolean } | null>(null);
  const trayWrapRef = useRef<HTMLDivElement | null>(null);

  const layout = snap.ruleset.board;
  const points = snap.ruleset.tiles.points;
  const { width, height } = boardPixelSize(layout);

  const updateDrag = useCallback((d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);

  // Tray geometry for the drag layer. jsdom rects are 0×0 — tests mock the
  // tray element itself, so fall down the row → tray chain.
  const trayRect = useCallback((): DOMRect | null => {
    const el = trayWrapRef.current?.querySelector('[data-testid="rack-tray"]');
    const r = el?.getBoundingClientRect();
    return r && (r.width || r.height) ? r : null;
  }, []);
  const overRack = useCallback(
    (clientY: number): boolean => {
      const r = trayRect();
      return r !== null && clientY >= r.top - 12;
    },
    [trayRect],
  );
  const rackIndexAt = useCallback(
    (clientX: number): number => {
      const row = trayWrapRef.current?.querySelector('[data-rack-row]')?.getBoundingClientRect();
      const rect = row?.width ? row : trayRect();
      const size = controller.getSnapshot().ruleset.rackSize;
      if (!rect || !rect.width) return 0;
      return Math.min(size - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * size)));
    },
    [controller, trayRect],
  );
  /** A returned board tile lands at a deterministic slot (its original slot
   * if free, else the first empty) — mirror the controller for targeting. */
  const landSlot = useCallback(
    (fromCell: CellKey): number => {
      const s = controller.getSnapshot();
      const tile = s.pending.get(fromCell);
      if (!tile) return -1;
      return s.rack[tile.fromIndex] === null ? tile.fromIndex : s.rack.indexOf(null);
    },
    [controller],
  );
  /** The cell a drop would land in: under the finger AND free — committed or
   * (foreign) staged tiles block it; a staged tile's own cell counts as free.
   * The ghost snaps here while dragging, so release keeps it where it shows. */
  const snapCell = useCallback(
    (client: BoardPoint): Cell | null => {
      const pt = viewportRef.current?.toBoardPoint(client.x, client.y);
      const cell = pt ? pointToCell(pt, layout) : null;
      if (!cell) return null;
      const key = cellKey(cell);
      const s = controller.getSnapshot();
      if (s.state.board.has(key)) return null;
      if (s.pending.has(key) && key !== dragRef.current?.fromCell) return null;
      return cell;
    },
    [controller, layout],
  );
  const finishDrag = useCallback(
    (client: BoardPoint): void => {
      const state = dragRef.current;
      updateDrag(null);
      setHover(null);
      if (!state) return;
      if (overRack(client.y)) {
        // Rack-insertion drop: reorder / targeted return (the live preview
        // the tray showed is exactly what commits here).
        const to = rackIndexAt(client.x);
        if (state.source === 'rack') {
          if (state.fromIndex !== null && to !== state.fromIndex) {
            controller.reorderRack(state.fromIndex, to);
          }
          return;
        }
        if (state.fromCell) {
          const land = landSlot(state.fromCell);
          controller.returnPending(parseCellKey(state.fromCell));
          if (land >= 0 && land !== to) controller.reorderRack(land, to);
        }
        return;
      }
      const cell = snapCell(client);
      if (state.source === 'rack') {
        if (cell && state.fromIndex !== null) controller.placeAt(cell, state.fromIndex); // no snap = stays racked
        return;
      }
      if (!state.fromCell) return;
      if (cell) controller.movePending(parseCellKey(state.fromCell), cell); // own cell = stays put
      else controller.returnPending(parseCellKey(state.fromCell)); // nothing snapped = home
    },
    [controller, snapCell, landSlot, overRack, rackIndexAt, updateDrag],
  );

  // Staged-tile drags arrive through the viewport; the drag layer works in
  // client coordinates from here on.
  const interaction: BoardInteraction = useMemo(
    () => ({
      onPendingDown: (cell, pt, client) => {
        pendingDrag.current = { from: cell, start: pt, moved: false };
        setHover(cellKey(cell));
        // Pick the tile up: it leaves the cell and follows the finger.
        const staged = controller.getSnapshot().pending.get(cellKey(cell));
        if (staged) {
          updateDrag({
            source: 'board',
            face: staged.face,
            letter: staged.letter,
            isBlank: staged.isBlank,
            fromIndex: null,
            fromCell: cellKey(cell),
            pointerId: null,
            x: client.x,
            y: client.y,
          });
        }
      },
      onDragMove: (pt, client) => {
        const d = pendingDrag.current;
        if (!d) return;
        if (Math.hypot(pt.x - d.start.x, pt.y - d.start.y) > 6) d.moved = true;
        const g = dragRef.current;
        if (g) updateDrag({ ...g, x: client.x, y: client.y });
        if (overRack(client.y)) setHover(null);
        else {
          const cell = snapCell(client);
          setHover(cell ? cellKey(cell) : null);
        }
      },
      onDragEnd: (pt, client) => {
        const d = pendingDrag.current;
        pendingDrag.current = null;
        if (!d) {
          updateDrag(null);
          setHover(null);
          return;
        }
        if (!d.moved) {
          // A tap bounces the tile home.
          updateDrag(null);
          setHover(null);
          controller.returnPending(d.from);
          return;
        }
        finishDrag(client);
      },
      onCellTap: (cell) => controller.tapCell(cell),
      onBackgroundTap: () => controller.cancelSelection(),
    }),
    [controller, finishDrag, snapCell, overRack, updateDrag],
  );

  // Rack drags: the tray hands the pointer over; window listeners take it.
  useEffect(() => {
    if (!drag || drag.source !== 'rack') return;
    const pid = drag.pointerId;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const g = dragRef.current;
      if (g) updateDrag({ ...g, x: e.clientX, y: e.clientY });
      if (overRack(e.clientY)) setHover(null);
      else {
        const cell = snapCell({ x: e.clientX, y: e.clientY });
        setHover(cell ? cellKey(cell) : null);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      finishDrag({ x: e.clientX, y: e.clientY });
    };
    const cancel = () => {
      updateDrag(null);
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
  }, [drag, finishDrag, snapCell, overRack, updateDrag]);

  // Esc always clears a tap-tap selection.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controller.cancelSelection();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [controller]);

  // The opponent-play highlight yields the stage to pending placements: the
  // moment a tile is staged it disappears (recall brings it back).
  const lastPlay =
    snap.lastPlay?.kind === 'play' && snap.pending.size === 0 ? snap.lastPlay : undefined;
  const lastPlayEnd = lastPlay?.cells[lastPlay.cells.length - 1];

  // While a staged tile is in flight its cell renders empty — the ghost IS the tile.
  const visiblePending = useMemo(() => {
    if (drag?.source !== 'board' || !drag.fromCell) return snap.pending;
    const m = new Map(snap.pending);
    m.delete(drag.fromCell);
    return m;
  }, [snap.pending, drag]);

  // While a rack tile is in flight its slot renders empty, same idea.
  const visibleRack = useMemo(
    () =>
      drag?.source === 'rack' && drag.fromIndex !== null
        ? snap.rack.map((f, i) => (i === drag.fromIndex ? null : f))
        : snap.rack,
    [snap.rack, drag],
  );

  // Ghost hovering the tray → the rack shows the live insertion preview.
  const rackHover = drag !== null && overRack(drag.y);
  const rackPreview = (() => {
    if (!drag || !rackHover) return null;
    const from = drag.source === 'rack' ? drag.fromIndex : landSlot(drag.fromCell as CellKey);
    if (from === null || from < 0) return null;
    return { from, to: rackIndexAt(drag.x) };
  })();

  return (
    <Box data-testid="game-board" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ScoreBar
        names={seatNames}
        scores={snap.scores}
        toMove={snap.toMove}
        onOpenSheet={() => setSheetOpen(true)}
        onInfo={() => setInfoOpen(true)}
      />
      <NoticeToast notice={snap.notice} />
      <GameInfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        rulesetId={snap.options.rulesetId}
        dictionaryId={snap.options.dictionaryId}
        {...(timeControl !== undefined ? { timeControl } : {})}
      />
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <BoardViewport
          boardWidth={width}
          boardHeight={height}
          view={snap.view}
          onViewChange={(v) => controller.setView(v)}
          interaction={interaction}
          handleRef={viewportRef}
        >
          <Box sx={{ position: 'relative', width: 'fit-content' }}>
            <BoardGrid
              layout={layout}
              points={points}
              tiles={snap.state.board}
              pending={visiblePending}
              hover={hover}
              {...(lastPlay ? { lastPlayCells: lastPlay.cells } : {})}
            />
            <PreviewOverlay
              preview={snap.preview}
              anchor={snap.pending.size > 0 ? [...snap.pending.keys()][0] ?? null : null}
            />
            {lastPlay && lastPlayEnd && (
              <Box
                data-testid="last-play-score"
                sx={{
                  position: 'absolute',
                  left: 2 + (parseCellKey(lastPlayEnd).col + 1) * 36 + 4,
                  top: 2 + parseCellKey(lastPlayEnd).row * 36,
                  px: 0.75,
                  borderRadius: 10,
                  bgcolor: 'secondary.main',
                  color: 'secondary.contrastText',
                  fontSize: 14,
                  fontWeight: 700,
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                +{lastPlay.total}
              </Box>
            )}
          </Box>
        </BoardViewport>
      </Box>
      {snap.exchange ? (
        <ExchangeBar
          count={snap.exchange.size}
          onConfirm={() => controller.confirmExchange()}
          onCancel={() => controller.cancelExchange()}
        />
      ) : (
        <GameActions
          playable={snap.preview?.playable ?? false}
          hasPending={snap.pending.size > 0}
          interactive={snap.interactive}
          canResign={!snap.end}
          canExchange={snap.canExchange}
          exchangeMinBag={snap.ruleset.exchangeMinBag}
          bagCount={snap.bagCount}
          onPlay={() => controller.submitPlay()}
          onRecall={() => controller.recallAll()}
          onExchange={() => controller.beginExchange()}
          onPass={() => controller.pass()}
          onResign={() => controller.resign()}
        />
      )}
      <Box ref={trayWrapRef}>
        <RackTray
          tiles={visibleRack}
          rackSize={snap.ruleset.rackSize}
          points={points}
          bagCount={snap.bagCount}
          disabled={!snap.interactive}
          drawing={snap.drawing}
          selectedIndex={snap.selection}
          exchangeSelection={snap.exchange}
          externalDrag={rackPreview}
          onTileTap={(i) => (snap.exchange ? controller.toggleExchange(i) : controller.selectRackSlot(i))}
          onReorder={(from, to) => controller.reorderRack(from, to)}
          onShuffle={() => controller.shuffleRack()}
          onDragOut={(index, pointerId, x, y) => {
            if (snap.exchange) return; // no board drags while exchanging
            const face = controller.getSnapshot().rack[index];
            if (face) {
              updateDrag({
                source: 'rack',
                face,
                letter: face === '?' ? null : face,
                isBlank: face === '?',
                fromIndex: index,
                fromCell: null,
                pointerId,
                x,
                y,
              });
            }
          }}
        />
      </Box>
      <ScoreSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        rows={snap.sheet}
        names={seatNames}
      />
      {snap.beat && <EndBeat onDone={() => controller.finishBeat()} />}
      {snap.end && (
        <ResultOverlay
          open={snap.overlayOpen}
          end={snap.end}
          names={seatNames}
          sheet={snap.sheet}
          onRematch={() => onRematch?.()}
          onViewBoard={() => controller.dismissOverlay()}
          {...(onBackToLobby ? { onBackToLobby } : {})}
        />
      )}
      {snap.end && !snap.overlayOpen && !snap.beat && (
        <Box
          data-testid="result-banner"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            py: 0.5,
            bgcolor: 'action.selected',
          }}
        >
          <Box component="span" sx={{ fontSize: 14 }}>
            Game over
          </Box>
          <Box
            component="button"
            onClick={() => controller.reopenOverlay()}
            sx={{ border: 'none', background: 'none', color: 'primary.main', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            View result
          </Box>
        </Box>
      )}
      <BlankPicker
        open={snap.preview?.needsBlank != null}
        tiles={snap.ruleset.tiles}
        onPick={(letter) => {
          const cell = controller.getSnapshot().preview?.needsBlank;
          if (cell) controller.setBlankLetter(parseCellKey(cell), letter);
        }}
      />
      {drag &&
        (() => {
          // Over a free cell the ghost snaps INTO it — position and scale
          // match the cell exactly, so release keeps the tile visually where
          // it already sits. Elsewhere (occupied cell, off-board, over the
          // rack) it rides centered under the finger.
          const snapped = (() => {
            if (rackHover || !hover) return null;
            const { row, col } = parseCellKey(hover);
            const vp = viewportRef.current;
            const origin = vp?.toClientPoint(
              BOARD_PAD_PX + col * CELL_PX,
              BOARD_PAD_PX + row * CELL_PX,
            );
            return origin ? { ...origin, scale: vp!.clientScale() } : null;
          })();
          return (
            <Box
              data-testid="drag-ghost"
              data-snapped={snapped ? 'true' : undefined}
              sx={{
                ...skinVars(mode, skinId),
                position: 'fixed',
                width: CELL_PX,
                height: CELL_PX,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: (t) => t.zIndex.tooltip,
                filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.35))',
              }}
              // Geometry rides inline styles: it changes every pointermove,
              // and emotion would mint a class per frame (RackTray precedent).
              style={
                snapped
                  ? {
                      left: snapped.x,
                      top: snapped.y,
                      transform: `scale(${snapped.scale})`,
                      transformOrigin: '0 0',
                    }
                  : {
                      left: drag.x - HALF_TILE,
                      top: drag.y - HALF_TILE,
                      transform: 'scale(1.15)',
                    }
              }
            >
              <Tile
                letter={drag.letter ?? ''}
                isBlank={drag.isBlank}
                points={drag.isBlank ? 0 : points[drag.face] ?? 0}
                pending
              />
            </Box>
          );
        })()}
    </Box>
  );
}
