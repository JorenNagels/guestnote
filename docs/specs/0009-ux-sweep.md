# Spec 0009 — The UX sweep: faster than the spreadsheet, screen by screen

**Date:** 2026-10-02 · **Status:** Specified, not built
**Built so far:** Batch A, 2026-10-02 (4bcefc4, bdd072a, c4279e9)
**Source:** the UX sweep report of 2026-10-02 (artifact "Guestnote UX Sweep"), read against every
app screen, its copy and specs 0003–0008, and compared with Aisle Planner, Timeline Genius, Ever
Timeline, Linear, Asana and Todoist. **Bar:** a planner runs one real wedding here instead of a
spreadsheet.

This spec was not interrogated question by question: the user read the report and said "do
everything". The decisions below are the ones the report implied, settled here so the build does
not settle them silently. Where a choice was made between two reasonable options, the rejected one
is named.

Three batches, each landing as one or more commits of its own. The report's "bigger bets" (paste from Excel, email
digests, guest list) are **not** in this spec; each needs its own `/feature`.

## Batch A — navigation and the run sheet's first day

### A1. One wedding menu (report 01, 13a)

- The sidebar lists weddings only. The open wedding's row keeps its `aria-current` and stripe; the
  eight section rows beneath it are removed, in the rail and the phone drawer too.
  *Rejected:* keeping the sidebar sections and dropping the tabs -- the tabs carry Settings, sit
  next to the content they switch, and leave the sidebar for switching weddings.
- Budget and Payments become one tab, **Geld / Money / Argent**, current on both `/budget` and
  `/payments`. Both routes stay (links and bookmarks keep working). Each of the two pages opens
  with a two-link switch, Budget | Betalingen, `aria-current` on the one you are on. Eight tabs.
- Cmd-K keeps every section as a destination.
  *(as built)* Before this, Cmd-K listed weddings only and no sections. It now lists the open
  wedding's eight sections (Settings is not one; it stays a tab), only when the URL's wedding is
  in the planner's own list, and after the weddings, so Enter with nothing typed still opens the
  first wedding. The sections show while the weddings load; when the weddings arrive the
  highlight returns to the first row.

### A2. The run sheet works from day one (report 02)

- A wedding with a date and no live events: the run sheet's empty state offers one primary button,
  **"Start the run sheet for za 3 okt"**, which creates an event labelled with the localised name
  of the main day (`Trouwdag` / `Wedding day` / `Jour du mariage`, by the wedding's
  `locale_default`) on `wedding_date`, and lands on that day's empty sheet.
- With no wedding date, the empty state is an inline "add a day" form (name, date, optional time)
  instead of a link to Settings.
  *(as built)* The form has no venue field: a day's venue stays in Settings.
- The day tabs end with **"+ Dag toevoegen"**, which opens the same inline form. Settings keeps its
  events editor; both use the existing event action.
- *Rejected:* creating the event automatically on wedding create, plus a backfill migration. The
  main day (`weddings.wedding_date`) and an event are separate facts in the schema: tasks count from
  the main day, and an event copied from it would silently stop matching the first time the date
  moved. One click makes the copy explicit, needs no migration, and writes nothing during a GET.

### A3. Planners print the run sheet (report 04)

- A **Print** button on the planner run sheet (`window.print()`), as the couple portal already has.
- Print layout: no shell, tabs, buttons, warnings or tints; a header line with the couple, the
  day's name and date, and the studio name; one row per item with start, end, what, who (vendor or
  owner) and where; the vendor's phone number beside its name where the wedding vendor has one.
  Black on white.
- *(as built)* Print shows only when the day has items. The printed phone is the vendor's
  directory phone (`vendors.phone`); a wedding vendor has no phone of its own.

### A4. Email the vendor link (report 12)

- In the vendor link controls, beside **Create link**: **"Email the link to {name}"** when the
  vendor has an email address; disabled with a one-line reason when it has none.
- One server action creates the link (replacing any live one, as Create already does) and sends it
  through the mail seam to the vendor's address, in the wedding's locale. The plain token is still
  returned once, so the planner can copy it too. The UI then says "Sent to {email}".
- The mail is rendered with `@react-email/render` and `packages/email/src/layout.tsx` (invariant 11),
  from the studio's name, and recorded like every other delivery.
- *(as built)* The email button shows only beside Create, never beside a live link: emailing mints
  a new link, which would replace one the planner may have handed out. A failed mail keeps the
  link and says so; revoking it again was rejected, because the planner can still copy it.
- *(as built)* The mail reuses the `StaffInvite` template with its own copy and the `vendor-link`
  tag. "From the studio's name" means the studio is named in the subject, body and footer; the
  `From` stays "Guestnote" (DMARC alignment, see `lib/mailer.ts`).

## Batch B — speed

### B1. Quick add and the task panel (report 05, 09)

- The checklist opens with one line: **"Taak toevoegen…"**. Type, press Enter: the task is created
  with the title, the chosen date chip and the defaults of `EMPTY_FORM`, the line clears and keeps
  focus. Chips beneath it: **Geen datum**, **−90 d**, **−30 d**, **−7 d** (days before the main
  day, as an offset), and **Meer opties…**, which opens the full form with the typed title.
- The task detail opens as a side sheet over the checklist, addressed by `?task=<id>` (the filter
  is kept beside it), so Back closes it and the link can be sent. The page
  `/weddings/<id>/tasks/<taskId>` keeps working for links from Today and email.
  *Rejected:* intercepting and parallel routes -- the query parameter is how this screen already
  addresses its filter, and needs no second route tree.

### B2. Shift the rest of the day (report 03)

- In the run-sheet item sheet, when editing: **"Schuif dit en alles erna op"** with chips −15, +5,
  +15, +30 and a custom number of minutes (−720 to 720, not 0). Before saving it lists every item
  that moves, old time crossed out and new time beside it. One button: **"N onderdelen verschuiven"**.
- It moves this item and every item after it **by position** in the same event, in one
  transaction. Times wrap past midnight (the sheet already reads an earlier time after a later one
  as the next day); length and order do not change.

### B3. The budget reads like a sheet (report 10)

- Every category starts open. One control above the table toggles **Alles openklappen / Alles
  dichtklappen**.
- The allocated and spent amounts on a line are edited in place: the amount is a button; it becomes
  an input, Enter or leaving the field saves, Escape cancels, a refused value shows its error under
  the input and keeps the draft. The sheet still edits everything else.

## Batch C — teams and overview

### C1. Assign a task to a person (report 06)

- The task form's owner choice lists the staff who can work on this wedding (the same list the run
  sheet's "Verantwoordelijke" uses) and **Koppel**. The server checks the chosen user is such staff.
- The checklist gets a **Mijn taken** filter: tasks assigned to the signed-in user.

### C2. The overview answers "where are we?" (report 07)

- Three more stats on the wedding overview: **Budget over** (allocated minus spent; "€ x te veel"
  when negative), **Volgende betaling** (date and amount of the earliest unpaid payment, or
  "Niets open"), **Leveranciers geboekt** ("4 / 7": booked over all on the wedding, declined
  excluded).
- Today gets a **Betalingen** section: unpaid payments overdue or due in the next seven days,
  across the weddings the user can see, each linking to that wedding's payments.

### C3. Find a wedding (report 11)

- The weddings list gets a search box (couple name, venue) and four views as links: **Komend**
  (default: not archived, date today or later or no date), **Voorbij**, **Gearchiveerd**, **Alle**,
  with counts. `?view=` and `?q=` in the URL. Komend sorts by date ascending with no date last;
  Voorbij descending.
- *(Amended 2026-10-02, spec 0009 C3, as built)* The search is a GET form and the views are
  links, so both work without JavaScript; `lib/wedding-list.ts` filters and sorts the list
  `listWeddings` already returns. Matching ignores case and accents, word by word. "Today" is the
  Brussels civil date, and a wedding on today is Komend. Gearchiveerd sorts by date descending, no
  date last; Alle is Komend, then Voorbij, then Gearchiveerd, each in its own order. The counts
  follow the search, so they say where the matches are. An unknown `view` is Komend; an empty
  search offers "Zoekopdracht wissen"; an org with no weddings keeps its one sentence, with no
  search box. Venue is searched through `WeddingSummary.venue`, which the repo's `SUMMARY` gained
  for this (it used to be in `WeddingDetail` only); the box says "Koppel of locatie".

### C4. Undo instead of "are you sure" (report 08, 13b)

- Where a delete is soft (`deleted_at`), it happens at once and a toast says what went, with
  **Ongedaan maken** for 8 seconds; undo clears `deleted_at` under `withTenant`. Applies to budget
  lines, files and moodboard images, wedding vendors and archived studio vendors.
- Where a delete is hard (run-sheet items, payments), the confirmation stays.
- The toast is a live region; it does not steal focus; Undo is reachable by keyboard.
- On the moodboard, a caption shows a pencil icon on hover and focus, so "click to edit" is visible.

## Done means

- `npm run check` green after every batch; `npm run test:db` green for any batch touching
  `packages/db`; new assertions seen to fail under mutation.
- NL, EN and FR copy for every new string; NL first.
- Each batch reviewed (correctness, tests, rationale; tenancy where a Server Function or query was
  added) and landed on `main` as one or more commits of its own.
