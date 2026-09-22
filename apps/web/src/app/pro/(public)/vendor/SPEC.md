# S10 Vendor link — the signed link and the `link` principal

**Date:** 2026-09-22 · **Status:** Built · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S10

Nothing here contradicts spec 0003. Migration `0008`: a new `link` `Principal`, a `SECURITY
DEFINER` function that turns a token into `(org_id, wedding_id, wedding_vendor_id)`, and
read-only RLS for that principal on exactly the rows a vendor needs.

## Behaviour

**Issuing a link** (owner/admin, from the vendor's edit sheet in `/weddings/[id]/vendors`)
- "Create link" mints a crypto-random 256-bit token, stores only its sha256 hash
  (`vendor_links.token_hash`), and returns the plain token **once**. Reloading the sheet
  never shows it again — the UI holds it in memory for the mount only.
- "Create" means "replace": any link already live for this vendor is revoked in the same
  transaction as the insert. At most one live link per vendor at a time.
- Default expiry 30 days (`DEFAULT_VENDOR_LINK_TTL_DAYS`), capped at 180
  (`MAX_VENDOR_LINK_TTL_DAYS`), configurable per issue.
- "Revoke" sets `revoked_at`; the row is never deleted, so "this link was revoked on..." stays
  answerable.

**The public page**, `/vendor/[token]` (`app.vendorLink(token)`, not under `/pro` in the URL —
proxy.ts rewrites the app host's whole path space to `/pro/*` transparently, same as
`/invite/[token]`; the route lives at `pro/(public)/vendor/[token]` in the file tree, in the
unauthenticated `(public)` layout beside `login` and `invite`)
- No session, no cookie, no `getAuth()` call anywhere in the page. The token is the whole
  credential.
- A live token: `resolveVendorLinkByHash` → a `link` `Principal` → `getVendorLinkView` under
  `withTenant`. Shows who shared it (org name), the vendor's own name, the wedding's couple
  names / date / venue / headcount, the vendor's own run-sheet items only (not the wedding's
  whole day), and the planner's freeform note (`wedding_vendors.notes`) if there is one.
- Anything else — unknown, expired, revoked, or a vendor since removed from the wedding — is
  the identical "this link no longer works" screen. `resolve_vendor_link` tells the repo
  which of those it was (for a future admin view); the page deliberately never reads that
  field. Never a 500.

**What is absent by design** (spec 0003, the prototype's own annotation at
`design-system/planner-prototype`, line ~1618)
- Every other run-sheet row, every other vendor, the budget, the payment ledger, the guest
  list. A caterer does not need the florist's slot.
- A dated task list: `tasks` cannot be assigned to a vendor yet (arrives with item P18), so
  "what the planner needs from you" is the one freeform note that exists today, not a list.

## Rules that are easy to get wrong

- `withTenant` leaves `app.org_id` **unset** for a `link` principal, on purpose (see
  `tenant.ts`'s `Principal` doc and `0008_vendor_link.sql` Part 0). That is what keeps this
  principal from ever satisfying a `tenant_isolation` policy that carries no role clause
  (`weddings`, `organizations`) without touching those policies at all. It is not "forgot to
  set the tenant" — setting it would be the leak.
- Rendering an `eventLabel` beside a run-sheet item needs read access to `wedding_events` too
  — that table got a third `link_read` policy (wedding-scoped, not vendor-scoped, since an
  event has no vendor to scope by) after the first working build rendered an empty timeline
  for every link. `budget_lines` gets **no** policy at all: money stays planner-only.
- The parent read: `createVendorLink` reads the `wedding_vendors` row under the caller's own
  `withTenant` transaction before writing, so an owner cannot mint a link for another org's
  vendor id even though the foreign key alone would accept it.
- No `link` principal ever gets a write policy, anywhere. Every `link_read` policy is
  `for select`.

## States

| State | Issuing (sheet) | Public page |
|---|---|---|
| No link yet | "Create link" button | n/a (no token to visit) |
| Just created | token shown once, with copy and expiry | n/a |
| Live | expiry shown, "Revoke" | vendor's identity, timeline, planner note (or nothing if none) |
| Empty timeline | n/a | "Nothing on the schedule for you yet." |
| Revoking | confirm, then "Revoked" | n/a |
| Gone (unknown / expired / revoked / vendor removed) | n/a | "This link no longer works" |
| Error (issue/revoke) | inline error, nothing lost | n/a |

## Copy

`app.s10.*` in `apps/web/messages/app/s10.{nl,en,fr}.json`. NL first. `manageLink.*` is read by
`labels.ts`'s `manageLinkLabels` from a second `getTranslations('app.s10')` call in
`weddings/[id]/vendors/page.tsx`, since `weddingLabels` otherwise reads `app.s3`.

## Done

- [x] Migration `0008`: `link` `Principal`, `resolve_vendor_link`, three `link_read` policies
- [x] `packages/db/src/repos/vendor-links.ts`: create / revoke / resolve / view
- [x] `apps/web/src/lib/vendor-link-token.ts`: token mint + hash
- [x] `createVendorLinkAction` / `revokeVendorLinkAction` in the wedding's `vendors/actions.ts`
- [x] `VendorLinkControls` wired into the vendor edit sheet (`wedding-vendors-view.tsx`)
- [x] `/vendor/[token]` public page, `gone` screen for every non-live outcome
- [x] Message files in three languages
- [x] Tests: db isolation (`planner-isolation.test.ts`), repo + SQL function
      (`vendor-links-repo.test.ts`), actions, token util, the route (component test)
- [x] Browser: issued a real link as owner, opened it with cookies cleared, confirmed scoped
      data only, revoked it, confirmed it then reads as gone; confirmed an unknown token reads
      identically

## Progress

- [x] Read spec 0003, S10's row, F1b's `resolve_invitation` pattern (0007) as the shape to copy
- [x] Migration 0008 (function + three RLS policies), applied to the local container and to
      Neon dev (`DATABASE_URL_UNPOOLED`, as `neondb_owner`) — **not yet applied to Neon
      staging or production**, which is the tenancy-auditor / merge owner's job before deploy
- [x] `tenant.ts`'s `Principal` union, `withTenant`, `assertScoped`; `MembershipPrincipal`
      added so the other three kinds keep typechecking now `link` has fewer common fields
- [x] Repo, token util, actions, UI wiring, public route
- [x] `npm run check` green (typecheck, biome, 1365 unit/component tests)
- [x] `npm run test:db` green on a fresh local container (571 tests, migrations 0000–0008)
- [x] Browser check on `gn-s10.localhost:3124`
- [x] Commit

## Still open, for whoever merges this

- **This is a real access-boundary feature. A `tenancy-auditor` pass is required before
  merge — this branch does not merge itself.**
- Migration 0008 is applied to the local test container and to the Neon **dev** branch used
  by `npm run dev` (needed for the browser check above). It has **not** been applied to
  staging or production Neon; the deploy workflow's migration step must pick it up, or it
  needs applying by hand first — check `/guestnote/staging/MIGRATED_THROUGH` per
  `infra/README.md`.
- Per-read audit logging on `resolve_vendor_link` was decided against (spec 0003's "Still
  open"): `vendor_links.revoked_at` is the control a planner actually has. Revisit only if
  abuse monitoring becomes a real requirement.
