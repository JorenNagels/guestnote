# S5 Files and Moodboard

**Date:** 2026-09-21 · **Status:** Built 2026-09-21 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S5

Nothing here contradicts spec 0003. Prototype: `planner-prototype` lines 1240-1315. The prototype's
"Couple feedback" rail is not built: no new table is readable by a couple (spec 0003), and the couple
portal is a separate spec.

## Behaviour

**Files** (`/weddings/[id]/files`, `kind = 'file'`)
- A list, newest first: name, then `type · size · uploaded by · date`. An `Alleen intern` pill on
  internal rows. Nothing else is coloured.
- Upload: a button and a drop area, several files at once, at most 3 in flight. An "Alleen intern"
  checkbox beside the button decides the visibility of the files added next (default: shared).
- Per row: download, rename, make internal / make shared, remove (asks once, inline).
- Download mints a fresh 5 minute URL after a `withTenant` read; nothing is signed at render.
- Limits come from `packages/storage`: 25 MiB, PDF/office/text/images, no SVG or HTML. The server
  decides; the client only shows what it said.

**Moodboard** (`/weddings/[id]/moodboard`, `kind = 'image'`)
- A grid of image tiles, newest first. The caption is `files.name`, a new tile's caption is the file
  name without its extension. Click a caption to edit it (Enter saves, Escape cancels).
- Add (button or drop, several at once), remove (asks once), caption. No reactions, no comments.
- Image URLs are signed at render and last 5 minutes. A page left open longer shows broken tiles
  until it is refreshed. Accepted: the alternative is a proxy route that streams every image.

**Upload order** (both screens): Server Function checks membership, validates, signs, creates a row
that is invisible until confirmed -> browser PUTs to the URL -> Server Function confirms -> refresh.
A failed PUT leaves a hidden row and nothing else (`repos/files.ts` says why).

**Dev**: with no `GUESTNOTE_FILES_BUCKET`, development writes to `apps/web/.files/` through a signed
local route (`lib/dev-files.ts`). Anywhere else, unset throws.

## States

Empty, one, many, uploading (per file), upload error (per file, dismissible), row action error,
renaming, confirm-remove, no access (404, never 403), compact and comfortable density, phone width.
Loading: the page is server-rendered; only the actions show a busy state.

## Copy

`app.files.*` in `apps/web/messages/app/files.{nl,en,fr}.json`. NL first. Failures map one to one from
`FileFailure` plus `network` and `uploadFailed`.

## Done

- Files and moodboard screens replace the F3 stubs; every write goes through `lib/wedding-files.ts`.
- `npm run check` pieces for these paths pass; `test:db` tier 1 for `files-repo.test.ts`.
- Browser: empty, one, many, error, compact, phone.
- Bundle impact measured and noted in `packages/storage/README.md`.

## Progress

All done. Notes for whoever touches this next:
- `lib/wedding-files.ts` treats a row whose key `packages/storage` rejects (the dev seed's
  `seed/...` keys) as a placeholder tile or a dead download, not a 500. Measured 2026-09-21.
- Compact density only lowers the row's minimum height; a two-line row is already taller, so
  compact changes nothing visible on this screen. Accepted.
- Bundle: +1,688 KB standalone (+3.0%), in `packages/storage/README.md`.
- Not built, by decision: couple feedback rail, reactions, comments, a proxy that keeps image URLs
  alive past five minutes, deleting objects from the bucket.

- [x] repo, env, storage composition, dev route, tests
- [x] Server Function core, list helpers, route `actions.ts` x2, pages x2
- [x] `components/files/`: upload helper, zone, both screens, labels, tests (mutation-checked)
- [x] messages nl/en/fr
- [x] typecheck, biome, `npm test`, `test:db` tier 1
- [x] browser: many, empty, one, refusals (size, svg, html), rename, visibility, remove, download, phone
- [x] bundle number
- [x] commit
