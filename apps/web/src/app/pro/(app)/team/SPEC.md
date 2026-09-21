# Slice S6 — Team

**Date:** 2026-09-21 · **Status:** Built, except the two blocked items · **Umbrella:** `docs/specs/0003-planner-app-screens.md`
**Prototype:** `design-system/planner-prototype/Guestnote Planner.dc.html` lines 1369–1427.

The planner sees who is in the organisation, invites a colleague by email, and can take back
an invite that has not been used yet.

## Behaviour

- **Route:** `/team` (`app.team()`), file `page.tsx`. Replaces the F3 `ComingSoon` stub.
- **Who sees what.** `owner` and `admin` get the team list, the invite form and the pending
  list. A `member` has no org-wide principal (`principalForOrg` is `null` for them), so they get
  one short notice and no data. `editor` and `couple` never reach this screen (spec 0003).
- **Team list.** One row per `org_members` row: name (or the email when there is no name),
  email, role, and assigned weddings. Owner and admin show "All weddings"; a member shows the
  weddings they are assigned to.
- **Seat labels are static.** "Seat 1", "Seat 2" ... by row order. No count against a plan, no
  billing, no "x of y" (spec 0003: seats and billing are not built).
- **Invite.** Owner or admin types an email, picks `admin` or `member`, presses Send. The action
  checks membership itself, writes one `invitations` row (`wedding_id` null, token stored only
  as a SHA-256 hash, expires in 7 days) and sends the NL/EN/FR invite email through the mailer
  seam. If the mail fails, the row is removed again and the planner is told; nothing pending is
  left behind that nobody received.
- **Pending list.** Each unaccepted staff invite: email, role, "Sent N days ago · expires in N"
  or "Expired", and a Revoke button. Revoke deletes the row, so the link stops working.
- **Duplicates.** Inviting an email that already has a live pending invite in this org is
  refused with a message. Inviting an address that is already a member is refused too.
- **Language of the email** is the inviter's current UI language (the invitee has no account,
  so no preference exists yet).

## Not built, and why

| What | Why |
|---|---|
| Role change, removal of a member | `packages/db` has no repo for it, and RLS on `org_members` only lets a user write their own row. Needs a schema change first. |
| Resend an invite | Not asked for. Revoke and invite again does the same job. |
| Accepting an invite (`/invite/[token]`) | See **Blocked**. |
| Seat counts, billing | Spec 0003, "Not in scope". |

## Blocked: needs a schema change (`NEEDS-SCHEMA`)

Only F1 and S10 write migrations, so this slice stops at these two edges.

1. **The team list shows only the signed-in user's own row.** `org_members` and `wedding_members`
   have one policy, `own_memberships` (`user_id = app.user_id`). An owner cannot read a colleague's
   row through `withTenant`. The repo query (`listTeam`) is written and correct; it starts
   returning everyone once an org-wide `for select` policy exists for owner/admin
   (`org_id = app.org_id and app.wedding_role in ('owner','admin')`), named in
   `USER_SCOPED_POLICY_EXCEPTIONS` the way `org_read_for_members` is. The same policy is needed
   on `wedding_members` to show a member's assigned weddings.
2. **The invite link cannot be accepted.** `Auth.resolveInvitation` in `packages/core/src/auth/index.ts`
   is still a fixture map (`staff`, `wedding`, `expired`, `accepted`), and no accept function
   exists anywhere. A real one has to read `invitations` by token hash before any principal exists,
   which `tenant_isolation` forbids, and invariant 1 forbids a third unscoped reader. The shape that
   fits is a `SECURITY DEFINER` function, as spec 0003 already chose for `vendor_links`:
   `resolve_invitation(token_hash)` and `accept_invitation(token_hash, user_id)`, the second one
   inserting the `org_members` row and setting `accepted_at` in one statement after checking the
   token, expiry and that the signed-in email matches. Note the gap it closes: today
   `own_memberships` `with check (user_id = app.user_id)` alone would let any signed-in user insert
   themselves into any org they can name, so accept must not be built from `withUser` plus an insert.
   Token format for that function: `token_hash = lower(hex(sha256(token)))`, token is 32 random
   bytes as base64url.

## States

| State | Shows |
|---|---|
| Empty (only you, no invites) | Your row, the invite form, "Geen openstaande uitnodigingen." |
| One / many members | Table rows, seat labels by order |
| Pending invites | Table under the form; expired ones are marked and can still be revoked |
| Loading | Route is a Server Component; the invite button is busy while the action runs |
| Error | Inline message under the form: invalid email, already invited, already a member, mail could not be sent, not allowed |
| Member (not owner/admin) | One notice, no data |

## Copy

Screen keys live in `apps/web/messages/app/s6.{nl,en,fr}.json` under `app.s6`. The invite MAIL copy is
`email.staffInvite` in the three base catalogues, because `lib/mailer.ts` and `lib/invite-mail.ts` read
those without a request (`i18n/catalogue.ts`). NL first. No hard-coded strings.

## Done

- [x] Team list, invite, pending list and revoke work in Chrome against Neon dev (2026-09-21).
- [x] Invite email renders in NL, EN, FR; the link is `app.<domain>/invite/<token>`.
- [x] Unit tests for the actions, token and mail copy; component tests for the form and lists;
      `packages/db/test/team.test.ts` (tier 1) for the repo, mutation-checked.
- [ ] `NEEDS-SCHEMA` items above resolved, then the link is accepted end to end as a new user.
      Today the link reaches `/invite/<token>` and shows "this link does not work", because
      `resolveInvitation` is a fixture map.

## Progress

- [x] Read spec, prototype range, patterns, mail seam.
- [x] Found the two schema blockers above.
- [x] This file.
- [x] `packages/db/src/repos/team.ts` (+ one `export *` line in the barrel).
- [x] `packages/email` staff-invite template, `sendStaffInvite`, tests.
- [x] `lib/invite-mail.ts`, `lib/invite-token.ts`, `appInviteUrl`.
- [x] `team/actions.ts` and tests.
- [x] `components/team/*` and tests, `team/page.tsx`.
- [x] Messages NL, EN, FR.
- [x] Typecheck, biome, unit and component tests.
- [x] Browser check: owner (one, many, expired, invalid, duplicate, revoke), member notice, 390px width, NL/EN/FR mail.
