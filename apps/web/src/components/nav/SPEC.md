# F3 Shell — sidebar, routes and message scaffold

**Date:** 2026-09-21 · **Status:** Built 2026-09-21 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row F3

Nothing here contradicts spec 0003. It amends spec 0001's sidebar; the table is in that file
under "2026-09-21, by spec 0003".

## Behaviour

- Sidebar top to bottom: org head, Zoeken, **Vandaag, Bruiloften, Sjablonen, Leveranciers, Team**,
  the heading **Jouw bruiloften**, one row per wedding, **Nieuwe bruiloft**, collapse, account.
- A wedding row: colour dot (neutral when `color` is null), couple name, `T-42 · 3 okt`. The
  countdown is computed in the browser from `wedding_date` as a civil date (UTC midnight), with
  "today" taken from the Brussels calendar day. Archived: the word `Gearchiveerd`, no countdown.
  No date: `Nog geen datum`. Archived rows sort last.
- The row of the wedding you are inside is `aria-current="true"` with a stripe in its colour and
  the eight sections beneath it: Overzicht (exact), Checklist, Budget, Betalingen, Leveranciers,
  Draaiboek, Bestanden, Moodboard (prefix). A wedding that is not in the list gets no sections.
- Colour is a dot or a stripe, never text and never behind text (spec 0003).
- Rail: initials chip per wedding, aria-label on every target. Phone: the same sidebar in the drawer.
- The middle of the sidebar scrolls; collapse and account stay put.
- Every route in `lib/routes.ts` has a `page.tsx`. Unbuilt screens render `ComingSoon`; the owning
  slice replaces the file. `/` is the Today screen as of S8 (it redirected to `/weddings` until then).

## States

Empty (no weddings: only *Nieuwe bruiloft*), one, many (scrolls), no date, archived, past date
(`T+n`), today (`T-0`), no colour, expanded, rail, phone drawer, compact and comfortable density.
No loading state: the list is server-rendered by the layout.

## Copy

`app.shell.*` in `apps/web/messages/app/shell.{nl,en,fr}.json`. Slices s1..s10 have empty files
under the same directory, merged at `app.<slice>` by `i18n/catalogue.ts`. NL first.

## Done

- [x] Routes and stubs: `lib/routes.ts`, 15 stub pages, `lib/routes.test.ts` walks every builder
- [x] `lib/tminus.ts` with tests, `WeddingRow`, `ShellLabels`, layout wiring
- [x] Message scaffold, `messages.test.ts` merges the slice files and checks the file set
- [x] `shell.test.tsx` updated; every new assertion seen to fail under mutation
- [x] Browser: comfortable, compact, rail, phone drawer; no console errors after the `.raw` fix

## Progress

All ticked above. Open: `WeddingSummary` has no `color` until F1; the layout reads it with
`'color' in w` so nothing changes here when it lands. The palette still fetches its own list on
open; it could take the layout's list, which would delete `paletteWeddings`.
