import { useLayoutEffect, useState, type RefObject } from 'react';

// Video tiles are 16:9. If we let a tile be any other shape the video letterboxes and wastes
// space, so the wall keeps every tile at exactly 16:9 and instead solves for the tile SIZE
// that fills the viewport best — the same idea as a video-call "gallery view".
//
// Given the container (W×H) and N tiles (each spanning an s×s block of a base unit cell, so
// blocks stay 16:9 too), we try every plausible base-column count, pack the blocks densely to
// learn how many rows that needs, and size the unit so the packed grid just fits W and H. The
// column count that yields the largest unit — hence the largest videos — wins. On narrow
// screens we drop to a simple scrolling stack instead of shrinking everything to fit.

export interface WallLayout {
  cols: number;
  /** px width/height of one base (1×1) cell. */
  unitW: number;
  unitH: number;
  /** 'fit' = everything sized to fill the viewport; 'stack' = fixed columns, scrolls. */
  mode: 'fit' | 'stack';
}

const GAP = 8; // must match --wall-gap in styles.css
const PAD = 12; // must match .dashboard padding
const AR = 9 / 16; // tile height / width
const STACK_BELOW = 700; // px: narrower than this, stack & scroll instead of fitting
const MIN_UNIT = 96; // px: don't shrink a base cell below this even if it means scrolling

// Densely pack s×s square blocks into `cols` columns (first-fit, mirroring CSS grid
// `auto-flow: dense`) and return the number of rows required.
function packRows(spans: number[], cols: number): number {
  const occ: boolean[][] = [];
  const row = (r: number): boolean[] => {
    while (occ.length <= r) occ.push(new Array(cols).fill(false));
    return occ[r] as boolean[];
  };
  const fits = (r: number, c: number, s: number): boolean => {
    if (c + s > cols) return false;
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) if (row(r + i)[c + j]) return false;
    return true;
  };
  const mark = (r: number, c: number, s: number): void => {
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) row(r + i)[c + j] = true;
  };
  for (const raw of spans) {
    const s = Math.min(raw, cols);
    let placed = false;
    for (let r = 0; !placed && r < 4096; r++) {
      for (let c = 0; c + s <= cols && !placed; c++) {
        if (fits(r, c, s)) {
          mark(r, c, s);
          placed = true;
        }
      }
    }
  }
  return occ.length;
}

function best(spans: number[], W: number, H: number): { cols: number; unitW: number } {
  const maxSpan = spans.reduce((m, s) => Math.max(m, s), 1);
  const totalUnits = spans.reduce((a, s) => a + s * s, 0);
  const maxCols = Math.max(maxSpan, Math.min(totalUnits, 16));
  let bestCols = maxSpan;
  let bestUnit = 0;
  for (let cols = maxSpan; cols <= maxCols; cols++) {
    const rows = packRows(spans, cols);
    if (rows === 0) continue;
    const byW = (W - (cols - 1) * GAP) / cols;
    const byH = (H - (rows - 1) * GAP) / rows / AR;
    const unit = Math.floor(Math.min(byW, byH));
    if (unit > bestUnit) {
      bestUnit = unit;
      bestCols = cols;
    }
  }
  return { cols: bestCols, unitW: Math.max(bestUnit, MIN_UNIT) };
}

export function useWallLayout(ref: RefObject<HTMLElement | null>, spans: number[]): WallLayout {
  const [layout, setLayout] = useState<WallLayout>({ cols: 1, unitW: 320, unitH: 180, mode: 'fit' });
  const key = spans.join(',');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = (): void => {
      const list = key ? key.split(',').map(Number) : [];
      if (list.length === 0) return;
      const W = el.clientWidth - PAD * 2;
      const H = el.clientHeight - PAD * 2;
      if (W <= 0 || H <= 0) return;

      if (W < STACK_BELOW) {
        const cols = W < 520 ? 1 : 2;
        const unitW = Math.floor((W - (cols - 1) * GAP) / cols);
        setLayout({ cols, unitW, unitH: Math.round(unitW * AR), mode: 'stack' });
        return;
      }

      const { cols, unitW } = best(list, W, H);
      setLayout({ cols, unitW, unitH: Math.round(unitW * AR), mode: 'fit' });
    };

    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, [ref, key]);

  return layout;
}
