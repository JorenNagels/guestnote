# Slice S2: Tasks

**Date:** 2026-09-21 · **Status:** Built 2026-09-21 · **Parent:** `docs/specs/0003-planner-app-screens.md`

Checklist, task detail and comments for one wedding. Owner, admin and assigned `member` only;
`editor` and `couple` reach none of it (spec 0003, Permissions). Prototype: `Guestnote Planner.dc.html`
lines 692 to 941. Routes: `/weddings/<id>/tasks` and `/weddings/<id>/tasks/<taskId>`.

## Behaviour

- **Checklist** groups open tasks by due bucket, in this order: *Te laat* (before today), *Komende
  14 dagen* (today to +14), *Later* (after +14), *Zonder datum*, then *Afgerond*. Empty buckets are
  not drawn. Within a bucket, earliest date first, then title.
- **Filter** is a row of pills with counts: Alles, Open, Te laat, Intern, Gedeeld. It lives in the
  URL (`?filter=`), so a filtered list can be linked and the back button works. Counts are always
  for the whole wedding, not the filtered view.
- **Complete** is a checkbox on the row and on the detail. It flips `status` between `done` and
  `open` and sets `completed_at`. `in_progress` rows show a "Bezig" pill and complete like any other.
- **New task** opens an inline form above the list (no navigation, so it is as fast as adding a row
  in a spreadsheet). **Edit** on the detail page swaps the same form in place.
- **Form fields:** title (required, 200), notes (optional, 4000), owner (Planner or Couple),
  visibility (Shared with couple or Internal only), due (see below).
- **Due date has two modes**, and only these two:
  - *Counts from a day* (was "Counts from the wedding day" until spec 0004): the planner types a
    number of days and picks before or after. We store `due_offset_days` (negative is before). The
    date is derived from `weddings.wedding_date`, or the anchor event's `starts_on` (spec 0004), in UTC. The form previews the resolved date. With no wedding date the mode still saves, and the
    row says "Geen huwelijksdatum" until one is set.
  - *A fixed date*: stored as `due_at` at 12:00 UTC, `due_offset_days` null. It stays put if the
    wedding moves.
  - We also write `due_at` for offset tasks (12:00 UTC of the resolved day, the seed's convention)
    so the `(org_id, due_at)` index serves S8. **Reads prefer the offset**: `dueDate` on a `TaskRow`
    comes from the offset when there is one. (This said "reads never trust it" until 2026-09-24:
    since spec 0004 an anchored task whose event the reader cannot see falls back to `due_at`.) ~~If S1 changes `wedding_date`, offset tasks stay right
    on screen and their stored `due_at` is stale until next edit.~~ Closed 2026-09-24 by spec 0004:
    every write that moves a date rewrites `due_at` in the same transaction (`refreshTaskDueAt`).
  - **Since 2026-09-24 (spec 0004)** an offset can count from an event instead of the wedding day:
    a "Telt vanaf" select beside the days field, `tasks.anchor_event_id`. The detail's rule names
    it ("14 dagen voor Burgerlijk"); the list, Today and the overview show only the date.
- **Side by side:** the detail page's Due row shows the resolved date and, next to it, the rule
  ("14 dagen voor de trouwdag"). The list shows the date and a relative label ("3 dagen te laat").
- **Internal / shared** toggle changes `visibility`. The database trigger moves the comments with it.
  Internal is said in words as well as a dot ("Alleen intern"), never colour alone.
- **Comments**: a thread under the task, oldest first, author name and UTC date-time. One box to add
  one. A comment inherits the task's visibility by trigger; the form says so on internal tasks.
- **Assignee**: `assignee_role` planner or couple. A planner task created here is assigned to the
  person who created it (`assignee_user_id`), so S8's "assigned to me" finds it. No picker for
  other team members in this slice (needs S6's team read).
- Dates render in UTC (`timeZone: 'UTC'`), like every wedding date in this app.
- A wedding the user cannot see, or a task not in that wedding, is a 404, never a 403.

## States

| State | What shows |
|---|---|
| Empty (no tasks) | Empty card: "Nog geen taken", one button "Nieuwe taak" |
| Filter matches nothing | "Geen taken voor dit filter", link back to Alles |
| One | one bucket with one row |
| Many | all buckets; 200 rows stay usable (compact density uses `--row-h`) |
| Loading | route `loading.tsx` skeleton is not built; the page is one server render |
| Error | action returns a key; the form shows it in an `InlineError` and keeps the input |
| No wedding date | offset tasks fall into *Zonder datum* with "Geen huwelijksdatum" |

## Copy

`apps/web/messages/app/tasks.{nl,en,fr}.json`, merged under `app.tasks`. NL first.

## Done

- [x] Repo `packages/db/src/repos/tasks.ts` with tests (unit for the resolver, db tier 1 for the rest)
- [x] Actions check membership themselves and are tested
- [x] Component tests for the form and the row
- [x] typecheck and biome clean on my paths
- [x] Checked in Chrome: empty, one, many, error, compact density; one screenshot per screen

## Progress

- [x] Spec written
- [x] Repo and barrel line
- [x] Repo tests (12 unit + 24 db tier 1, green against gn_s2)
- [x] Message files
- [x] Pure helpers (buckets, labels, form) and tests
- [x] Actions and tests
- [x] Checklist page and components (typecheck + biome clean)
- [x] Task detail page, edit, comments
- [x] Gate paths clean (typecheck, biome, vitest on my files)
- [x] Browser check and screenshots (headless Chrome over CDP: empty, one, many, overdue, filter-empty, error, offset preview, edit, comments, mobile 390px; compact only eyeballed via `data-density`)
- [x] Commit

## Notes from the build

- Author and assignee names fall back to the user's email when `users.name` is null, so an invited
  planner who never typed a name is not "Onbekend" in a thread.
- A `weddingMember` (couple, outside editor) is refused by every repo function here on purpose;
  the couple's own reader belongs to the couple-portal spec.
- Two-line rows are taller than compact `--row-h` (32px), so compact density only trims padding.
- ~~Open issue: `due_at` on an offset task goes stale if S1 changes `wedding_date`.~~ Closed
  2026-09-24 by spec 0004 (see above).
