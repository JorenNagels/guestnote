# S9 Run sheet

**Date:** 2026-09-21 · **Status:** Built 2026-09-21 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S9

Nothing here contradicts spec 0003. Prototype range: `design-system/planner-prototype/INDEX.md`, "Run sheet".

## Behaviour

- One route: `/weddings/<id>/run-sheet`. Planner-only: owner and admin, and a member assigned to the
  wedding. A couple or editor gets a 404, like a wedding that does not exist.
- **One sheet per event** (spec 0003: multi-date weddings use `wedding_events`). Events are the tabs, as
  links: `?event=<id>`. No `event` param, or one that is not a live event of this wedding, shows the
  first event. One event shows no tab strip, only its name and date.
- **The phone is the same page, not a second mode.** Below `md` a row is a stacked line (time, what,
  who and where), at least 56px tall, and the whole row opens the editor. From `md` it is a table with
  a time, length, what, who and where column, and up and down buttons. It must not scroll sideways at 390px.
- **Times.** An item has a start time (`HH:MM`, no zone) and a length in minutes. The end time is
  computed, never stored. Order is the stored `position`, not the clock, so a sheet that runs past
  midnight works (`schema/events.ts`). Walking the list, a start that is earlier than the one before it
  is read as after midnight, and its time and end are marked `+1`.
- **Warnings** (words and an icon, never colour alone), between rows: an **overlap** when an item starts
  before everything above it has ended (the longest end so far, so a long item that spans the next two
  is caught), and a **gap** when the pause is 30 minutes or more. Shorter pauses say nothing. A warning
  never blocks a save: caterer and photographer really do overlap.
- **Add** in the side sheet. The start time is prefilled with the end of the last item and the length
  with 15, so a run of items is Tab, Tab, type, Enter. New items land where the clock puts them (after
  the last item that starts no later), among the items before the first midnight rollover. An item that
  belongs after midnight is added and then moved down.
- **Edit** in the same sheet. Changing the start time re-places the item by the clock, but only if it is
  before the first midnight rollover; an item after midnight keeps its place. Other edits never move it.
- **Reorder** with up and down buttons. In the table they sit in the row; on a phone they sit at the top
  of the editor, so reading stays uncluttered.
- **Delete** asks once, in the sheet, and removes the row for good (the table has no `deleted_at`).
- **Vendor** ("who owns it") is a picker limited to this wedding's `wedding_vendors` (S3). A row with no
  vendor reads "Planner". The server reads the chosen `wedding_vendors` row and the event under
  `withTenant` for THIS wedding before saving (spec 0003, parent-read rule). A vendor removed from the
  wedding later still shows on the rows that named it, and can be kept when the row is edited.
- Removed events (S1 soft delete) do not show. Their rows are kept, so removing an event stays undoable.
- Every action checks membership itself (a Server Function is a POST to its own route).
- Not built: print, PDF, CSV (spec 0003, "Not in scope"); the prototype's per-person tint (there is no
  owner column beyond the vendor).

## States

| State | Behaviour |
|---|---|
| No events | One card: "no days yet", a link to Settings where events are added. No add button |
| Event, no items | One card and one button "Eerste onderdeel toevoegen" |
| One item | One row, no warnings |
| Many | Rows with overlap and gap notes, a summary line (count, first to last time) |
| Loading | `loading.tsx` skeleton, `aria-busy` |
| Error | `error.tsx` with retry; a refused save shows an inline error in the sheet and keeps the draft |
| Compact density | The table reads `--row-h`; the phone rows stay 56px on purpose (tap size wins over density) |

## Copy (NL first)

Files: `apps/web/messages/app/s9.{nl,en,fr}.json`, under `app.s9`. No hard-coded strings.
NL headings: Draaiboek, Tijd, Duur, Wat gebeurt er, Wie, Waar, Onderdeel toevoegen, Overlap, Leegte.

## Done

- [x] Repo `run-sheet.ts` filled; the barrel is untouched.
- [x] Unit tests: schedule maths and input parsing (`lib/run-sheet.test.ts`), the placement rule
      (`repos/run-sheet.test.ts`); component test for the view.
- [x] Repo isolation cases against the local tier-1 database (`packages/db/test/run-sheet-repo.test.ts`).
- [x] NL, EN, FR message files match (`i18n/messages.test.ts`).
- [x] Opened in Chrome: empty, one, many, error, compact density, and 390px with no horizontal scroll.

## Progress

- [x] SPEC.md
- [x] Repo and repo tests
- [x] `lib/run-sheet.ts` and tests
- [x] Actions, route, view (`components/run-sheet/run-sheet-view.tsx`), sheet
- [x] Messages nl/en/fr
- [x] Typecheck, biome, unit and component tests (mutation-checked: the gap threshold and the
      day-mark guard were each broken and watched fail before being trusted)
- [x] Browser check (`gn-s9.localhost:3123`, headless Chrome over CDP -- the shared
      chrome-devtools MCP profile was locked by a concurrent agent): empty (no events), one event
      no items, many items with gap warnings and a midnight rollover ("+1"), the tab strip, 390px
      phone with no horizontal scroll, the phone edit sheet, and one real add-item round trip
      (written, confirmed in Postgres, then removed so the seed stays clean)
- [x] Commit
