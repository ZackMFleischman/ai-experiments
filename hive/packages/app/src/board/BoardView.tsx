// Pure SVG board renderer (T3.2): `(board, ui) → SVG`. No rules knowledge —
// everything it highlights arrives precomputed from the controller.
import type { CellKey, Hex, TileId } from '@hive/engine';
import { useTheme } from '@mui/material/styles';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import './board.css';
import { usePieceArt } from './pieceArt';
import {
  cellBounds,
  cellCenter,
  HEX_SIZE,
  hexKey,
  hexPoints,
  keyToHex,
  STACK_OFFSET,
} from './hexGeometry';

export type BoardMap = ReadonlyMap<CellKey, readonly TileId[]>;

export interface BoardUi {
  /** Cell of the currently selected piece (lift + stronger shadow). */
  selectedCell?: CellKey;
  /** Tiles with at least one legal move (subtle lift affordance). */
  movableCells?: ReadonlySet<CellKey>;
  /** Legal empty destinations (ghost hexes). */
  targets?: ReadonlySet<CellKey>;
  /** Legal occupied destinations (climb badges on top of stacks). */
  climbTargets?: ReadonlySet<CellKey>;
  /** Cell the pointer is over during a drag, if it is a target. */
  hoverTarget?: CellKey;
  /** Dim everything that is neither selected nor a target. */
  dimOthers?: boolean;
  /** Last move highlight. */
  lastMove?: { from?: Hex; to: Hex };
  /** Hide the top tile of this cell (it is being dragged; T3.6 renders it at the pointer). */
  hideTopOf?: CellKey;
  /** Six-cell end-of-game pulse (T3.9). */
  pulseCells?: ReadonlySet<CellKey>;
  /** Fan out this stack for inspection. */
  fannedStack?: CellKey;
}

export interface BoardViewProps {
  board: BoardMap;
  ui?: BoardUi;
  /** Controlled viewBox (pan/zoom, T3.3); defaults to auto-fit. */
  viewBox?: string;
  onCellPointerDown?: (cell: Hex, e: ReactPointerEvent<SVGElement>) => void;
  /** Extra SVG content rendered above tiles (drag preview layer, T3.6). */
  overlay?: ReactNode;
  svgProps?: Record<string, unknown>;
}

export function autoFitViewBox(board: BoardMap, extra?: Iterable<CellKey>): string {
  const cells: Hex[] = [...board.keys(), ...(extra ?? [])].map(keyToHex);
  const bounds = cellBounds(cells.length > 0 ? cells : [{ q: 0, r: 0 }]);
  if (!bounds) return '-200 -200 400 400';
  const pad = HEX_SIZE * 1.6;
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  return `${minX} ${minY} ${bounds.maxX + pad - minX} ${bounds.maxY + pad - minY}`;
}

function Tile({
  tile,
  level,
  className,
  pulse,
}: {
  tile: TileId;
  level: number;
  className?: string | undefined;
  pulse?: boolean | undefined;
}) {
  const glyphSize = HEX_SIZE * 1.15;
  const { symbolFor } = usePieceArt();
  return (
    <g
      className={`hive-tile-${tile.color} ${className ?? ''}`}
      transform={`translate(${level * STACK_OFFSET.x}, ${level * STACK_OFFSET.y})`}
      data-tile={`${tile.color}${tile.kind}${tile.ordinal}`}
      data-level={level}
    >
      <polygon points={hexPoints()} fill="var(--hive-tile)" stroke="var(--hive-tile-edge)" strokeWidth={3} strokeLinejoin="round" />
      <use
        href={`#${symbolFor(tile.kind)}`}
        x={-glyphSize / 2}
        y={-glyphSize / 2}
        width={glyphSize}
        height={glyphSize}
      />
      {pulse && <polygon points={hexPoints()} className="hive-pulse" />}
    </g>
  );
}

export function BoardView({ board, ui = {}, viewBox, onCellPointerDown, overlay, svgProps }: BoardViewProps) {
  const dark = useTheme().palette.mode === 'dark';
  const targets = ui.targets ?? new Set<CellKey>();
  const climbTargets = ui.climbTargets ?? new Set<CellKey>();
  const box = viewBox ?? autoFitViewBox(board, [...targets, ...climbTargets]);

  // Render stacks sorted so lower rows paint over upper ones correctly.
  const cells = [...board.entries()]
    .map(([key, stack]) => ({ key, cell: keyToHex(key), stack }))
    .sort((a, b) => a.cell.r - b.cell.r || a.cell.q - b.cell.q);

  const lastFrom = ui.lastMove?.from ? hexKey(ui.lastMove.from) : undefined;
  const lastTo = ui.lastMove ? hexKey(ui.lastMove.to) : undefined;

  return (
    <svg
      className={`hive-board-scope ${dark ? 'hive-dark' : ''}`}
      viewBox={box}
      data-testid="board-view"
      style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
      {...svgProps}
    >
      {lastFrom !== undefined && !board.has(lastFrom) && (
        <g transform={translateTo(keyToHex(lastFrom))}>
          <polygon points={hexPoints(HEX_SIZE * 0.92)} className="hive-last-move" strokeDasharray="4 5" data-testid="last-move-from" />
        </g>
      )}

      {/* T6.2: paint stacks by vertical layer (all level-0 tiles, then level-1, …)
          so tall stacks are never overdrawn by the neighbor in front. Layer 0 carries
          the unique per-cell [data-cell]; upper layers carry [data-cell-layer]
          (the viewport resolves presses from either); badges paint above all
          tiles.
          Fanned stacks render in their own top layer (inspection overlay). */}
      {Array.from(
        { length: Math.max(1, ...cells.map(({ key, stack }) => (ui.hideTopOf === key ? stack.length - 1 : stack.length))) },
        (_, level) => (
          <g key={`layer-${level}`}>
            {cells.map(({ key, cell, stack }) => {
              if (ui.fannedStack === key) return null;
              const visible = ui.hideTopOf === key ? stack.slice(0, -1) : stack;
              if (level > 0 && level >= visible.length) return null;
              const tile = visible[level];
              const isSelected = ui.selectedCell === key;
              const isMovable = ui.movableCells?.has(key) ?? false;
              const isClimb = climbTargets.has(key);
              const dim =
                (ui.dimOthers ?? false) && !isSelected && !isClimb && !targets.has(key) && ui.hideTopOf !== key;
              const isTop = level === visible.length - 1;
              return (
                <g
                  key={key}
                  transform={translateTo(cell)}
                  {...(level === 0 ? { 'data-cell': key } : { 'data-cell-layer': key })}
                  className={dim ? 'hive-dimmed' : undefined}
                  onPointerDown={onCellPointerDown ? (e) => onCellPointerDown(cell, e) : undefined}
                >
                  {tile && (
                    <Tile
                      tile={tile}
                      level={level}
                      pulse={ui.pulseCells?.has(key) && isTop}
                      className={
                        isTop
                          ? `${isSelected ? 'hive-selected' : ''} ${isMovable && !isSelected ? 'hive-movable' : ''}`
                          : undefined
                      }
                    />
                  )}
                </g>
              );
            })}
          </g>
        ),
      )}

      {cells.map(({ key, cell, stack }) => {
        if (ui.fannedStack !== key) return null;
        const visible = ui.hideTopOf === key ? stack.slice(0, -1) : stack;
        return (
          <g
            key={`fan-${key}`}
            transform={translateTo(cell)}
            data-cell={key}
            onPointerDown={onCellPointerDown ? (e) => onCellPointerDown(cell, e) : undefined}
          >
            {visible.map((tile, level) => (
              <g
                key={`${tile.color}${tile.kind}${tile.ordinal}`}
                transform={`translate(${level * HEX_SIZE * 1.1}, ${level * -8})`}
              >
                <Tile
                  tile={tile}
                  level={0}
                  className={
                    level === visible.length - 1 && ui.selectedCell === key ? 'hive-selected' : undefined
                  }
                />
              </g>
            ))}
          </g>
        );
      })}

      {cells.map(({ key, cell, stack }) => {
        const visible = ui.hideTopOf === key ? stack.slice(0, -1) : stack;
        const isClimb = climbTargets.has(key);
        if (lastTo !== key && !isClimb) return null;
        return (
          <g
            key={`badge-${key}`}
            transform={translateTo(cell)}
            data-cell-layer={key}
            onPointerDown={onCellPointerDown ? (e) => onCellPointerDown(cell, e) : undefined}
          >
            {lastTo === key && (
              <g transform={`translate(${(visible.length - 1) * STACK_OFFSET.x}, ${(visible.length - 1) * STACK_OFFSET.y})`}>
                <polygon points={hexPoints(HEX_SIZE * 0.92)} className="hive-last-move" data-testid="last-move-to" />
              </g>
            )}
            {isClimb && (
              <g
                transform={`translate(${visible.length * STACK_OFFSET.x}, ${visible.length * STACK_OFFSET.y})`}
                className="hive-ghost"
                data-testid={`climb-${key}`}
              >
                <polygon points={hexPoints(HEX_SIZE * 0.7)} fill="transparent" stroke="currentColor" strokeWidth={3.5} strokeDasharray="7 6" />
              </g>
            )}
          </g>
        );
      })}

      {[...targets].map((key) => {
        const cell = keyToHex(key);
        const hover = ui.hoverTarget === key;
        return (
          <g
            key={`ghost-${key}`}
            transform={translateTo(cell)}
            className={`hive-ghost ${hover ? 'hive-ghost-hover' : ''}`}
            data-cell={key}
            data-testid={`ghost-${key}`}
            onPointerDown={onCellPointerDown ? (e) => onCellPointerDown(cell, e) : undefined}
          >
            <polygon
              points={hexPoints(HEX_SIZE * 0.9)}
              fill={hover ? undefined : 'transparent'}
              stroke="currentColor"
              strokeWidth={3.5}
              strokeDasharray="9 7"
              strokeLinejoin="round"
            />
          </g>
        );
      })}

      {overlay}
    </svg>
  );
}

function translateTo(cell: Hex): string {
  const { x, y } = cellCenter(cell);
  return `translate(${x}, ${y})`;
}
