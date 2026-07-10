// The family icon/splash template (BRAND-IMPLEMENTATION.md 3b): every brand
// app's icons are the same paper tile — an app supplies only its accent and
// its mark (the SVG fragment drawn inside the tile's 100×100 space) — so the
// catalog reads as one family on a home screen while each app stays
// unmistakably itself (the 4.3-spam defense wants per-app identity, not
// per-app chrome). Plain .mjs, no deps: node build scripts (build-icons,
// native asset generators) import it directly; sharp stays app-side.

export const BRAND_PAPER = '#f5f3ee';
export const BRAND_INK = '#2b2b33';
export const BRAND_EDGE = '#c9c4b4';

/** The paper tile bearing the app's mark. Coordinates are the family's
 * 100×100 icon space; the mark draws over the tile (rect 6–94, rx 16). */
export function brandTile(mark) {
  return `
  <rect x="6" y="6" width="88" height="88" rx="16"
    fill="${BRAND_PAPER}" stroke="${BRAND_EDGE}" stroke-width="3"/>
  ${mark}`;
}

/** Standard app icon: the tile alone on a transparent field. */
export function iconSvg(mark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${brandTile(mark)}</svg>`;
}

/** Maskable/adaptive icon: full-bleed accent field, tile shrunk into the 80%
 * safe zone so launcher masks never clip the mark. */
export function maskableIconSvg(mark, field) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${field}"/>
    <g transform="translate(14,14) scale(0.72)">${brandTile(mark)}</g>
  </svg>`;
}

/** Store-icon variant (iOS disallows alpha): the tile on a solid field. */
export function solidIconSvg(mark, field) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${field}"/>
    <g transform="translate(14,14) scale(0.72)">${brandTile(mark)}</g>
  </svg>`;
}

/** Launch screen: the tile small and centered on quiet paper (or the app's
 * dark background) — the moment before first paint, not a poster. */
export function splashSvg(mark, background) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${background}"/>
    <g transform="translate(36,36) scale(0.28)">${brandTile(mark)}</g>
  </svg>`;
}
