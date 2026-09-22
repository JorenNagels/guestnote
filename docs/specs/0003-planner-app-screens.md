# Spec 0003 — Run a whole wedding in the planner app

**Date:** 2026-09-21 · **Status:** Specified, not built
**Phase:** PH1 + PH2 + PH3 of `research/09-planner-app.md` · **Bar:** a planner runs one real wedding here instead of a spreadsheet.

The planner app today has a sign-in, a wedding list and a stub overview. This spec covers the
screens in the Claude Design prototype (`design-system/planner-prototype/Guestnote Planner.dc.html`):
checklist, budget, vendors, run sheet, files and the rest. They replace the spreadsheet and the
WhatsApp thread.

This is the **umbrella** spec. It holds the shared decisions, the data and the slice list. Each
slice also gets a `SPEC.md` next to its code (see [Where specs live](#where-specs-live)).

## Already settled elsewhere

| Decision | Where |
|---|---|
| Left sidebar, no `--sidebar-*` tokens, cookies `gn_org` `gn_nav` `gn_theme` `gn_density` | `docs/specs/0001` |
| Hrefs come only from `lib/routes.ts` | `docs/specs/0001` |
| Out of scope or missing wedding is a 404, never a 403 | `weddings/[id]/page.tsx` |
| Tasks are `shared` or `internal`; comments inherit it by trigger | `0001_rls.sql`, `schema/tasks.ts` |
| Roles: `owner\|admin\|member` and `couple\|editor` | `schema/orgs.ts`, `schema/weddings.ts` |
| NL first, then EN and FR. The message test fails on drift | `PRODUCT.md`, `i18n/messages.test.ts` |
| Every tenant table: `force row level security` plus a policy on its tenant key | `CLAUDE.md` invariant 2 |
| Every query goes through `withTenant` or `withUser` | `CLAUDE.md` invariant 1 |
| Migrations from `0006`, `drizzle-kit generate` to write, never `db:migrate` to apply | `CLAUDE.md` invariant 8 |
| Ids are `newId()` UUIDv7 | `CLAUDE.md` invariant 9 |
| Money is integer cents | `research/09-planner-app.md` |
| Moodboard is a native image board; Pinterest import is later | `research/09-planner-app.md` P21 |
| No contracts, invoicing or lead CRM | `research/09-planner-app.md` |

## Decisions taken here

**Build in waves, all screens.** One plan, approved once. Wave 0 lays the shared base, then
slices run in parallel. Rejected: everything flat at once (biggest merge risk), and a
tasks-only first plan (the user wants all screens).

**Vendors get a signed link, not an account.** No `vendor` role. Rejected: a `vendor`
`wedding_members` role — a bigger tenancy change and the schema defers it on purpose.

**A signed link resolves through a new `link` principal.** A SQL `SECURITY DEFINER` function
turns a valid token into `(org_id, wedding_id, vendor_id)`. The page then runs `withTenant` as
a `link` principal, and RLS lets it see only that vendor's rows. Rejected: a third unscoped
reader — invariant 1 says stop there. Cost: a new `Principal` variant and a policy set that a
`tenancy-auditor` pass must clear. Built last, gated.

**The couple portal and the couple-visibility toggles are a separate spec.** A couple has no
org, so they need a new read path and invite sending. Until then **no new table is readable by
a `couple` principal.** Every new policy excludes `app.wedding_role = 'couple'`.

**Files use a new storage seam.** `packages/storage/src/s3.ts` is the only S3 contact, with
presigned PUT and GET. It is banned elsewhere in `biome.json` and `no-unsafe-imports.test.ts`.
The bucket goes in `sst.config.ts`. Moodboard reuses the `files` table. Rejected: metadata
only (defers the real work) and deferring both screens.

**Wedding colour is a hex stored per wedding.** `weddings.color` is `text`, nullable, checked
`^#[0-9A-F]{6}$`. The server upper-cases it. The UI shows a row of preset swatches plus a colour
picker; both send a plain `#RRGGBB`. Colour is a dot or a stripe only, **never text and never a
background behind text**, so no contrast rule applies to an arbitrary hex. `tokens.css` stays
untouched. Rejected: six named keys and new tokens.

**Multi-date weddings use a `wedding_events` table.** One row per event. Run sheet items hang
off an event. `weddings.wedding_date` stays as the main date that task offsets resolve
against, so tasks do not change. Rejected: jsonb (no FK from run sheet items) and one date only.

**Only three text-and-number columns are added to `weddings`:** `venue`, `headcount`, `notes`,
all nullable. The status stays `draft|live|archived`; the prototype's "Booked" is dropped.

**Sidebar shows T‑minus per wedding, no unread count.** T‑minus is computed from
`wedding_date`. Unread needs a read-state table and one transaction per wedding for a `member`
(the reason spec 0001 refused a badge). Rejected for now, not forever.

**Vendors are an org directory plus a per-wedding link.** `vendors` is per org and reused;
`wedding_vendors` holds status and notes per wedding.

**Templates are copied on apply.** Editing a template never touches a wedding that used it.
Rejected: a live link (needs diff and conflict UX).

**Budget and payments are two tables.** `budget_lines` and `payments`, integer cents, EUR only.

**Team invites send email.** Owner or admin writes `invitations` and sends through the mailer
seam. Seat counts and billing are not built; the Team screen shows static seat labels.

**Team read and invite acceptance are migration `0007` (F1b, 2026-09-21).** S6 stopped on two
`NEEDS-SCHEMA` gaps and F1b closed them: a `for select` policy `org_staff_read` on `org_members` and
`wedding_members` (owner and admin read every membership of their org), and the `SECURITY DEFINER`
functions `resolve_invitation(token_hash)` and `accept_invitation(token_hash, user_id)`, wired into
`Auth.resolveInvitation` / `Auth.acceptInvitation` and `/invite/[token]`. Revoke stays a delete, so a
revoked token resolves as unknown. Role change and removal of a member are still not built: writes
on both membership tables stay on `own_memberships`. S10's migration is therefore `0008`.

## Where specs live

- **This file** in `docs/specs/`: shared decisions, data, slice list.
- **`SPEC.md` next to each slice's code**, written by the slice agent **before** any code. It
  holds Behaviour, States, Copy (NL first) and Done for that slice, and cites this file.
  Status line as in `docs/specs/README.md`.
- A short `README.md` in each new package says what it owns. `packages/db/README.md` is the model.

A slice `SPEC.md` may not contradict this file. If it needs to, amend this file first.

## Data

All new tables follow invariant 2. Ids are `newId()`. Every row has `org_id`; wedding-level
rows also have `wedding_id`. One migration set, `0006`, owned by one agent.

| Table | Scope | Columns beyond ids and timestamps |
|---|---|---|
| `weddings` (alter) | org + wedding | `venue`, `headcount`, `notes`, `color` (all nullable) |
| `wedding_events` | wedding | `label`, `starts_on` date, `starts_at` time null, `venue` null, `position` |
| `task_templates` | org | `name`, `description` null |
| `template_items` | org | `template_id`, `title`, `due_offset_days`, `visibility`, `assignee_role`, `position` |
| `budget_lines` | wedding | `category`, `label`, `estimate_cents`, `actual_cents` null, `wedding_vendor_id` null |
| `payments` | wedding | `budget_line_id`, `due_on`, `amount_cents`, `paid_at` null |
| `vendors` | org | `name`, `category`, `email` null, `phone` null, `notes` null |
| `wedding_vendors` | wedding | `vendor_id`, `status`, `notes` null |
| `run_sheet_items` | wedding | `event_id`, `starts_at` time, `duration_min`, `title`, `place` null, `wedding_vendor_id` null, `position` |
| `files` | wedding | `kind` (`file\|image`), `name`, `storage_key`, `size_bytes`, `mime`, `visibility`, `uploaded_by` |
| `vendor_links` | wedding | `wedding_vendor_id`, `token_hash`, `expires_at`, `revoked_at` null |

`vendor_links` is written by owner or admin only. Its lookup function is the one place a token
is read; it is covered by `schema-coverage.test.ts` and an isolation case.

## Permissions

| | owner | admin | member | editor | couple |
|---|---|---|---|---|---|
| Read and write every planner-app screen | yes | yes | assigned weddings only | no | no |
| Manage vendors, templates | yes | yes | read | no | no |
| Send team invites, create signed links | yes | yes | no | no | no |

`editor` and `couple` reach none of these screens in this build. That is deliberate and holds
until the couple spec lands.

## Slices

Every slice writes its `SPEC.md`, its tests and its own repo file, and proves its work in the
browser before it reports done. Waves are the order; slices in one wave run in parallel.

| Wave | Slice | Screens | Needs |
|---|---|---|---|
| 0 | **F1 Data** | migrations `0006`, schema buckets, RLS, isolation tests, empty repo files and barrel, dev seed with sample data and a `member` user, `packages/db/scripts/local-db.sh` | none |
| 0 | **F2 UI kit** | `packages/ui`: Table, Pill, Tabs, Badge, Card, Sheet, ColorPicker | none |
| 0 | **F3 Shell** | sidebar row per wedding with T‑minus, nav items, `lib/routes.ts`, i18n scaffold | none |
| 0 | **F4 Storage** | `packages/storage`, bucket in `sst.config.ts`, lint bans | none |
| 1 | **S1 Weddings** | overview, new wedding, settings, events, colour | F1 F2 F3 |
| 1 | **S2 Tasks** | checklist, task detail, comments, tasks repo | F1 F2 F3 |
| 1 | **S3 Vendors** | vendor directory, per-wedding vendors | F1 F2 F3 |
| 1 | **S4 Money** | budget, payments | F1 F2 F3 |
| 1 | **S5 Files** | files, moodboard | F1 F2 F3 F4 |
| 1 | **S6 Team** | team list, invite send | F1 F2 F3 |
| 2 | **S7 Templates** | template list and editor, apply to wedding | S2 |
| 2 | **S8 Today** | `/` cross-wedding list; the redirect goes | S1 S2 |
| 2 | **S9 Run sheet** | run sheet, desktop and phone | S1 S3 |
| 2 | **S10 Vendor link** | signed-link slice, `link` principal | S2 S3 S9, tenancy audit |

Wave 2 may start a slice as soon as its own dependencies are done, not the whole of Wave 1.

## Shared rules for every slice

- Read this file, the slice's `SPEC.md` and the relevant package README. Nothing else by default.
- Reuse `packages/ui` before writing markup. A pattern used twice moves into `packages/ui`.
- One repo file per slice in `packages/db/src/repos/`; one `actions.ts` per route folder.
- Each action checks membership itself. A Server Function is a POST to its own route.
- Foreign keys between new tables are plain, not composite (measured in the F1 audit, 2026-09-21).
  So before inserting a child row that names a parent (`payments.budget_line_id`,
  `budget_lines.wedding_vendor_id`, `run_sheet_items.event_id`, `wedding_vendors.vendor_id`), the action
  reads the parent under `withTenant` and fails if it is not found. RLS alone does not stop a row
  pointing at another wedding's parent.
- Strings live in `apps/web/messages/app/<slice>.{nl,en,fr}.json`, merged under `app.<slice>`
  by `i18n/request.ts` (F3). One file set per slice, so slices never edit the same JSON. No hard-coded copy.
- Comments say why, in `--` style, and only where the reason is not obvious.
- Hold at `[data-density="compact"]`. Run sheet also holds at 390px.

## Not in scope

| Not building now | Why, or which phase |
|---|---|
| Couple portal and couple-visibility toggles | own spec; needs a couple read path and invite sending |
| Unread counts on the sidebar | cost for `member`; needs a measurement first |
| Assignment and digest emails (P10) | templates, schedule and unsubscribe are their own job |
| Run sheet print, PDF, CSV (P19) | not chosen for this build |
| Seat counts and billing | pricing is undecided |
| Pinterest import | later add-on to the moodboard |
| Per-org or per-wedding theming beyond the colour dot | parked in `design-system/` |
| Contracts, e-sign, invoicing, lead CRM | `research/09-planner-app.md` |

## Done means

- [ ] Every slice has a `SPEC.md` that matches what was built.
- [ ] `npm run check` passes.
- [ ] `npm run test:db` passes on both tiers, including a case per new table.
- [ ] Each slice was opened in Chrome at `app.guestnote.localhost:3000` and its states checked
      (empty, one, many, error) with a screenshot recorded in the slice's report.
- [ ] `tenancy-auditor` cleared F1 and S10.
- [ ] `test-critic` cleared each slice's new assertions.
- [ ] NL, EN and FR catalogues match.
- [ ] `doc-steward` finds no doc that now lies. `docs/specs/README.md` names the `SPEC.md` convention.
- [ ] Status set to `Built YYYY-MM-DD` when all slices land.

## Still open

- **Whether `vendor_links` needs an audit row on each read.** Decide in S10's `SPEC.md`.
- **Whether budget totals are computed or stored.** Computed until it is measured slow.
