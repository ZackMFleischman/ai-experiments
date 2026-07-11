// tafl's mark inside the family tile (@parlor/brand/icon-template): the
// four corner refuges and the king holding the center — the whole game in
// one glyph. Shared by the PWA icon build and any future native build.
import { BRAND_INK } from '@parlor/brand/icon-template';

export const FIELD = '#0b7285'; // tafl teal (theme primary)

export const MARK = `
  <g fill="none" stroke="${BRAND_INK}" stroke-width="2.5">
    <rect x="20" y="20" width="9" height="9" rx="2"/>
    <rect x="71" y="20" width="9" height="9" rx="2"/>
    <rect x="20" y="71" width="9" height="9" rx="2"/>
    <rect x="71" y="71" width="9" height="9" rx="2"/>
  </g>
  <g fill="${BRAND_INK}">
    <rect x="33" y="46" width="8" height="8" rx="2" transform="rotate(45 37 50)"/>
    <rect x="59" y="46" width="8" height="8" rx="2" transform="rotate(45 63 50)"/>
  </g>
  <circle cx="50" cy="50" r="9" fill="${FIELD}"/>
  <circle cx="50" cy="50" r="3.5" fill="#f5f3ee"/>`;
