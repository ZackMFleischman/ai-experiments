// @parlor/harness — gallery runtime + validate:visual script core, ported
// from hive's dev/ + e2e visual specs (lex/IMPLEMENTATION.md T3.11). The
// consuming game supplies the registry, theme, and per-capture checks.
// This root export is BROWSER-SAFE; the node-side walker lives at
// '@parlor/harness/walk' so the gallery route never drags node:fs along.

/** Wiring probe. */
export const PARLOR_HARNESS = { workspace: 'parlor', package: 'harness' } as const;

export { Gallery, useStaticMode, type GalleryEntry, type GalleryProps } from './Gallery.js';
