// The assembled play surface (T3.5): viewport + grid + rack + drag layer.
// Drag is raw pointer events, no dnd library (DESIGN §7.2, hive §9.8):
// rack drags ride window listeners after the tray hands the pointer over;
// staged-tile drags ride the viewport's interaction seam. All hit-testing is
// board-space (transform-proof). Rules stay in the controller's verdicts.
import { Box } from '@mui/material';
import type { Cell, CellKey, TileFace } from '@lex/engine';
import { cellKey, parseCellKey } from '@lex/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { skinVars } from './skin';
import { GameInfoDialog } from '../game/GameInfoDialog';
import { Tile } from './Tile';

interface RackDrag {
  index: number;
  face: TileFace;
  pointerId: number;
  x: number;
  y: number;
}

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
  const viewportRef = useRef<BoardViewportHandle | null>(null);
  const [rackDrag, setRackDrag] = useState<RackDrag | null>(null);
  const [hover, setHover] = useState<CellKey | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
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

  const lastPlay = snap.lastPlay?.kind === 'play' ? snap.lastPlay : undefined;
  const lastPlayEnd = lastPlay?.cells[lastPlay.cells.length - 1];

  return (
    <Box data-testid="game-board" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ScoreBar
        names={seatNames}
        scores={snap.scores}
        toMove={snap.toMove}
        onOpenSheet={() => setSheetOpen(true)}
        onInfo={() => setInfoOpen(true)}
      />
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
              pending={snap.pending}
              hover={hover}
              {...(lastPlay ? { lastPlayCells: lastPlay.cells } : {})}
            />
            <PreviewOverlay
              preview={snap.preview}
              anchor={snap.pending.size > 0 ? [...snap.pending.keys()][0] ?? null : null}
            />
            {lastPlay && lastPlayEnd && snap.pending.size === 0 && (
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
      <RackTray
        tiles={snap.rack}
        rackSize={snap.ruleset.rackSize}
        points={points}
        bagCount={snap.bagCount}
        disabled={!snap.interactive}
        drawing={snap.drawing}
        selectedIndex={snap.selection}
        exchangeSelection={snap.exchange}
        onTileTap={(i) => (snap.exchange ? controller.toggleExchange(i) : controller.selectRackSlot(i))}
        onReorder={(from, to) => controller.reorderRack(from, to)}
        onShuffle={() => controller.shuffleRack()}
        onDragOut={(index, pointerId, x, y) => {
          if (snap.exchange) return; // no board drags while exchanging
          const face = controller.getSnapshot().rack[index];
          if (face) setRackDrag({ index, face, pointerId, x, y });
        }}
      />
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
