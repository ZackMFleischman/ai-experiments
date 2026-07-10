# Sudoku

Minimalist sudoku, done well. Free on the web, offline-first, no account,
no backend — the first solo title of the minimalist-apps brand
(`MINIMALIST-APPS-STRATEGY.md` at the repo root).

- **Play**: daily puzzle (same for everyone, rolls at local midnight) or a
  fresh game at easy/medium/hard/expert.
- **Engine**: pure TS — seeded generation with a uniqueness guarantee,
  bitmask backtracking solver, singles-only difficulty oracle.
- **Stack**: React + MUI over `@parlor/solo` (session/undo/stats) and
  `@parlor/brand` (family theme + shell); Vite PWA; Cloudflare Pages.

Status: designed and built; deploy pending owner's Cloudflare secrets.
See `CLAUDE.md` to work here, `DESIGN.md` for how it fits together.
