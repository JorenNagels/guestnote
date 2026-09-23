# Slice S8: Today

**Date:** 2026-09-21 · **Status:** Built 2026-09-22 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S8

The cross-wedding landing screen at `/` (P16 of `research/09-planner-app.md`). Prototype:
`Guestnote Planner.dc.html` lines 546 to 625. It retires the redirect from `/` to `/weddings` and the
F3 `/today` stub, and gives the sidebar's first item somewhere to point. Spec 0001 withheld this
item "until P16 existed"; its amendments table records that it now does.

## Behaviour

- **Whose tasks.** Open tasks *assigned to the signed-in user*, read with S2's
  `listAssignedTasks`. Owner and admin: every wedding in the org. A `member`: assigned weddings
  only (the repo does one transaction per wedding, in turn). Nothing here decides that; the repo and RLS do.
- **Dates.** Every due date comes from `TaskRow.dueDate`, which S2 resolves from the wedding date
  for an offset task. The stored `due_at` (and its index) is never read: it goes stale when a wedding moves.
  "Today" is the Brussels civil date, read once by `todayCivil()` and passed down.
- **Header.** Title *Vandaag*, the long date, and how many active weddings the user sees.
- **Wedding cards.** One per active (not archived) wedding: colour dot, couple, date, `T-42`, and
  the load ("2 te laat · 5 open"). Load counts the user's own open tasks in that wedding, not the
  wedding's whole checklist: that would cost another read per wedding and would trust `due_at`. Order: on
  or after today by date, then no date, then past weddings that are not archived yet. A card links to the wedding overview.
- **Heeft je vandaag nodig** (*Needs you today*): open tasks due today or earlier, most overdue first.
- **Deze week** (*Due this week*): due tomorrow up to and including today + 7.
- **Hierna** (*Next five*): the next five open dated tasks after that window, soonest first.
- **Rows.** Tick box (S2's `CompleteBox`, so it is the same write and the same optimistic flip), the
  title linking to the task, the wedding name, an "Alleen intern" pill on internal tasks, the date
  with words ("3 dagen te laat"). Ticking a task removes it from the list once the page refreshes.
- Open tasks with no date (including offset tasks on a wedding with no date) are not listed; a
  single line under the lists says how many there are, so they do not vanish without a word.
- A tick that fails shows the row's inline error and the box snaps back.

## States

| State | What shows |
|---|---|
| No organisation | The same standalone message as `/weddings` (the layout renders no shell) |
| No active weddings, can create | Empty card, "Nog geen bruiloften", a *Nieuwe bruiloft* link |
| No active weddings, member | "Je bent nog aan geen bruiloft toegewezen", no link (a member cannot create one) |
| Weddings, nothing due | Cards, and in each list a "Niets ..." text; if all three are empty, one "Je bent bij" line |
| One | One card, one row |
| Many | Cards wrap in a grid; rows use `--row-h`, so compact density shrinks them |
| Loading | None. One server render, like S2 |
| Error | A failed read throws (as `/weddings` does); only the tick box has an inline error |

## Copy

`apps/web/messages/app/today.{nl,en,fr}.json` under `app.today`. The row also reads `app.tasks` (due labels, tick
box, visibility pill) and the cards read `app.shell.countdown`. NL first.

## Routes and shared files

- `(app)/page.tsx` is the screen. `(app)/today/page.tsx` (the F3 stub) is deleted; it never shipped.
- `lib/routes.ts`: `app.today()` returns `/`, same as `home()`. The nav keeps reading `today()`.
- Nav: the Today item is `exact`, or `/` would light up on every page.
- `docs/specs/0001` gets an amendment row; `nav/SPEC.md` and `lib/app-url.ts` no longer say `/` redirects.

## Done

- [x] Pure grouping and ordering with unit tests, checked by mutation
- [x] Row component test
- [x] Page, cards, empty states, messages in three locales
- [x] Routes, nav, nav tests, spec 0001 amendment
- [x] Checked in Chrome as owner and as `member`

## Progress

- [x] Spec written
- [x] Pure helpers and tests
- [x] Row and page
- [x] Messages
- [x] Routes, nav, docs
- [x] Browser check -- owner (7 weddings, S8's stale-offset fixture resolves off the
      wedding date, needs-you/due-week/coming-up windows, tick removes a row on refresh
      and updates the wedding card's load) and `member` (1 assigned wedding only, no
      create link in the empty-state branch). No console errors. Screenshots in the
      agent's scratchpad.
- [x] Commit
