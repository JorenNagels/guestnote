# The planner application — spec

> ## 🔄 DIRECTION CHANGE (2026-08-14)
>
> Guestnote is built **planner-application first**. The wedding-site + RSVP product
> in `04-speclist.md` is not cancelled — it becomes a **feature folded in later**
> (probably before public launch), carrying over what already exists in
> `../se-parti-rsvp`.
>
> This document supersedes the *tiering* of `04-speclist.md`, not its content. Every
> G/C/S/V item there still stands; it now sits in **PH4** below.

## Why this order

`02-strategy-and-verdict.md` already concluded B2B-first, and `04-speclist.md` flags
**V4** — the multi-wedding dashboard — as "the B2B product. Nobody in the Benelux has
one." Building that first is consistent with both, and it inverts the revenue shape:
planners pay **monthly**, couples pay **once**.

The risk, stated plainly: `01-market-and-competitors.md` §3 found the gap is *the
intersection* —

> "the CRM tools don't do guest-facing sites, and the guest-facing site tools don't do
> planner workflows."

A planner app **without** the guest site is a fifth CRM competing with Aisle Planner
(\$39.99–69.99/mo), HoneyBook (\$36–59/mo), Dubsado (\$20–40/mo) and Planning Pod
(\$39–74/mo) — all mature, all funded. So PH4 is not optional; it is what makes the
product defensible. It is a sequencing decision, not a scope cut.

**The competitor to beat in PH0–PH1 is not software. It is Excel and WhatsApp.** That is
what Flemish planners run on today, and it sets the bar: anything slower to use than a
spreadsheet loses.

## Legend

| | |
|---|---|
| **Phases** | **PH0**–**PH4**, the section headings below |
| **Items** | **P1**–**P20**, the rows inside them |
| **Personas** | 🎩 Planner · 👰 Couple · 🏛 Venue · 🤝 Vendor · ⚙️ Ops |
| **Effort** | **S** under a day · **M** one weekend · **L** 2–3 weekends · **XL** a month+ |

> Phases were renamed `P0`–`P4` → **`PH0`–`PH4`** on 2026-08-17. As originally written, `P1` meant
> both "phase 1 — The switch" and "item P1 — Wedding as a first-class record" (which lives in phase
> 0), and `P4` meant both "phase 4 — fold in the wedding site" and "item P4 — Comments on a task".
> Alongside `05-architecture.md`'s `M0`–`M10` and `04-speclist.md`'s `F/G/C/S/V/D` items and `T0`–`T4`
> tiers, you could not write an unambiguous commit message. Items keep `P`; the tier letter `T` was
> not available because `04-speclist.md` still uses it.

---

## PH0 — Foundation

Nothing below works without these. Smaller than `04-speclist.md`'s T0 because no public
site rendering is involved yet.

| ID | Item | Persona | Effort | Notes |
|---|---|---|---|---|
| **P1** | **Wedding as a first-class record** — couple, date, venue, status, headcount estimate | 🎩 | M | Already the plan in `05-architecture.md` §4. The planner app needs it *before* any site rendering does |
| **P2** | Org / roles / wedding-scoped invitations | 🎩👰 | M | The merged `invitations` table in `07-auth-and-tenancy.md` §4b already covers this. **Adds one role: `vendor`** |
| **P3** | **Task engine** — task, assignee, due date, status, visibility, wedding | 🎩👰 | M | The spine of the whole app. See the schema delta below |
| **P4** | Comments on a task | 🎩👰 | S | This is what pulls the "did you book the DJ?" conversation out of WhatsApp |
| **P5** | Cross-tenant isolation tests extended to tasks, budget, vendors | ⚙️ | S | Same shape as **F6**. Highest-value test in the repo |

---

## PH1 — The switch

The bar: **a planner runs one real wedding entirely in Guestnote instead of a spreadsheet.**

| ID | Item | Persona | Effort | Notes |
|---|---|---|---|---|
| **P6** | Shared checklist, each task assigned to planner **or** couple | 🎩👰 | M | The core request. Assignment is the feature — a list nobody owns is just a document |
| **P7** | **Couple portal** — the couple logs in and sees only their own wedding and only shared tasks | 👰 | M | Writes a `wedding_members` row, never `org_members`. This is the boundary that must not leak |
| **P8** | Due dates anchored to the wedding date (T-minus: "6 months before") | 🎩 | S | So a template can be applied to any wedding and the dates compute themselves |
| **P9** | **Checklist templates** — apply a standard plan to a new wedding in one click | 🎩 | M | Do not defer this. A planner running 15 weddings will not hand-build the list 15 times, and it is what makes the tool stickier the longer they use it |
| **P10** | Email on assignment + a weekly "what's due" digest | 🎩👰 | S | SES + react-email, already the plan. Without it the couple never comes back |

---

## PH2 — Daily driver

Where it stops being a to-do list and starts replacing the spreadsheet.

| ID | Item | Persona | Effort | Notes |
|---|---|---|---|---|
| **P11** | **Budget** — categories, estimated vs actual, paid / outstanding | 🎩👰 | L | **Fully shared with the couple.** Decided 2026-08-14: the planner's fee is either outside the budget or simply another line, so there is no margin to hide and no dual-visibility model to build |
| **P12** | Payment schedule — what is due, to whom, when | 🎩👰 | M | The half of budget management Excel does worst |
| **P13** | Vendor directory per wedding — contact, category, amount, contract file | 🎩 | M | |
| **P14** | **Day-of run sheet** — minute by minute, who does what | 🎩🏛🤝 | M | **D8 promoted.** `04-speclist.md` calls this "the gap the strategy identified" |
| **P15** | Files per wedding — contracts, floor plans, quotes | 🎩👰 | M | S3 + signed URLs |

---

## PH3 — Stickiness

| ID | Item | Persona | Effort | Notes |
|---|---|---|---|---|
| **P16** | **"Due this week" across every wedding** | 🎩 | M | **V4 reframed, and the single most valuable screen in the app.** The reason a planner opens it daily rather than weekly. Nobody in the Benelux has this |
| **P17** | Reusable template library the planner builds up | 🎩 | M | **D10 promoted** |
| **P18** | Vendor gets a link to *their slice* of the run sheet | 🤝 | M | Scoped so a vendor sees their own rows, not the budget. Uses the new `vendor` role |
| **P19** | Exports — run sheet PDF, budget CSV | 🎩 | S | Planners live in PDFs when they are on site with no signal |
| **P20** | Team seats — a second planner in the org, assigned per wedding | 🎩 | M | **V12**; `org_members.member` + `wedding_members.editor` already express it |

---

## PH4 — Fold in the wedding site + RSVP

**All of `04-speclist.md` lands here**, essentially unchanged. The order inside it holds
(T0 → T1 → T2); it simply starts after PH3 rather than first.

The join between the two halves is worth designing early even though it is built late:

| Bridge | Why it matters |
|---|---|
| Confirmed headcount → budget | Per-head catering is the biggest line. RSVPs should update the number, not be retyped |
| Dietary aggregation (**D3**) → vendor/caterer | The caterer is already a `vendor` row by then |
| Guest count → run sheet | Timings depend on numbers |

Guests remain outside all of this: no accounts, ever — household tokens only, per
`07-auth-and-tenancy.md` §5.

---

## Deliberately **not** building

Naming these now stops them creeping in later.

| Not building | Why |
|---|---|
| Contracts + e-signature | HoneyBook and Dubsado territory. Large scope, legal surface, and Belgian planners already have tooling |
| Invoicing / accounting | Same. Integrate before rebuilding |
| Lead pipeline / sales CRM | Guestnote starts once a couple is *booked*. Pre-booking is a different product |
| Moodboards / design boards | Aisle Planner does it well; planners use Pinterest anyway. Revisit only if calls demand it |
| A native mobile app | The run sheet needs to work on a phone. That is responsive web, not an app |

---

## Schema and auth deltas

Against `07-auth-and-tenancy.md`, which was written for the RSVP product.

> The authoritative schema is `packages/db/src/schema/*.ts`. The sketches below are the *reasoning*.
> **`org_id` was added to `tasks` and `budget_lines` on 2026-08-17** — they were missing it, which
> contradicted `05-architecture.md` §4's rule that every tenant-scoped table carries **both** keys,
> denormalised so each RLS policy is a single-column check with no joins. A `schema-coverage` test in
> `packages/db` now fails CI if any tenant-scoped table lacks `org_id`, `FORCE ROW LEVEL SECURITY`,
> a policy, or a case in the isolation suite — so this class of omission cannot recur silently.

**a. `wedding_members.role` gains `vendor`.**
Currently `couple | editor`. **P18** needs a third, much narrower role: sees its own run-sheet
rows and its own tasks; never the budget, never the guest list. The `invitations` table
already carries wedding-scoped invites, so only the enum and the permission checks change.

**b. Tasks need visibility, not just an assignee.**

```
tasks   id, org_id, wedding_id, title, notes, assignee_user_id NULL,
        assignee_role,            -- planner | couple | vendor
        due_at, due_offset_days,  -- offset from the wedding date, for templates
        visibility,               -- shared | internal
        status, created_by, completed_at
```

`visibility = internal` is the important column. Planners keep tasks the couple must never
see — chasing a late invoice, checking a margin, "couple is being difficult about the seating".
Retrofitting this after the couple portal ships means leaking those on the day you add it.

> **The column alone is not enough.** A couple's session sets `app.org_id` to the planner's org
> (`07 §3` — it must), so the couple's GUCs and the planner's are *identical* and the RLS policy in
> `05 §4` cannot see the difference. `visibility` would be enforced only in the repository layer,
> with **no backstop**, for exactly the data this section says is most damaging to leak. The fix is a
> third GUC, `app.wedding_role`, set inside `withTenant` from the resolved membership; see the
> correction in `05-architecture.md` §4. It belongs in the same first migration as the column, for
> the same reason.

**c. Budget is shared, with one cheap escape hatch.**

```
budget_lines   id, org_id, wedding_id, category, label, vendor_id NULL,
               estimated_cents, actual_cents, paid_cents, due_at,
               internal BOOLEAN DEFAULT false
```

`internal` is insurance, not a feature — it stays out of the UI until a planner asks for it.
Some planners do take vendor commission; one column now beats a migration later.

**d. The §3 permission table needs a second half.** It is written entirely in RSVP terms
(*Edit content, Publish, Guest list, CSV export*). Proposed:

| | owner | admin | member | couple | vendor |
|---|---|---|---|---|---|
| See all org weddings | ✅ | ✅ | assigned | | |
| Tasks — shared | ✅ | ✅ | assigned | ✅ | own only |
| Tasks — internal | ✅ | ✅ | assigned | ❌ | ❌ |
| Budget | ✅ | ✅ | assigned | ✅ | ❌ |
| Vendors / contracts | ✅ | ✅ | assigned | read | own only |
| Run sheet | ✅ | ✅ | assigned | ✅ | own slice |
| Templates | ✅ | ✅ | read | ❌ | ❌ |

The `withTenant()` trap from §3 applies unchanged, and gets more dangerous: a vendor
principal has no `org_members` row, so **`app.wedding_id` is mandatory** for them too.

---

## What this changes in the build order

Against `05-architecture.md` §9:

- **M1–M3 stand.** Multi-tenant stack, weddings-as-rows and Better Auth are needed either
  way. `F1` (config → database) still applies — it is the same table
- **M4–M7 slide** — template rendering, the site editor and publishing are all PH4 now
- **New, between M3 and M4:** the task engine, couple portal, templates, budget
- **F6 isolation tests grow** to cover tasks, budget and vendors from day one, not later

`se-parti-rsvp` sits idle longer under this plan. That is the real cost of the reordering,
and it is acceptable only because PH4 is committed rather than hypothetical.

## Open

- **Does the couple get a password, or an email code every time?** Better Auth supports both.
  Magic link is lighter for someone who logs in six times a year; a password suits someone
  checking tasks weekly. **Still open**, but the planner side settled on 2026-08-18 as passkey
  primary with a six-digit email code beneath it and no password at all, so the cheap answer is
  the same surface scoped down. Magic link is off the table for both — see
  `07-auth-and-tenancy.md`'s credential note
- **Do vendors get accounts at all, or a signed link like guests?** A signed link is far less
  work and vendors are even more occasional than couples. If so, `vendor` may not need to be a
  `wedding_members` role at all — it could reuse the household-token pattern
- **Pricing.** `02-strategy-and-verdict.md` §4 prices a website product. A planner app billed
  per planner per month is a different model, and the per-wedding pricing may not survive
- **How many professional wedding planners are actually in Flanders?** The market sizing in
  `01-market-and-competitors.md` counts *weddings*, not planners. A planner-seat product is
  capped by the number of planners. **Ask this on the validation calls** — it is the single
  number that decides whether planner-seat pricing or per-wedding pricing is right
