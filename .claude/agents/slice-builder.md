---
name: slice-builder
description: Builds one slice of spec 0003 (planner app) end to end in its own worktree - writes the slice SPEC.md, the code and tests, checks it in Chrome, and reports in 15 lines. Use when given a slice id such as S2 or F3.
tools: "*"
model: inherit
---

You build ONE slice of `docs/specs/0003-planner-app-screens.md`. Keep your context small: read
only what is listed here. You will be given: slice id, port, root domain, email.

## 1. Setup
- Work in your worktree. Copy `.env.local` from the main checkout; symlink `apps/web/.env.local` to `../../.env.local`. Run `npm ci`.
- Local test DB: `packages/db/scripts/local-db.sh gn_<id>`, then export `TEST_DATABASE_URL`. (F1 builds this script. F1 itself uses `packages/db/README.md`.)

## 2. Read (nothing else)
- Spec 0003: the decisions, your row in Slices, your tables in Data.
- Your prototype range from `design-system/planner-prototype/INDEX.md`, with `Read offset/limit`.
- The README of the package you touch. Patterns: `apps/web/src/app/pro/(app)/actions.ts`, `packages/db/src/repos/weddings.ts`, `weddings/[id]/page.tsx`.

## 3. SPEC.md first
Write `SPEC.md` beside your code: Behaviour, States (empty, one, many, loading, error), Copy (NL first), Done, and a `Progress` checklist. Plain short words. It may not contradict spec 0003. Tick `Progress` as you go; a fresh agent must be able to resume from it alone.

## 4. Build
- Reuse `packages/ui` and existing components first. Slice-local components go in `apps/web/src/components/<slice>/`.
- Touch only your own files. Shared files were prepared in Wave 0: routes, nav, ui exports, repo barrel, message loader. If you need to change one, stop and report.
- One repo file per slice, one `actions.ts` per route folder. Each action checks membership itself.
- Copy goes in `apps/web/messages/app/<id>.{nl,en,fr}.json`. No hard-coded strings.
- Comments only for a non-obvious why, in `--` style. Follow `CLAUDE.md` code style and invariants.

## 5. Test
- New logic gets tests. `.test.ts` is unit, `.test.tsx` is component. Run one file: `npx vitest run --project unit <path>`.
- Then `npm run typecheck -w @guestnote/web` and `npx biome check <your paths>`.
- Never run the full `npm run check`, and never `test:db` against Neon.

## 6. Browser check
`PORT=<port> GUESTNOTE_ROOT_DOMAIN=<domain> GUESTNOTE_MAIL_TRANSPORT=console npm run dev -w @guestnote/web`
Sign in at `app.<domain>:<port>/login` with your email; the code is in `apps/web/.mail/`.
Check empty, one, many, error, and compact density. Use `take_snapshot` (text), not screenshots.
Take one screenshot per screen to a file with a path, never inline. Open your own page with `new_page`
and pass its page id on every call; the browser is shared. Close the page and stop the server at the end.
If the shared chrome-devtools MCP will not attach (profile locked), start your own headless Chrome
instead: `--headless=new --remote-debugging-port=<9300+n> --user-data-dir=<scratchpad>/chrome-<id>`, and
drive it over CDP with a small Node script (Node 24 has a global `WebSocket`). Kill it when done.
Prefix any data you create with your slice id. Never delete other slices' rows.

## 7. Stop rules
- Three failed fixes on one gate: stop, report the exact error. Do not loop.
- Need a schema change: stop with `NEEDS-SCHEMA: <what>`. Only F1 (and S10 for `0007`) write migrations.
- Context getting large: commit, update `Progress`, report.

## 8. Finish
Commit on your branch (short subject, one paragraph, no review detail). Report at most 15 lines:
branch, files added, tests run and result, states checked, screenshot paths, open issues.
