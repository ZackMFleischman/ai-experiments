// The live-preview card (T3.7, DESIGN §7.2): ONE small panel for the whole
// staged play — every word it forms with its own score, the bingo bonus, and
// the total — replacing the per-word chips anchored over the board.
//
// The chips had two problems the card fixes by construction: anchored a row
// above their word's first cell they covered the letters they annotated, and
// the moment a play formed cross words (whose first cells sit within a cell of
// each other) the chips piled onto each other. One card can be PLACED where it
// hides the least (previewCard.pickCardSpot), and the player can drag it
// anywhere the auto-spot still bothers them. It lives in SCREEN space — a
// sibling of the viewport, not a child of the board transform — so it stays a
// readable size at every zoom instead of shrinking with the board.
//
// A word the dictionary rejects is the card's LOUDEST state, not a footnote: a
// small red ✗ beside a row read as decoration next to a big black total. So the
// whole card turns — red border, the doomed total struck through, the offending
// row filled red — and the board rings that word's cells to match. Color and
// weight only: the sentence explaining it lived here for one build and was cut
// as clutter (the state is legible without being narrated; the disabled Play
// button still carries the words for hover and screen readers).
//
// Everything shown is a controller verdict; only the position is computed here.
import { Box, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Cell, CellKey } from '@lex/engine';
import { cellKey, parseCellKey } from '@lex/engine';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Preview } from '../controller/GameController';
import type { BoardViewportHandle } from './BoardViewport';
import { cellRect, cellsBounds, clampInto, inflate, intersects, pickCardSpot } from './previewCard';
import type { Rect } from './previewCard';

const REASON_COPY: Record<string, string> = {
  'not-your-tiles': 'Not your tiles',
  'not-a-line': 'One line only',
  gap: 'No gaps in the word',
  'first-play-center': 'First word covers the star',
  'first-play-too-short': 'Two tiles minimum',
  'not-connected': 'Must connect to a word',
  occupied: 'Cell is taken',
  'off-board': 'Off the board',
};

/** Where the player parked the card (host-relative px) and which staged play
 * they parked it for — see `resolveSpot`. */
export interface ManualSpot {
  left: number;
  top: number;
  forPlay: string;
}

/** Screen-space breathing room: card ↔ play, and card ↔ viewport edges. */
const GAP = 8;
/** Arrow-key nudge (shift = a bigger step) for moving the card without a pointer. */
const NUDGE = 16;
const NUDGE_FAST = 64;

const HEAD_H = 28;
/** The drag grip's width — see the note at its sx block. */
const GRIP_PX = 26;
const ROW_H = 22;
const PAD_H = 14;

/** Good-enough size for the first frame; the real one is measured on layout
 * (jsdom reports 0×0, so the estimate stands in tests). */
function estimateSize(rows: number, longestWord: number): { width: number; height: number } {
  return {
    width: Math.min(260, Math.max(136, 78 + longestWord * 9)),
    height: PAD_H + HEAD_H + rows * ROW_H,
  };
}

/** Stable identity for a staged play — the card's manual spot is pinned to it. */
export function playSignature(cells: readonly Cell[]): string {
  return cells.map(cellKey).sort().join('|');
}

export interface PreviewCardProps {
  preview: Preview;
  /** Ruleset DATA (not a rule the UI computes): what the bingo line is worth. */
  bingoBonus: number;
  /** The staged cells — what the card must try hardest not to cover. */
  playCells: readonly Cell[];
  /** Cells carrying a committed tile: the letters worth not hiding. */
  occupiedCells: readonly CellKey[];
  /** Untransformed board size, the fallback bounds when the viewport hasn't
   * measured itself yet. */
  boardSize: { width: number; height: number };
  /** The element the card is positioned inside (its offset parent). */
  hostRef: RefObject<HTMLElement | null>;
  viewportRef: RefObject<BoardViewportHandle | null>;
  /** A tile is in flight: dim the card and let the drop fall through it. */
  faded: boolean;
  /** A rack tile is armed for tap-tap placement. The card parks beside the
   * play — for a word growing down a column, its grip lands on the very next
   * cell — so while a tile is armed even the grip stops taking pointers and
   * the tap reaches the board. Nothing is lost: with no tile armed, a tap on
   * an empty cell does nothing anyway. */
  placing: boolean;
  manual: ManualSpot | null;
  onManualChange: (manual: ManualSpot) => void;
}

export function PreviewCard({
  preview,
  bingoBonus,
  playCells,
  occupiedCells,
  boardSize,
  hostRef,
  viewportRef,
  faded,
  placing,
  manual,
  onManualChange,
}: PreviewCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const spotRef = useRef<{ left: number; top: number } | null>(null);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);

  const words = preview.check.ok ? preview.words : [];
  const rows = preview.check.ok ? words.length + (preview.bingo ? 1 : 0) : 1;
  const longest = words.reduce((n, w) => Math.max(n, w.word.length), 4);
  // The words the dictionary rejected — what turns the card red.
  const rejected = words.filter((w) => !w.valid);
  const [size, setSize] = useState(() => estimateSize(rows, longest));
  const signature = playSignature(playCells);

  // Measure the rendered card so placement uses its real footprint.
  useLayoutEffect(() => {
    const r = cardRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    if (Math.abs(r.width - size.width) > 1 || Math.abs(r.height - size.height) > 1) {
      setSize({ width: r.width, height: r.height });
    }
  });

  // Placement reads LIVE rects (the viewport transform changes on every pan
  // frame), so it runs after every render and only writes when the answer
  // actually moved — that guard is what keeps it from looping.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const vp = viewportRef.current;
    if (!host || !vp) return;
    const hostRect = host.getBoundingClientRect();
    const hostBounds: Rect = {
      left: 0,
      top: 0,
      width: hostRect.width || boardSize.width,
      height: hostRect.height || boardSize.height,
    };
    const toHost = (x: number, y: number): { x: number; y: number } | null => {
      const p = vp.toClientPoint(x, y);
      return p ? { x: p.x - hostRect.left, y: p.y - hostRect.top } : null;
    };
    const playBounds = cellsBounds(playCells);
    const playOnScreen = ((): Rect | null => {
      if (!playBounds) return null;
      const a = toHost(playBounds.left, playBounds.top);
      const b = toHost(playBounds.left + playBounds.width, playBounds.top + playBounds.height);
      return a && b ? { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y } : null;
    })();

    const next = ((): { left: number; top: number } | null => {
      // A parked card stays exactly where it was parked for as long as the
      // play it was parked for is on the board. Once the play changes it only
      // yields if it would now sit on top of the staged word.
      if (manual) {
        const parked = clampInto(
          { left: manual.left, top: manual.top, width: size.width, height: size.height },
          hostBounds,
          GAP,
        );
        const collides =
          playOnScreen !== null && intersects(parked, inflate(playOnScreen, GAP / 2));
        if (manual.forPlay === signature || !collides) return { left: parked.left, top: parked.top };
      }
      if (!playBounds) return null;
      const scale = vp.clientScale() || 1;
      const topLeft = vp.toBoardPoint(hostRect.left, hostRect.top);
      const bottomRight = vp.toBoardPoint(hostRect.right, hostRect.bottom);
      const measured: Rect | null =
        topLeft && bottomRight
          ? {
              left: topLeft.x,
              top: topLeft.y,
              width: bottomRight.x - topLeft.x,
              height: bottomRight.y - topLeft.y,
            }
          : null;
      // Degenerate container (jsdom, pre-measure): fall back to the whole board.
      const visible =
        measured && measured.width > 1 && measured.height > 1
          ? measured
          : { left: 0, top: 0, width: boardSize.width, height: boardSize.height };
      const board = pickCardSpot({
        play: playBounds,
        card: { width: size.width / scale, height: size.height / scale },
        visible,
        occupied: [...occupiedCells, ...playCells.map(cellKey)].map((k) =>
          cellRect(parseCellKey(k)),
        ),
        gap: GAP / scale,
      });
      const at = toHost(board.left, board.top);
      if (!at) return null;
      const onHost = clampInto(
        { left: at.x, top: at.y, width: size.width, height: size.height },
        hostBounds,
        GAP,
      );
      return { left: onHost.left, top: onHost.top };
    })();

    if (!next) return;
    const prev = spotRef.current;
    if (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5) return;
    spotRef.current = next;
    setSpot(next);
  });

  const park = (left: number, top: number) => {
    const host = hostRef.current;
    const rect = host?.getBoundingClientRect();
    const bounds: Rect = {
      left: 0,
      top: 0,
      width: rect?.width || boardSize.width,
      height: rect?.height || boardSize.height,
    };
    const at = clampInto({ left, top, width: size.width, height: size.height }, bounds, GAP);
    onManualChange({ left: at.left, top: at.top, forPlay: signature });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spot) return;
    // Keep the gesture off the viewport: it captures the pointer on any
    // pointerdown that reaches it, which would override the capture taken
    // here and pan the board instead of moving the card. jsdom implements no
    // pointer capture at all, so only a real browser shows this.
    e.stopPropagation();
    const rect = hostRef.current?.getBoundingClientRect();
    drag.current = {
      id: e.pointerId,
      dx: e.clientX - (rect?.left ?? 0) - spot.left,
      dy: e.clientY - (rect?.top ?? 0) - spot.top,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = hostRef.current?.getBoundingClientRect();
    park(e.clientX - (rect?.left ?? 0) - d.dx, e.clientY - (rect?.top ?? 0) - d.dy);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? NUDGE_FAST : NUDGE;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = by[e.key];
    if (!move || !spot) return;
    e.preventDefault();
    park(spot.left + move[0], spot.top + move[1]);
  };

  const reason = preview.check.ok
    ? null
    : REASON_COPY[preview.check.reason] ?? preview.check.reason;

  return (
    <Paper
      ref={cardRef}
      elevation={8}
      data-testid="preview-card"
      data-manual={manual ? 'true' : undefined}
      data-blocked={rejected.length > 0 ? 'true' : undefined}
      role="group"
      aria-label="Play preview"
      sx={{
        position: 'absolute',
        zIndex: 3,
        px: 1,
        py: 0.5,
        minWidth: 124,
        maxWidth: 260,
        borderRadius: 1.5,
        // A rejected word thickens the border AND recolors it: at a glance,
        // across the board, the card itself is the error state.
        border: rejected.length > 0 ? 2 : 1,
        borderColor: reason ? 'warning.main' : rejected.length > 0 ? 'error.main' : 'divider',
        // Hidden until placed: one frame at a guessed spot reads as a jump.
        visibility: spot ? 'visible' : 'hidden',
        userSelect: 'none',
        // Dim while a tile is in flight so you can see the cell you're
        // dropping onto. NOT animated: a fading card makes the gallery/ux
        // captures nondeterministic (they land mid-transition).
        opacity: faded ? 0.45 : 1,
        // CLICK-THROUGH. The card parks in the empty space beside the play —
        // exactly where your next tile goes — so it must never swallow a tap
        // meant for a cell. Only the grip below opts back into pointer events.
        pointerEvents: 'none',
      }}
      style={{ left: spot?.left ?? 0, top: spot?.top ?? 0 }}
    >
      {reason ? (
        <Typography data-testid="preview-reason" variant="body2" sx={{ fontWeight: 600, py: 0.25 }}>
          {reason}
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 0.75,
              height: HEAD_H,
              borderBottom: 1,
              borderColor: 'divider',
              mb: 0.25,
            }}
          >
            {/* The one interactive part of the card, and only on the scored
                card — a "Must connect to a word" hint is transient, so it
                stays wholly inert rather than blocking a cell tap. */}
            <Box
              data-testid="preview-grip"
              role="button"
              aria-label="Move the play preview"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
              sx={{
                // Deliberately compact (GRIP_PX × the header) and NOT expanded
                // to the usual 44px target: every pixel of it is a board cell
                // the player can't tap. A missed grab costs nothing — it falls
                // through to the board. Logged in the visual checklist.
                width: GRIP_PX,
                alignSelf: 'stretch',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ml: -0.5,
                color: 'text.disabled',
                fontSize: 13,
                lineHeight: 1,
                cursor: 'grab',
                touchAction: 'none',
                pointerEvents: faded || placing ? 'none' : 'auto',
                borderRadius: 0.5,
                '&:hover, &:focus-visible': { color: 'text.secondary', bgcolor: 'action.hover' },
                '&:active': { cursor: 'grabbing' },
              }}
            >
              ⠿
            </Box>
            {/* A total that can't be scored is struck through rather than
                shown as if it were on its way to the score bar. */}
            <Typography
              data-testid="preview-total"
              component="span"
              sx={{
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1,
                ...(rejected.length > 0 && {
                  color: 'text.disabled',
                  textDecoration: 'line-through',
                }),
              }}
            >
              +{preview.total}
            </Typography>
            <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary' }}>
              {words.length === 1 ? '1 word' : `${words.length} words`}
            </Typography>
          </Box>
          <Box role="list">
            {words.map((w, i) => (
            <Box
              key={`${w.word}-${i}`}
              data-testid="preview-word"
              data-valid={w.valid ? 'true' : 'false'}
              role="listitem"
              aria-label={`${w.word}, ${w.score} points, ${w.valid ? 'valid' : 'not in dictionary'}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                height: ROW_H,
                px: 0.25,
                borderRadius: 0.5,
                // The bad row is FILLED, not merely annotated — with three
                // words stacked, "which one is wrong" has to be answerable
                // without reading the marks.
                ...(!w.valid && {
                  bgcolor: (t) => alpha(t.palette.error.main, 0.16),
                  color: 'error.main',
                }),
              }}
            >
              <Typography
                component="span"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'inherit',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {w.word}
              </Typography>
              <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: 'inherit' }}>
                {w.score}
              </Typography>
              <Box
                component="span"
                aria-hidden
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  lineHeight: 1,
                  fontWeight: 800,
                  ...(w.valid
                    ? { fontSize: 13, color: 'success.main' }
                    : {
                        fontSize: 11,
                        borderRadius: '50%',
                        bgcolor: 'error.main',
                        color: 'error.contrastText',
                      }),
                }}
              >
                {w.valid ? '✓' : '✗'}
              </Box>
            </Box>
            ))}
          </Box>
          {preview.bingo && (
            <Box
              data-testid="preview-bingo"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, height: ROW_H, px: 0.25 }}
            >
              <Typography
                component="span"
                sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'secondary.main' }}
              >
                ★ Bingo
              </Typography>
              <Typography
                component="span"
                sx={{ fontSize: 13, fontWeight: 700, color: 'secondary.main' }}
              >
                +{bingoBonus}
              </Typography>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}
