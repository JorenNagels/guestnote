# S3 Vendors — the directory and the wedding's vendor list

**Date:** 2026-09-21 · **Status:** Built · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S3

Nothing here contradicts spec 0003. Two routes over two tables: the org directory (`vendors`) and the
per-wedding link (`wedding_vendors`).

## Behaviour

**Directory, `/vendors`** (`app.vendors()`)
- One table for the whole org: vendor, category, contact (email, phone), notes hint, Edit.
- A search box filters the rows on name, category, email and phone as you type. No round trip.
- `owner` and `admin` add, edit and archive. `member` reads only: no Add button, no Edit. The
  action refuses a member too; RLS is the third layer.
- Archive is a soft delete (`deleted_at`). A wedding that already uses the vendor keeps showing it.
- A user with no standing in the org gets a 404, not a 403.

**Wedding, `/weddings/[id]/vendors`** (`app.weddingVendors(id)`)
- One row per linked vendor: name, category, contact, status, notes. Status is a select in the row; a
  change saves at once. The row's Edit opens a side sheet with status, notes and Remove.
- "Add from directory": pick a vendor that is not yet on this wedding, press Add. Status starts at
  `considering`.
- "New vendor" (owner and admin only): creates a directory vendor and links it in one step.
- Remove unlinks (soft delete on the link). The vendor stays in the directory and can be re-added.
- Statuses: `considering`, `contacted`, `quoted`, `booked`, `declined`. Words on a pill, never colour alone.
- `editor` and `couple` get a 404: no new table is readable by them (spec 0003).

**Rules that are easy to get wrong**
- Before a link is inserted the action reads the wedding **and** the vendor under `withTenant` and fails
  if either is not found. FKs are plain; RLS alone does not stop a link to another org's vendor.
- A vendor is on a wedding once. A second Add says so; it does not create a duplicate row.
- Empty text fields are stored as `null`. Name and category are required.
- Payments per vendor (the prototype's last column) are S4's join. Not built here.

## States

| State | Directory | Wedding list |
|---|---|---|
| Empty | "Nog geen leveranciers" and, for owner/admin, an Add button | "Nog geen leveranciers op deze bruiloft", the add row still shown |
| One / many | table; search filters | table |
| Nothing to add | n/a | the picker says every vendor is already on this wedding |
| Search finds nothing | "Geen resultaten" | n/a |
| Loading | `loading.tsx` on both routes | same |
| Error | inline message under the form or row; the list stays | same |
| Read-only (`member`) | no Add, no Edit | no "New vendor"; Add from directory still works |
| Compact density | rows follow `--row-h` | same |

## Copy

`app.s3.*` in `apps/web/messages/app/s3.{nl,en,fr}.json`. NL first. The heading reuses `app.shell.nav.vendors`.

## Done

- [x] `packages/db/src/repos/vendors.ts` with access helpers and both tables' operations
- [x] Both `page.tsx`, both `actions.ts`, `loading.tsx`, client components
- [x] Message files in three languages, `messages.test.ts` green
- [x] Tests: repo access logic, input validation, both actions, status list matches the schema
- [x] Browser: empty, one, many, error, read-only member, compact density

## Progress

- [x] Setup, seed, reading
- [x] SPEC.md
- [x] Repo
- [x] Input validation (`lib/vendor-input.ts`)
- [x] Actions
- [x] Components and pages
- [x] Messages
- [x] Tests, typecheck, biome (mutation-checked: member write flag, weddingMember refusal)
- [x] Browser check (empty picker, many, search, add/edit, error, member read-only, 404 on unassigned wedding, compact)
- [x] Commit
