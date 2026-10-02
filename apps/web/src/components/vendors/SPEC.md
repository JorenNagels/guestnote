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
  *(Amended 2026-10-02, spec 0009 C4: Archive no longer asks. It archives at once, closes the
  sheet, and a toast says "“{name}” gearchiveerd" with **Ongedaan maken** for 8 seconds;
  `restoreDirectoryVendor` clears `deleted_at`, owner and admin only, like the archive.)*
- A user with no standing in the org gets a 404, not a 403.

**Wedding, `/weddings/[id]/vendors`** (`app.weddingVendors(id)`)
- One row per linked vendor: name, category, contact, status, notes. Status is a select in the row; a
  change saves at once. The row's Edit opens a side sheet with status, notes and Remove.
- "Add from directory": pick a vendor that is not yet on this wedding, press Add. Status starts at
  `considering`.
- "New vendor" (owner and admin only): creates a directory vendor and links it in one step.
- Remove unlinks (soft delete on the link). The vendor stays in the directory and can be re-added.
  *(Amended 2026-10-02, spec 0009 C4: Remove no longer asks. It unlinks at once, closes the sheet,
  and a toast says "“{name}” van de bruiloft gehaald" with **Ongedaan maken**;
  `restoreVendorToWedding` puts the row back with its status, notes, budget lines, shares and any
  vendor link that has not expired or been revoked since. If the vendor was added to the wedding
  again in between, the undo is refused with "Deze leverancier staat al op deze bruiloft.")*
- Statuses: `considering`, `contacted`, `quoted`, `booked`, `declined`. Words on a pill, never colour alone.
- `editor` and `couple` get a 404: no new table is readable by them (spec 0003).

**Rules that are easy to get wrong**
- Before a link is inserted the action reads the wedding **and** the vendor under `withTenant` and fails
  if either is not found. FKs are plain; RLS alone does not stop a link to another org's vendor.
- A vendor is on a wedding once. A second Add says so; it does not create a duplicate row.
- Empty text fields are stored as `null`. Name and category are required.
- Payments per vendor (the prototype's last column) were left for S4's join, which never took them.
  Built 2026-09-24: an **Openstaand** column on the wedding list, the sum and count of unpaid payments
  on budget lines that name this vendor link (`getWeddingVendors`, correlated subqueries, lines of
  another wedding and deleted lines excluded). A dash when nothing is open. Formatted in the wedding's
  `locale_default`, as the budget and payments screens do.

**Amended 2026-10-02, spec 0009 A4: email the vendor link.**
- In the sheet's link controls, beside **Link aanmaken**: **"Link mailen naar {name}"**. Enabled when
  the vendor has an email address; otherwise disabled, with the one-line reason as its accessible
  description. Not offered beside a live link: emailing mints a new link, and doing that from a
  screen showing a live one would quietly replace a link the planner may have handed out. Revoke
  first, then email.
- `emailVendorLinkAction(weddingId, wedVendorId)` reads the address itself, from the vendor row the
  caller can see under `withTenant` (`getWeddingVendors`) — the client sends ids only. A vendor with
  no address is refused **before** a link is minted. Then it does exactly what Create does (one
  shared `mintLink`, so "create means replace" and "store the hash only" hold for both) and sends
  the link through the mail seam (`lib/vendor-link-mail.ts` → `sendVendorLink`, template tag
  `vendor-link`, recorded in `mail_deliveries` without the URL) in the wedding's `locale_default`,
  naming the studio and the couple. Owner/admin only, by `createVendorLink`'s own refusal.
- The plain token is still returned once, so Copy works; the sheet then says "Verstuurd naar
  {email}".
- **A failed mail keeps the link.** It exists and the token is on screen, so the sheet says the
  mail did not go and to copy the link and send it by hand. Rejected: revoking it again, which
  leaves the planner with nothing for a failure that is usually the address's — and the previous
  live link would already be gone. The couple invitation made the same choice (spec 0008).
- The mail reuses the invitation template (`StaffInvite`) with its own copy, as the couple
  invitation does; the `From` stays Guestnote's for DMARC (`lib/mailer.ts`), the studio is named
  in the subject, body and footer.

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

`app.vendors.*` in `apps/web/messages/app/vendors.{nl,en,fr}.json`. NL first. The heading reuses `app.shell.nav.vendors`.

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
