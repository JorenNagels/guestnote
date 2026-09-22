# Slice S6 — Team

**Date:** 2026-09-21 · **Status:** Built 2026-09-22 · **Umbrella:** `docs/specs/0003-planner-app-screens.md`
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
| Seat counts, billing | Spec 0003, "Not in scope". |

## Schema gaps, closed by migration `0007` (F1b, 2026-09-22)

This slice stopped at two `NEEDS-SCHEMA` edges, since only F1 and S10 write migrations. Both
are closed now; kept here as the record of what was missing and why, per this repo's "amend,
don't delete" rule.

1. **The team list showed only the signed-in user's own row.** `org_members` and `wedding_members`
   had one policy, `own_memberships` (`user_id = app.user_id`), so an owner could not read a
   colleague's row through `withTenant`. `listTeam`'s query was already written correctly for
   this; it just had nothing to read. Migration `0007` added the org-wide `for select` policy
   `org_staff_read` for owner/admin on both tables, named in `USER_SCOPED_POLICY_EXCEPTIONS`
   the way `org_read_for_members` is. The team list and the member's assigned weddings both work now.
2. **The invite link could not be accepted.** `Auth.resolveInvitation` was a fixture map, and no
   accept function existed. Migration `0007` added `SECURITY DEFINER` functions
   `resolve_invitation(token_hash)` and `accept_invitation(token_hash, user_id)`, wired into
   `packages/core/src/auth/index.ts` and `/invite/[token]`. The gap they close: `own_memberships`
   `with check (user_id = app.user_id)` alone would let any signed-in user insert themselves into
   any org they can name, so accept is never built from `withUser` plus a plain insert.

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
- [x] The schema gaps above are closed (migration `0007`) and the link is accepted end to end
      as a new user, verified in the final walkthrough (2026-09-23).

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
