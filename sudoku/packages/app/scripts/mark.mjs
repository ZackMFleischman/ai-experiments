// Sudoku's mark inside the family tile (@parlor/brand/icon-template): the
// mini 3×3 grid with one placed indigo digit. Shared by the PWA icon build
// and the native icon/splash build so the two can never drift.
import { BRAND_INK } from '@parlor/brand/icon-template';

export const FIELD = '#3b5bdb'; // sudoku indigo (theme primary)

export const MARK = `
  <g stroke="${BRAND_INK}" stroke-width="2.5" stroke-linecap="round">
    <line x1="38" y1="18" x2="38" y2="82"/>
    <line x1="62" y1="18" x2="62" y2="82"/>
    <line x1="18" y1="38" x2="82" y2="38"/>
    <line x1="18" y1="62" x2="82" y2="62"/>
  </g>
  <text x="50" y="33" font-family="Georgia, 'Times New Roman', serif" font-size="22"
    font-weight="700" fill="${FIELD}" text-anchor="middle">5</text>`;
