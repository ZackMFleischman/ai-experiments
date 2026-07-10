// @parlor/brand — the family identity: one theme (per-app accent injected),
// the shared AppShell chrome, and the MoreFromUs cross-promo panel. What
// makes N minimalist apps read as one brand. React/MUI are peer deps — the
// consuming app provides them (parlor/CLAUDE.md).

/** Wiring probe — consumed by consumers' cross-workspace import tests. */
export const PARLOR_BRAND = { workspace: 'parlor', package: 'brand' } as const;

export {
  ColorModeContext,
  createBrandTheme,
  useColorMode,
  type BrandAccent,
  type ColorModeValue,
  type ThemeMode,
} from './theme.js';

export { AppShell, type AppShellProps } from './AppShell.js';

export { MoreFromUs, type FamilyApp, type MoreFromUsProps } from './MoreFromUs.js';
