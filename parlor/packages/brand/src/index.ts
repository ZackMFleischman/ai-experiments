// @parlor/brand — the family identity: one theme (per-app accent injected,
// whole palette derived), the shared AppShell chrome, the GameHud play
// header, and the MoreFromUs footer. What makes N minimalist apps read as
// one brand — the components ARE the repo-root DESIGN-PRINCIPLES.md rules.
// React/MUI are peer deps — the consuming app provides them (parlor/CLAUDE.md).

/** Wiring probe — consumed by consumers' cross-workspace import tests. */
export const PARLOR_BRAND = { workspace: 'parlor', package: 'brand' } as const;

export {
  ColorModeContext,
  createBrandTheme,
  useColorMode,
  type BoardPalette,
  type BrandAccent,
  type ColorModeValue,
  type ThemeMode,
} from './theme.js';

export { AppShell, type AppShellProps } from './AppShell.js';

export { GameHud, type GameHudProps, type HudSeat } from './GameHud.js';

export { MoreFromUs, type FamilyApp, type MoreFromUsProps } from './MoreFromUs.js';

// The canonical "More from us" catalog, generated from registry/apps.json by
// registry/gen-family.mjs. Apps import this and filter out their own entry —
// no more hand-kept per-app FAMILY arrays to drift (PORTFOLIO-HARDENING M5).
export { FAMILY } from './family.generated.js';
