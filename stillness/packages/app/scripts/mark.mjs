// Stillness's mark inside the family tile (@parlor/brand/icon-template): a
// quiet ring with a resting dot — the timer face reduced to its essence.
// Shared by the PWA icon build and the native icon/splash build.
import { BRAND_INK } from '@parlor/brand/icon-template';

export const FIELD = '#4e7d5b'; // stillness sage (theme primary)

export const MARK = `
  <circle cx="50" cy="50" r="24" fill="none" stroke="${BRAND_INK}" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="6" fill="${FIELD}"/>`;
