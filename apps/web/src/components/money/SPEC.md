# S4 Money — budget and payments

**Date:** 2026-09-21 · **Status:** Built 2026-09-21 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S4

Nothing here contradicts spec 0003. Prototype range: `design-system/planner-prototype/INDEX.md`, "Budget and payments".

## Behaviour

- Two routes: `/weddings/<id>/budget` and `/weddings/<id>/payments`. Planner-only: owner and admin,
  and a member assigned to the wedding. A couple or editor gets a 404, like a wedding that does not exist.
- **Money is integer cents, EUR only.** Shown with `Intl.NumberFormat` in the wedding's locale
  (`weddings.locale_default`: `nl` gives `nl-BE`, `fr` gives `fr-BE`, `en` gives `en-GB`). Totals are
  computed on every read, never stored (spec 0003, "Still open").
- Typed amounts: `1234,50`, `1.234,50` and `1234.50` all mean 1 234,50 euro. A separator followed by
  exactly one or two digits at the end is the decimal mark; anything else is a thousands mark. Negative,
  empty, or more than 21 474 836,47 euro is refused.
- **Budget.** Three totals: Allocated (sum of estimates), Spent (sum of actuals, a missing actual counts
  as 0), Remaining (allocated minus spent; negative is shown as over, in words and colour).
  Lines group by category. A category row shows its lines' count, a spent bar and a paid bar, allocated
  and spent. Click a category to open its lines. A line is: category, label, estimate, actual (optional),
  vendor (optional). A line whose actual is above its estimate says "over" with the difference.
- Add and edit a line in a side sheet. Delete asks once, in the sheet. Deleting a line hides it, and its
  payments with it (the line is soft-deleted; nothing is destroyed).
- **Vendor picker** lists this wedding's `wedding_vendors` by vendor name. S3 fills them; until then it is
  empty and the field says so. A line stores the `wedding_vendor_id`, and the server reads that row under
  `withTenant` for this wedding before saving (spec 0003, parent-read rule).
- **Payments.** One row per payment: payee (vendor of the line, else the line label), line and category,
  due date, status, amount. Status is **Paid**, **Due** or **Overdue**. Overdue means unpaid and the due
  date is before today's civil date in the wedding's timezone, read from the real clock on each render.
  Overdue rows show the due date in the danger colour and the word "X days overdue".
- Above the schedule: Paid, Outstanding, Past due totals. Sorted by due date, paid ones last.
- Add and edit a payment in a side sheet: line, due date, amount, optional paid-on date. A row has a quick
  "Mark paid" (sets now) and "Mark unpaid". Delete asks once.
- Before saving a payment, the server reads its budget line under `withTenant` for this wedding and fails
  if it is not found. RLS alone does not stop a row pointing at another wedding's parent.
- Every action checks membership itself (a Server Function is a POST to its own route).

## States

| State | Budget | Payments |
|---|---|---|
| Empty | No lines: one card, one button "Eerste regel toevoegen" | No lines: says add a budget line first, links to Budget. Lines but no payments: says so, one button |
| One | One category, one line, totals equal it | One row |
| Many | Several categories, expandable, totals | Several rows, overdue first by date |
| Loading | `loading.tsx` skeleton, `aria-busy` | same |
| Error | `error.tsx` with a retry; a refused save shows an inline error in the sheet and keeps the draft | same |
| Compact density | Rows and cells read `--row-h` and `--cell-x` through the ui Table | same |

## Copy (NL first)

Files: `apps/web/messages/app/money.{nl,en,fr}.json`, under `app.money`. No hard-coded strings.
NL headings: Budget, Betalingen, Toegekend, Uitgegeven, Resterend, Betaalschema, Betaald, Openstaand,
Achterstallig, Regel toevoegen, Betaling toevoegen, Markeer als betaald.

## Done

- [x] Repos `budget.ts` and `payments.ts` filled; the barrel is untouched.
- [x] Unit tests for the money maths, parsing and overdue rule (`lib/money.test.ts`); component tests for the two views.
- [x] Repo isolation cases run against the local tier-1 database (`packages/db/test/money-repos.test.ts`, 16 cases).
- [x] NL, EN, FR message files match (`i18n/messages.test.ts`).
- [x] Both routes opened in Chrome: empty, one line, many, error, compact density, phone width.

## Where the build differs from the plan above

- The app has no `NextIntlClientProvider` above the routes, so each route has a `layout.tsx` that mounts
  `components/money/intl.tsx` with only `app.money`. It is in the layout and not the page so `error.tsx` is inside it.
- The payment buttons' accessible names carry the due date ("Edit payment to X, 26 Jun 2027"): a payee
  with a deposit and a balance otherwise has two identical buttons.
- Paid can be above Spent (a payment on a line with no actual yet), so the Total row can read above 100%.
  Not clamped: it is true, and it tells the planner to fill in the actual.

## Progress

- [x] Read spec, prototype range, repo patterns
- [x] `lib/money.ts` and tests
- [x] `repos/budget.ts`, `repos/payments.ts`, db tests
- [x] Message files
- [x] Budget route: page, actions, view, loading, error
- [x] Payments route: page, actions, view, loading, error
- [x] Typecheck, biome, unit and component tests
- [x] Browser check and screenshots (`scratchpad/s4/shots/`)
- [x] Commit
