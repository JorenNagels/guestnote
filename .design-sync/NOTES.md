# /design-sync notes — @guestnote/ui

## Repo-specific setup

- **`packages/ui` has no build step at all** (only a `typecheck` script, no `dist/`,
  no root `.` export — only subpath exports per component). The converter runs in
  synth-entry mode (`[NO_DIST]`), reading straight from `src/`. If a build is ever
  added, re-check `cfg.buildCmd`/`--entry` — synth mode gives weaker `.d.ts` contracts
  than a real build.
- **`packages/ui` ships no compiled CSS of its own.** Its components are styled purely
  with Tailwind v4 utility classes against `design-system/tokens.css`; the real app's
  compiled CSS only exists because `apps/web/src/app/globals.css` is the Tailwind entry
  that scans `apps/web/src/**`, and Turbopack's Tailwind integration happens to pick up
  classes from imported module source (`packages/ui`) even though `packages/ui/src` is
  **not** in that file's `@source` list — verified empirically 2026-09-17 by grepping a
  `next build` output chunk for `packages/ui`-only classes (`gn-action`, `brightness-110`)
  and finding them present. This sync does **not** rely on that app build: it compiles
  its own scoped stylesheet via `.design-sync/ui-tailwind-entry.css` (Tailwind CLI,
  staged in `.ds-sync/node_modules/.bin/tailwindcss`), scanning only
  `packages/ui/src/**/*.{ts,tsx}` against `design-system/tokens.css`. Output goes to
  `packages/ui/.ds-compiled.css` (gitignored), which `cfg.cssEntry` points at. Re-run
  `cfg.buildCmd` before every `/design-sync` build — it's not automatic.
- **Fonts**: `design-system/tokens.css`'s `--font-sans`/`--font-mono` reference "Inter
  Variable", "Inter" and "JetBrains Mono", but **no `@font-face` for any of them ships
  anywhere in this repo** — not in `packages/ui`, not in `apps/web` (no `next/font`
  usage found either). This looks like a real gap in the product itself, not just a
  design-sync artifact — flagged to the user 2026-09-17, not yet independently confirmed
  or fixed in `apps/web`. Fetched the latin-subset variable woff2 for both families from
  Google Fonts (SIL Open Font License) into `.design-sync/fonts/` with the user's
  explicit OK, wired via `cfg.extraFonts`. **Re-sync risk**: if `apps/web` later wires
  its own fonts, these become redundant (harmless) but worth reconciling.

## Known render warns

- `LiveRegion` (`CodeSent`, `SignedIn`): `[RENDER_THIN]` — "rendered height is 1px".
  **Correct by design**, not a defect: `LiveRegion` is `sr-only` (visually clipped to
  1px, screen-reader-only), so a visually blank/near-zero-height render is the honest
  output. Confirmed via the individual capture screenshot (DOM text present, just
  clipped). Triaged as benign on 2026-09-17 — do not chase this warn on future re-syncs.

## Re-sync risks

- The Tailwind compile step (`cfg.buildCmd`) is easy to forget before re-running the
  converter — a stale `packages/ui/.ds-compiled.css` would silently ship outdated
  styles. Always re-run it as part of any re-sync.
- `.design-sync/fonts/fonts.css` is a `/design-sync`-only artifact; it does not wire
  fonts into the actual app. If `apps/web` starts loading these fonts itself (e.g. via
  `next/font`), reconcile rather than maintaining two separate copies.
- Only 6 components exist in `packages/ui` today (Button, LinkButton, Field,
  InlineError, LiveRegion, LocaleSwitcher) — all small, all authored with 2-4 stories
  each. As the library grows, re-confirm preview scope with the user rather than
  assuming "author everything" still holds.
