// Tile/board skin — CSS variables from day one (DESIGN §3.4, §7.5): rules and
// components never see colors directly, only `--lex-*` vars. Three v1 skins
// (T6.1): `classic` cream, `walnut` wood, `high-contrast` for low vision —
// each with light + dark variants; picked in Settings (board/skinContext).
import type { ThemeMode } from '../theme';

export type TileSkinId = 'classic' | 'walnut' | 'high-contrast';

export const SKIN_IDS: readonly TileSkinId[] = ['classic', 'walnut', 'high-contrast'];

export const SKIN_NAMES: Readonly<Record<TileSkinId, string>> = {
  classic: 'Classic',
  walnut: 'Walnut',
  'high-contrast': 'High contrast',
};

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
  walnut: {
    light: {
      '--lex-cell': CELL,
      '--lex-board-bg': '#5d4230',
      '--lex-cell-bg': '#7a573d',
      '--lex-cell-line': '#5d4230',
      '--lex-cell-fg': '#ead9bd',
      '--lex-cell-dl': '#9db8cc',
      '--lex-cell-tl': '#5b8fb5',
      '--lex-cell-dw': '#cc9068',
      '--lex-cell-tw': '#b1442f',
      '--lex-premium-fg': '#241811',
      '--lex-tile-bg': '#f2e3c2',
      '--lex-tile-fg': '#33261a',
      '--lex-tile-edge': '#c8a878',
      '--lex-tile-blank-ring': '#96733d',
      '--lex-tile-pending-edge': '#ffb52e',
    },
    dark: {
      '--lex-cell': CELL,
      '--lex-board-bg': '#241811',
      '--lex-cell-bg': '#3c2b1d',
      '--lex-cell-line': '#241811',
      '--lex-cell-fg': '#c8b294',
      '--lex-cell-dl': '#3d5a72',
      '--lex-cell-tl': '#2f6d99',
      '--lex-cell-dw': '#7c4230',
      '--lex-cell-tw': '#9c3421',
      '--lex-premium-fg': '#f0e6d4',
      '--lex-tile-bg': '#e5d3ab',
      '--lex-tile-fg': '#33261a',
      '--lex-tile-edge': '#ad9166',
      '--lex-tile-blank-ring': '#83683a',
      '--lex-tile-pending-edge': '#f0b234',
    },
  },
  // Low-vision skin: max text contrast, saturated-but-labeled premiums, hard
  // tile outlines (the DL/TL/DW/TW labels stay the non-color signal).
  'high-contrast': {
    light: {
      '--lex-cell': CELL,
      '--lex-board-bg': '#000000',
      '--lex-cell-bg': '#ffffff',
      '--lex-cell-line': '#000000',
      '--lex-cell-fg': '#000000',
      '--lex-cell-dl': '#a8d1ff',
      '--lex-cell-tl': '#4d94ff',
      '--lex-cell-dw': '#ffb380',
      '--lex-cell-tw': '#ff7043',
      '--lex-premium-fg': '#000000',
      '--lex-tile-bg': '#ffffff',
      '--lex-tile-fg': '#000000',
      '--lex-tile-edge': '#000000',
      '--lex-tile-blank-ring': '#000000',
      '--lex-tile-pending-edge': '#e07b00',
    },
    dark: {
      '--lex-cell': CELL,
      '--lex-board-bg': '#ffffff',
      '--lex-cell-bg': '#000000',
      '--lex-cell-line': '#ffffff',
      '--lex-cell-fg': '#ffffff',
      '--lex-cell-dl': '#1c4f99',
      '--lex-cell-tl': '#3377ff',
      '--lex-cell-dw': '#993016',
      '--lex-cell-tw': '#e63c1e',
      '--lex-premium-fg': '#ffffff',
      '--lex-tile-bg': '#ffe14d',
      '--lex-tile-fg': '#000000',
      '--lex-tile-edge': '#000000',
      '--lex-tile-blank-ring': '#000000',
      '--lex-tile-pending-edge': '#ff9500',
    },
  },
};

export function skinVars(mode: ThemeMode, skin: TileSkinId = 'classic'): SkinVars {
  return TILE_SKINS[skin][mode];
}
