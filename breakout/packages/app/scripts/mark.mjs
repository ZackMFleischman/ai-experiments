// Bricks' mark inside the family tile (@parlor/brand/icon-template): a
// short course of bricks, the ball mid-flight, the paddle below. Shared by
// the PWA icon build and the native icon/splash build so the two can never
// drift.
import { BRAND_INK } from '@parlor/brand/icon-template';

export const FIELD = '#d9480f'; // bricks ember (theme primary)

export const MARK = `
  <g fill="${BRAND_INK}">
    <rect x="20" y="22" width="17" height="9" rx="2"/>
    <rect x="41" y="22" width="17" height="9" rx="2"/>
    <rect x="62" y="22" width="17" height="9" rx="2"/>
    <rect x="20" y="35" width="17" height="9" rx="2"/>
    <rect x="62" y="35" width="17" height="9" rx="2"/>
  </g>
  <circle cx="50" cy="58" r="5" fill="${FIELD}"/>
  <rect x="34" y="74" width="32" height="6" rx="3" fill="${FIELD}"/>`;
