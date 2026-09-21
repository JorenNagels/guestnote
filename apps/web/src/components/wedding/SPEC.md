# S1 Weddings — overview, new wedding, settings, events, colour

**Date:** 2026-09-21 · **Status:** Built 2026-09-21 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S1

Nothing here contradicts spec 0003. Prototype ranges: overview 626-691, settings 320-447, new
wedding 448-545 of `design-system/planner-prototype/Guestnote Planner.dc.html`.

## Who may do what (read off the existing code, 2026-09-21)

| | owner | admin | member (assigned) | editor / couple |
|---|---|---|---|---|
| Open overview and settings | yes | yes | own weddings only | no (404) |
| Edit a wedding, add / change / remove an event | yes | yes | yes | no |
| **Create** a wedding | yes | yes | **no** | no |

- Create is owner/admin only because `principalForOrg` returns `null` for a `member`, and an
  `assignedStaff` principal is pinned to one wedding id that does not exist yet.
- `weddings`' RLS policy has **no role clause**, so it would let a `couple` or an outside `editor`
  read and write their wedding row. The repo therefore refuses a `weddingMember` principal for the
  detail read and for every write here. The policy on `wedding_events` does exclude them.
- No permission is read from the URL or the cookie. Each action resolves memberships itself.

## Behaviour

- **Wedding route strip** (`wedding-tabs.tsx`, reusable): links, not ARIA tabs, in one row under the
  header: Overzicht, Checklist, Budget, Betalingen, Leveranciers, Draaiboek, Bestanden, Moodboard,
  Instellingen. `current` gets `aria-current="page"`. Later slices render
  `<WeddingTabs weddingId={id} current="budget" />` under their own heading. Labels come from
  `app.shell.nav.*`, so it adds no copy of its own.
- **Header** (`wedding-header.tsx`): colour dot, couple name, date with `T-42`, venue, status pill,
  then the strip.
- **Overview** `/weddings/[id]`: four figures (days to go, open tasks with the late count, done of
  total with a bar, guests), the next events (from today on, five at most), and the internal notes
  when there are any. Task counts read `tasks` where `deleted_at is null`; *late* is an open task
  with `due_at` in the past (a template task with only an offset has no instant yet, so it is not
  counted). The "next five tasks" list of the prototype is **not** built: S2 owns the tasks repo.
- **New wedding** `/weddings/new`: couple, main day, venue, guests, colour, stage (default Concept).
  Owner/admin only; anyone else sees a plain sentence. On success: redirect to the overview. The
  slug is made from the couple name (`marie-en-thomas`), reserved words and names under three
  characters fall back to `bruiloft`, and a taken slug gets a short random suffix.
  The prototype's "Starting plan" block belongs to S7 and is not here. A wedding **may** have no
  date (the schema allows it, and the sidebar has a word for it).
- **Settings** `/weddings/[id]/settings`: the same form for an existing wedding, plus notes (internal),
  and the **Dates** block: one row per event (label, date, time, venue) with Save and Remove, and an
  empty row to add one. The main day is the wedding's own date field, which the checklist counts
  from; events are the extra moments. The prototype's "People" and "Sharing" blocks are the couple
  spec's and are not here.
- **Colour**: `packages/ui` ColorPicker (six presets and a native input) plus "Geen kleur". The form
  posts a plain `#RRGGBB`; the action checks `^#[0-9A-Fa-f]{6}$` and stores upper case. Colour is
  a dot or a stripe only.
- **Status** is `draft | live | archived`, three radios. Archived sinks to the bottom of the sidebar.
- **Remove an event** is a soft delete (`deleted_at`). A run sheet item keeps its `event_id`, so S9
  must list events where `deleted_at is null`. Undoing is a later feature; the row is not gone.
- Saving a wedding revalidates the whole `/pro` layout (the sidebar shows name, date and colour).

## Rules the action enforces

Couple name 1 to 120 characters after trimming. Date empty or a real calendar date `YYYY-MM-DD`.
Venue at most 200, notes at most 5000, both empty means null. Guests empty or a whole number 0 to
100000. Colour empty or a hex. Status one of three. Event label 1 to 120, date required, time empty
or `HH:MM`, venue at most 200. Every event insert reads the parent wedding first (spec 0003: foreign
keys are not composite).

## States

| | Overview | New | Settings |
|---|---|---|---|
| empty | no events, no tasks: hint to add an event, zeros | blank form | no events: one empty add row |
| one | one event | | one event row |
| many | five events, then "+ n more" | | all rows, ordered by date and time |
| loading | server rendered; button shows *Bezig...* while saving | same | same |
| error | field errors under the field; form error above the button; 404 for no access | same, plus the member sentence | same |

Compact density: nothing here sets its own row height; the strip uses `--control-h`.

## Copy

NL first, in `apps/web/messages/app/s1.{nl,en,fr}.json` under `app.s1`. Errors are keys
(`required`, `tooLong`, `invalidDate`, `invalidNumber`, `invalidTime`, `invalidColor`, `forbidden`,
`failed`) that the client maps to sentences, so a Server Function never returns prose.

## Built, and where it differs

- Create is owner/admin only, confirmed in code: `canCreateWedding` (page and action) plus
  `createWedding`'s own `principalForOrg`. A member sees a sentence, not a form.
- The link strip is `wedding-tabs.tsx` (`WeddingTabs`, async, reads labels; `WeddingTabsView`, pure).
  Under it every later slice renders `<WeddingTabs weddingId={id} current="budget" />`, with
  `<WeddingHeader wedding={...} eyebrow?>` above. Uses `next/link`, checked in Chrome: client
  navigation between Overzicht and Instellingen works through the proxy rewrite.
- A malformed wedding id in the URL is a 404 (`isUuid`), not the 500 Postgres' uuid cast gave.
  The F3 pages of other slices that call `getWedding` with the raw id still have that shape.
- "Geen kleur" is a link that appears only once a colour is set; a saved wedding can go back to none.
- Event rows: one form each, so saving one never touches another. The blank row remounts after an
  add; typing into it before the add has finished is lost.
- Not built: the prototype's Sections cards (the strip replaces them), People, Sharing, After the day.

## Done

- [x] Repo functions and `staffPrincipal`, 25 db cases green on local `gn_s1`, including a member, a couple, an outside editor and another org. Two guards mutated and seen to fail.
- [x] Unit and component tests: parse, slug, form-state, tabs, header, both actions, overview page (622 web tests green).
- [x] Typecheck and biome clean; catalogues match (`i18n/messages.test.ts`).
- [x] Chrome (own headless, port 9311): new empty, error, create; overview one / many / no tasks; settings empty / many / add / edit / remove / save; compact; phone width; 404 for unknown and malformed id.

## Progress

All done. Screenshots in the scratchpad `s1/shots/`. Not exercised in a browser: the member sentence
(no member user in the dev seed; covered by `form-state.test.ts` and `new/actions.test.ts`).
