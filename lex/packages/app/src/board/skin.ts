// Tile/board skin — CSS variables from day one (DESIGN §3.4, §7.5): rules and
// components never see colors directly, only `--lex-*` vars. v1 default is the
// `classic` cream skin; walnut / high-contrast land with Settings in T6.1 by
// adding entries here.
import type { ThemeMode } from '../theme';

export type TileSkinId = 'classic';

/** Everything a skin may vary. Values are CSS color/length strings. */
export interface SkinVars {
  '--lex-cell': string; // cell edge length (the one layout knob)
  '--lex-board-bg': string;
  '--lex-cell-bg': string;
  '--lex-cell-line': string;
  '--lex-cell-fg': string; // premium label / star ink
  '--lex-cell-dl': string;
  '--lex-cell-tl': string;
  '--lex-cell-dw': string;
  '--lex-cell-tw': string;
  '--lex-premium-fg': string;
  '--lex-tile-bg': string;
  '--lex-tile-fg': string;
  '--lex-tile-edge': string;
  '--lex-tile-blank-ring': string;
  '--lex-tile-pending-edge': string; // gold edge on staged tiles (DESIGN §7.2)
}

/** Native cell edge in px — the single geometry constant hit-testing shares
 * with the CSS (`--lex-cell`). The viewport scales everything else. */
export const CELL_PX = 36;
/** Board padding in px around the grid (must match BoardGrid's `p`). */
export const BOARD_PAD_PX = 2;

const CELL = `${CELL_PX}px`;

export const TILE_SKINS: Readonly<Record<TileSkinId, Readonly<Record<ThemeMode, SkinVars>>>> = {
  classic: {
    light: {
      '--lex-cell': CELL,
      '--lex-board-bg': '#cfc6b3',
      '--lex-cell-bg': '#e3dcca',
      '--lex-cell-line': '#cfc6b3',
      '--lex-cell-fg': '#6b6353',
      '--lex-cell-dl': '#aecbe3',
      '--lex-cell-tl': '#4f93c8',
      '--lex-cell-dw': '#f0b6a0',
      '--lex-cell-tw': '#e05f4e',
      '--lex-premium-fg': '#3d3a33',
      '--lex-tile-bg': '#f7ecd0',
      '--lex-tile-fg': '#2f2a20',
      '--lex-tile-edge': '#c9b98c',
      '--lex-tile-blank-ring': '#a58e51',
      '--lex-tile-pending-edge': '#d99b1f',
    },
    dark: {
      '--lex-cell': CELL,
      '--lex-board-bg': '#23211c',
      '--lex-cell-bg': '#33302a',
      '--lex-cell-line': '#23211c',
      '--lex-cell-fg': '#a9a08c',
      '--lex-cell-dl': '#33506b',
      '--lex-cell-tl': '#2c6ea0',
      '--lex-cell-dw': '#7c463a',
      '--lex-cell-tw': '#a63c2e',
      '--lex-premium-fg': '#e8e2d4',
      '--lex-tile-bg': '#e7d9b4',
      '--lex-tile-fg': '#2f2a20',
      '--lex-tile-edge': '#b3a077',
      '--lex-tile-blank-ring': '#8e7a48',
      '--lex-tile-pending-edge': '#f0b234',
    },
  },
};

export function skinVars(mode: ThemeMode, skin: TileSkinId = 'classic'): SkinVars {
  return TILE_SKINS[skin][mode];
}
