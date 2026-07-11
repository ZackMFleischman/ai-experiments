// checkers's mark inside the family tile (@parlor/brand/icon-template): a
// crowned checker — two stacked discs, the accent piece wearing a smaller
// ink cap — the whole game in one glyph. Shared by the PWA icon build and
// any future native build.
import { BRAND_INK } from '@parlor/brand/icon-template';

export const FIELD = '#7a1f3d'; // checkers wine (theme primary)

export const MARK = `
  <ellipse cx="50" cy="58" rx="24" ry="9" fill="${BRAND_INK}" opacity="0.35"/>
  <ellipse cx="50" cy="54" rx="24" ry="10" fill="${BRAND_INK}"/>
  <rect x="26" y="44" width="48" height="10" fill="${BRAND_INK}"/>
  <ellipse cx="50" cy="44" rx="24" ry="10" fill="#f5f3ee"/>
  <ellipse cx="50" cy="41" rx="14" ry="6" fill="${BRAND_INK}"/>
  <ellipse cx="50" cy="38" rx="14" ry="6" fill="${FIELD}"/>`;
