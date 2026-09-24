# Spec 0004 — Count a task from any day of the wedding, and see your own run-sheet rows

**Date:** 2026-09-24 · **Status:** Built 2026-09-24
Where the build differs from the first draft, the text says so with "(as built)". Migration `0009` is on Neon `dev` only; staging and production get it when this branch reaches `main`.
**Phase:** PH1 P8 + PH2 P14 of `research/09-planner-app.md`, the two prototype gaps spec 0003
left because each needs a column · **Bar:** a planner runs one real wedding here instead of a
spreadsheet.

A multi-day wedding has tasks that belong to a day other than the main one: "the civil papers go
in 14 days before the civil ceremony", not before the party. And on the day, a planner with a
colleague needs to see at a glance which run-sheet rows are hers. The spreadsheet did both by
hand: a formula pointing at another cell, and a highlighter.

Both are drawn in the prototype (`design-system/planner-prototype/Guestnote Planner.dc.html`,
task detail lines 794-838, run sheet line ~1232) and were not built by spec 0003 because
`tasks` has no anchor column and `run_sheet_items` has no owner column.

## Already settled elsewhere

Line numbers in this table are as of `a7e12d9`, the commit before this spec was built; the build
moved several of them.

| Decision | Where it was already made |
|---|---|
| A task's due is an offset in days (negative is before) or a fixed date, never both | `packages/db/src/schema/tasks.ts:44-51`, `TaskDue` in `packages/db/src/repos/tasks.ts:94-101` |
| The shown due date is derived on every read; `due_at` is a copy for the Today index and is never trusted on read | `packages/db/src/repos/task-dates.ts:29-54` |
| Templates store offsets only and are copied on apply | `packages/db/src/schema/templates.ts:46`, `repos/templates.ts:483`, spec 0003 |
| Events are soft-deleted and their rows kept | `packages/db/src/repos/events.ts:168-191` |
| A run-sheet row's only "who" today is its vendor; a row without one reads "Planner" | `schema/events.ts:50-73`, `components/run-sheet/run-sheet-view.tsx:209` |
| Couples read shared tasks, never internal ones, and cannot read `wedding_events` or `run_sheet_items` | `migrations/0001_rls.sql:195-208`, `0006_planner_tables.sql:305-313` |
| A vendor link reads the whole of its own run-sheet rows | `migrations/0008_vendor_link.sql:197-203` |
| Plain foreign keys: every write reads the parent under `withTenant` first | spec 0003, "Shared rules" |

## Decisions taken here

### Reversing spec 0003 on tasks and events

**A task may count from an event instead of the main wedding date.** Spec 0003 said "`weddings.
wedding_date` stays the main date that task offsets resolve against, so tasks do not change". That
was a decision, not a measurement; it is reversed for anchored tasks only. An offset task with no
anchor still counts from `wedding_date`, exactly as today. Spec 0003 gets an amendment note.

### The anchor is a link to the event

**`tasks.anchor_event_id`, nullable, referencing `wedding_events`.** Null means the main wedding
date. Moving the civil ceremony moves every task anchored to it. Rejected: the prototype's
`anchorDay`, a day count from the main date — it does not follow the event when the event moves,
which is the one thing the feature is for.

An anchor is only meaningful with an offset. `TaskDue`'s offset arm grows an optional
`anchorEventId`; a fixed-date task carries none, and the database says so with a check
(`anchor_event_id is null or due_offset_days is not null`).

### Removing an anchored event falls back to the main date

**When an event is removed, its tasks' anchor is cleared and they count from `wedding_date`
again,** in the same transaction as the removal. The task detail then reads "voor de trouwdag".
Rejected: freezing to a fixed date (keeps the date, silently loses the relation) and blocking the
removal (a planner cannot tidy up the dates without first visiting every task).

### `due_at` is recomputed on write

**Saving a wedding's date, an event's date, or removing an event rewrites `due_at` for the tasks
that count from it,** in the same transaction, in the repo — no trigger, which `task-dates.ts`
rejected for `weddings` on purpose. This also fixes the known stale `due_at` after a wedding date
change (the note formerly at `task-dates.ts:49-54` in `a7e12d9`, and the overview's overdue
count that reads it, `getWeddingTaskCounts` in `repos/weddings.ts`). Rejected: a trigger (the schema's stated choice), and accepting the
staleness (it now matters more: the couple reads `due_at`, below).

### Templates stay on the main date

**A template item cannot name an anchor.** Templates are org-wide and have no events. After
applying, a planner re-anchors a task by hand. Rejected: matching by event label (fragile to
typos and to a template used in three languages).

### The couple sees the date, not the anchor

**A couple reading a shared, anchored task gets its date from `due_at`,** which the write path
keeps current. They never learn which event it counts from, because they cannot read
`wedding_events` and this spec does not change that. No couple reader exists yet — the couple
portal is its own spec — so this is a constraint on that spec, recorded here.

### A run-sheet row can have an owner

**`run_sheet_items.owner_user_id`, nullable, referencing `users`, `on delete set null`.** The
staff member responsible for the row. A row can have an owner **and** a vendor: the vendor does
it, the owner answers for it. Rejected: treating every vendor-less "Planner" row as "mine" (what
the prototype's code actually computes) — with two planners on a wedding both would see every
such row as theirs.

**Eligible owners are staff who can see the wedding:** an org owner or admin, or a member
assigned to this wedding. The action checks this before writing. If someone later loses access,
the row keeps their name; nothing re-validates it.

**A `member` may set the owner to themselves or nobody; owners and admins pick any eligible
staff.** Decided in plan review, 2026-09-24: an assigned member runs pinned to one wedding and
RLS lets them read only their own membership rows (`0007`'s `org_staff_read` is owner/admin
only), so they cannot list colleagues or check them. Rejected: widening `org_staff_read` to
members (a new policy, the same OR-widening that leaked org names in `0005`) and a `SECURITY
DEFINER` function listing a wedding's staff (a third door past RLS). An owner already on a row is
never re-checked on save, so a member editing a colleague's row keeps the colleague as owner —
the rule `updateRunSheetItem` already applies to an unchanged vendor.

**New rows start with no owner.** Ownership is a deliberate assignment; defaulting to the creator
would make whoever types up the sheet own all of it.

### Own rows get a soft background — spec 0003's colour rule is amended

**A row owned by the viewer gets a background of `color-mix(in oklab, <wedding colour> 12%,
var(--card))`.** With no wedding colour, `var(--muted)`. This amends spec 0003's rule ("colour is
a dot or a stripe only, never a background behind text") for this one use: at 12% into the card
the background stays within a few percent of the normal card for any hex, in both themes, so the
contrast the rule protected holds without a per-colour check. Rejected: stripe plus a "Jij"
label (keeps the old rule; the user preferred the prototype's look) and a stored "soft" hex per
wedding (another column that drifts from the tokens).

### The vendor link never shows the owner

`link_read` grants the whole row, so a vendor link can technically read `owner_user_id`. It is an
opaque id, the vendor page never selects it, and the migration comment says so. Rejected: a
column-level revoke (grant machinery for an opaque id) and showing the owner's name to the
vendor (not asked for).

## Behaviour

### Task form and detail

- Beside the offset field, a **"Telt vanaf"** select: *Trouwdag* (null) first, then each live
  event of the wedding in date order, as "label · date". Shown only when the due kind is an offset.
  The offset's own labels became "Telt af van een dag" / "Ervoor" / "Erna" (as built): "Voor de
  trouwdag" was wrong the moment another day could be picked.
- The resolved date stays where it was, in the existing preview line ("Valt op …"), now computed
  from the chosen day (as built).
- The detail's due line reads "14 dagen voor Burgerlijk huwelijk" / "3 dagen na Brunch", or
  "voor de trouwdag" when unanchored — the prototype's "Anchor" row.
- A wedding with no events shows the select with *Trouwdag* only, and a hint "Voeg momenten toe
  in de instellingen om vanaf een andere dag te tellen".
- Checklist, Today and the overview show the resolved date exactly as now; they do not name the
  anchor.
- Saving with an anchor that was removed in the meantime: the action fails with "Dat moment
  bestaat niet meer" and keeps the form.

### Event and wedding writes

- Editing an event's date: its anchored tasks move with it, on the next render of any screen.
- Removing an event: its tasks fall back to the main date. **As built:** Remove has no confirm
  step to add the count to, so the count is a note beside Remove on any event with anchored tasks:
  "3 taken tellen vanaf dit moment en gaan bij verwijderen terug naar de hoofddag." One grouped
  query for the page (`anchoredTaskCounts`). The "Momenten" hint now says a task can count from a
  moment too.
- Changing the wedding date: every unanchored offset task's `due_at` is rewritten.

### Run sheet

- The row form gets a **"Verantwoordelijke"** select: *Niemand* first, then eligible staff by name.
- A row owned by the viewer has the soft background, desktop table and 390px phone list alike.
  **As built:** the "who" column shows the vendor and the owner together ("Traiteur A · Katrien"),
  either alone when there is one, and "Planner" when there is neither — replacing the vendor with
  the owner would have hidden who does the job.
- A member editing a row owned by a colleague sees the colleague in the select, by name, so an
  unrelated save keeps them. "Save and next" resets the owner to *Niemand*, like the vendor.
- Printed: the background is dropped (`print:` reset); the owner's name remains, so ownership
  survives black-and-white paper.
- States: no rows owned by anyone looks exactly like today; every row owned by the viewer is a
  fully tinted sheet, which is correct.

## Data

| Table | Column | Type | Null | Why |
|---|---|---|---|---|
| `tasks` | `anchor_event_id` | `uuid` → `wedding_events.id`, `on delete set null` | yes | null is "the main date", the default and what templates produce |
| `tasks` | check `tasks_anchor_needs_offset` | `anchor_event_id is null or due_offset_days is not null` | — | an anchor on a fixed-date task means nothing |
| `run_sheet_items` | `owner_user_id` | `uuid` → `users.id`, `on delete set null` | yes | most rows have no staff owner; a deleted user must not delete the schedule |

Migration `0009`. Both are new columns on tables already classified, so no bucket changes and no
new policy: the existing policies cover the rows. Indexes: `tasks (org_id, anchor_event_id)` for
the recompute on event writes. `drizzle-kit generate`, applied per the `/db-migration` skill.

## Permissions

| | owner | admin | member (assigned) | editor | couple |
|---|---|---|---|---|---|
| Set a task's anchor | yes | yes | yes | no (no task write today) | no |
| Read a task's anchor | yes | yes | yes | reads the id, cannot resolve it | reads the id, cannot resolve it; the portal shows `due_at` |
| Set a row's owner | anyone eligible | anyone eligible | themselves or nobody | no | no |
| Be a row's owner | yes | yes | yes | no | no |
| Read a row's owner | yes | yes | yes | no | no |

Vendor link: reads its rows' `owner_user_id` through `link_read`; never displayed.

## Copy

NL first. As built, under `app.tasks`, `app.runSheet` and `app.weddingPages` (the draft's
`tasks.detail.*` keys became `rule.anchor*`, beside the existing `rule.*` they extend).

| Key | NL | EN | FR |
|---|---|---|---|
| `tasks.form.dueOffset` | Telt af van een dag | Counts from a day | Compte à partir d'un jour |
| `tasks.form.before` / `after` | Ervoor / Erna | Before / After | Avant / Après |
| `tasks.form.offsetHint` | Schuift mee als die dag verschuift. | Moves when that day moves. | Suit ce jour s'il est déplacé. |
| `tasks.form.anchor` | Telt vanaf | Counts from | Compte à partir de |
| `tasks.form.anchorMain` | Trouwdag | Wedding day | Jour du mariage |
| `tasks.form.anchorNoEvents` | Voeg momenten toe in de instellingen om vanaf een andere dag te tellen. | Add moments in settings to count from another day. | Ajoutez des moments dans les réglages pour compter à partir d'un autre jour. |
| `tasks.rule.anchorBefore` | {days, plural, one {# dag voor {anchor}} other {# dagen voor {anchor}}} | … day(s) before {anchor} | … jour(s) avant {anchor} |
| `tasks.rule.anchorAfter` | {days, plural, one {# dag na {anchor}} other {# dagen na {anchor}}} | … day(s) after {anchor} | … jour(s) après {anchor} |
| `tasks.rule.anchorOnDay` | Op {anchor} | On {anchor} | Le jour de {anchor} |
| `tasks.errors.anchorGone` | Dat moment bestaat niet meer. Kies een andere dag. | That moment no longer exists. Pick another day. | Ce moment n'existe plus. Choisissez un autre jour. |
| `runSheet.sheet.owner` | Verantwoordelijke | Responsible | Responsable |
| `runSheet.sheet.ownerNone` | Niemand | Nobody | Personne |
| `runSheet.errors.owner` | Kies iemand van het team dat aan deze bruiloft werkt. | Pick someone from the team working on this wedding. | Choisissez quelqu'un de l'équipe qui travaille sur ce mariage. |
| `weddingPages.events.anchoredOne` / `anchoredOther` | 1 taak telt vanaf dit moment en gaat bij verwijderen terug naar de hoofddag. / {count} taken tellen … | 1 task counts from this event … / {count} tasks count … | 1 tâche compte … / {count} tâches comptent … |

## Not in scope

| Not building now | Why, or which phase it belongs to |
|---|---|
| The couple's view of anchored tasks | The couple portal spec; this spec only guarantees `due_at` is current for it |
| Anchors in templates | Templates have no events; decided above |
| Moving many tasks to another anchor at once | One at a time is enough until a planner asks |
| Showing the owner on the vendor's link page | Not asked for |
| A "only my rows" filter on the run sheet | The tint is the ask |
| Re-validating an owner who lost access | Rare; the name stays until someone changes it |

## Done means

- [x] Migration `0009` applied locally and on Neon `dev`; `schema-coverage.test.ts` still green.
- [x] `TaskDue` offset arm carries `anchorEventId`; `resolveTaskDueDate` and `taskDueColumns`
      resolve against the event's `starts_on`, unit-tested including a removed event.
- [x] Task writes read the anchor event under `withTenant` and refuse one from another wedding or
      a removed one (db test, run as the org-wide owner).
- [x] Event update, event removal and wedding date change rewrite `due_at` in the same transaction
      (db tests, each mutated and seen to fail).
- [x] Run-sheet writes refuse an owner who is not eligible staff (db test: a member not assigned to
      the wedding, a couple, another org's user).
- [x] Task form, detail, run-sheet form and tint, events remove confirmation: component tests.
- [x] Spec 0003 amended: the tasks/events decision and the colour rule, each with a dated note.
      `components/run-sheet/SPEC.md` and `components/tasks/SPEC.md` updated.
- [x] NL, EN and FR catalogues match.
- [x] `npm run check` and `npm run test:db` (both tiers) green; `tenancy-auditor` on the migration
      and the two new parent reads. The audit found no leak; its two low findings (a malformed anchor
      id reaching the uuid cast, a race between anchoring and removing an event) are fixed, and the
      anchor join and recompute now also require the event to be in the task's wedding.
- [x] Opened in Chrome: an anchored task moves when its event moves (21 days before the civil
      ceremony, 9 Jul → 2 Jul when the ceremony moved to 23 Jul); the note beside Remove; own rows
      tinted on desktop, at 390px and in dark mode. The fallback on removal and the untinted print
      view were checked by tests only, not in the browser.

## Still open

- Whether a couple-assigned task should ever be anchorable by the couple themselves — belongs to
  the couple portal spec.
