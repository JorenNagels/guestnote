# Auth and tenancy

Decided 2026-08-12. Companion to `05-architecture.md` §4–5, which it supersedes on the auth
decision and extends with the org/role model that document only implied.

**Decision: Better Auth**, self-hosted against the same Neon database. Kept here with the
Clerk numbers that were checked, so the comparison doesn't get re-run every time someone
remembers that `se-parti-rsvp` already uses Clerk.

> ⚠️ **Scope narrowed 2026-08-17: Better Auth for authentication only.**
>
> It owns `users`, `sessions`, `accounts`, `verifications` and the credential plugins
> (magic link as first written; `passkey` + `emailOTP` since 2026-08-18 -- see the next note). **`organizations`,
> `org_members` and the merged `invitations` table (§4b) are hand-rolled in Drizzle** — the
> Organization plugin is not used.
>
> This does not reverse the decision below; all four reasons Better Auth won (one database, every
> permission check as SQL inside the transaction that sets `app.org_id`, EU residency, auth email
> riding the SES + `react-email` + `next-intl` pipeline) are properties of **self-hosting**, not of
> the plugin. Three reasons the plugin is out:
>
> 1. §1 already concedes vendor org features cover only ~30% of the model, and the plugin
>    **cannot express a role scoped below the organization** — so `wedding_members` is custom
>    regardless, which is the layer that actually matters.
> 2. It puts "which org am I acting as" in `session.activeOrganizationId`. That is a second source
>    of truth next to the two membership tables, and §3 is explicit that authorization resolves
>    from those tables and that `app.org_id` "is a data-scoping mechanism, never a permission."
>    The Principal is resolved from the **URL** joined against `org_members` / `wedding_members`,
>    full stop.
> 3. Its schema and `drizzle-kit` would both want to own the same tables, and its default **`text`
>    ids** collide with the `::uuid` casts in §4a. Force `advanced.database.generateId` to uuid
>    before the first migration — otherwise it is a column-type migration across
>    `wedding_members.user_id`, `org_members.user_id`, `audit_log.actor_user_id` and
>    `invitations.invited_by` after real users exist.
>
> Cost: the org switcher and the invite/accept endpoints are hand-written. Roughly a day, and
> `08-design-system.md` already settled the components.

> ⚠️ **Credential changed 2026-08-18: passkey primary, six-digit email code beneath it.
> There is no magic link anywhere, and never a password.**
>
> Every "magic link" below is superseded. The decision that *Better Auth self-hosted* wins is
> untouched — all four reasons in §1 are properties of self-hosting, not of a link — and so is
> everything in §2–§4. Only the credential changed. Plugins are `passkey` + `emailOTP`, not
> `magicLink`.
>
> Three findings drove it, with sources in
> `.impeccable/surfaces/src-app-pro-public-login.md` Appendix A:
>
> 1. **Mail scanners spend the token.** Defender Safe Links, Proofpoint and Mimecast fetch
>    every URL before delivery, so a single-use link is frequently dead on arrival. This is
>    why Slack uses a code. Belgian venues run Microsoft 365; this is not hypothetical.
> 2. **Better Auth's link does not fail loudly.** Unlike Auth0/NextAuth, its token carries the
>    auth, so opening it in a mail client's in-app browser signs you in *there* and leaves the
>    tab that asked waiting forever.
> 3. **A code is cheaper on the phone, not dearer.** iOS 17+ autofills it from Mail above the
>    keyboard; the link path requires leaving the browser.
>
> **`rpID` is `app.guestnote.be`, never `guestnote.be`.** A passkey scoped to a registrable
> suffix is usable by every subdomain beneath it, and PH4 serves per-tenant sites on
> `<slug>.guestnote.be`. `rp.id` is hashed into the authenticator at creation and can never be
> edited. This is the one thing on the surface that cannot be retrofitted.

> ⚠️ **Social sign-in added 2026-08-29: "Continue with Google", as a secondary method.**
>
> §1 point 4 below says *"EU residency is free … there is no identity sub-processor to name on
> the DPA at all"*, and `socialProviders` was empty on that basis. That is now narrowed, on a
> product call rather than a measurement:
>
> - **Google is added as a secondary sign-in method**, replacing neither passkey nor the
>   six-digit email code — one full-width "Continue with Google" button under an "Or continue
>   with" divider, at rung 0 beside the email field and the passkey control. It is **not** a
>   new step on `.impeccable/surfaces/src-app-pro-public-login.md`'s credential ladder — that
>   ladder is a one-path-at-a-time model and a button beside two other methods sits outside
>   it. The brief still lists social sign-in under "Not building" and needs its own amendment.
>   **There is still no password.**
> - **Two reasons for the flip.** (1) Belgian planners and venue staff live in Google
>   Workspace, so a one-tap button beats email-then-code — most of all in the "phone, one bar
>   of signal, on the day" scene the login brief is designed against. (2) A recognisable
>   Google button on an invite-only B2B tool reads as more legitimate to a planner evaluating
>   it, and lowers first-login drop-off.
> - **The accepted cost.** Google becomes an identity sub-processor: a sub-processor entry on
>   the DPA and a disclosure to B2B customers who ask. This is the exact thing point 4 was
>   written to avoid; it is now a known, priced trade rather than an omission.
> - **Data residency is untouched.** Neon and SES stay in `eu-central-1`; only the *identity*
>   claim narrows. No user record leaves — Better Auth still owns `users`, and Google supplies
>   only the OAuth profile on the `accounts` row it already has columns for.
> - **The seam holds.** `packages/core/src/auth/better-auth.ts` stays the only file importing
>   `better-auth`; the new `startGoogleSignIn` returns a plain redirect URL and leaks no
>   library type. `socialProviders` is wired **conditionally** on `GOOGLE_CLIENT_ID` /
>   `GOOGLE_CLIENT_SECRET`, so an environment that forgets them has no button, never a broken
>   one.
> - **Account linking is on**, `trustedProviders: ['google']`: Google asserts `email_verified`,
>   so a Google login whose address matches an existing code-created `users` row adopts that
>   row rather than colliding on the unique email. The button is hidden on the *bound*
>   staff-invitation flow (`boundEmail` set — that flow pins the address on purpose), and
>   `resolveInvitation` is still fixtures (M3), so an invitation actually granting a role via
>   Google is future. *Correction, 2026-09-21: `resolveInvitation` is real since migration 0007
>   (`resolve_invitation` / `accept_invitation`, SECURITY DEFINER), so a staff invitation now
>   grants its role after either sign-in method.*
> - **Still bounded to reverse.** Removing the button is deleting the env vars and the
>   `socialProviders.google` branch; the `accounts` OAuth columns were always present.

---

## 1. Why not Clerk — the honest version

The claim in `05-architecture.md` §5 that Clerk costs **$25/mo Pro + $100/mo B2B add-on at
zero revenue was wrong.** Checked against Clerk's pricing page 2026-08-11:

| | Reality |
|---|---|
| Organizations on Free/Pro | included — **100 MROs per app in production**, 50 in dev |
| MRO definition | an org with **≥2 members**, one of them a monthly retained user |
| Past 100 MROs | B2B add-on becomes mandatory: **$100/mo** ($85 annual) + $1/MRO (101–1,000) |
| Members per org | **20** without the add-on, unlimited with |
| Remove Clerk branding | requires **Pro, $25/mo** |
| Custom roles in production | requires the **B2B add-on** |

So day one Clerk is **€0**, not €125/mo. The 100-MRO wall is real but distant, and under the
model in §2 below it is never reached — planner orgs hold ~3 staff, and couples are not org
members at all.

**Cost is therefore not the reason.** The reasons that survive:

1. **Vendor org features cover ~30% of the actual authz model.** See §2: the wedding-level
   layer (`wedding_members`, wedding invitations, `canAccessWedding`, the `withTenant` guard,
   guest household tokens) is custom under *any* vendor. Clerk's Organizations helps only with
   the staff layer, which is three people per planner.
2. **One source of truth.** With Clerk, org membership lives in Clerk and wedding membership
   lives in Postgres, so every permission check crosses an API boundary or a webhook-synced
   shadow `users` table. With Better Auth both are in the same database, so the check is one
   SQL query inside the same transaction that sets `app.org_id`. RLS can't join to an API.
3. **White-label is the product.** Clerk branding on the login page a planner's couple sees
   undercuts the pitch, and Clerk's auth emails come from a separate sender with separate
   templates. Better Auth's magic-link email goes through the SES + `react-email` + `next-intl`
   pipeline that §6 requires anyway — same NL/EN catalogues, same `"Studio Wit — via Guestnote"`
   friendly-From, same `email_log` bounce handling. The marginal cost of auth email is ~zero
   *because that pipeline already has to exist*.
4. **EU residency is free** rather than an Enterprise conversation. There is no identity
   sub-processor to name on the DPA at all.

**What it costs us**, stated plainly: roughly **one weekend** building sign-in / magic-link /
org-switcher / invite-accept UI (mitigated — `packages/ui` is already shadcn, ported from
`se-parti-rsvp`), and owning security patching (~1h/quarter; there was an advisory in June 2026,
so subscribe to them). Against that, Clerk would have cost comparable time building the webhook
`users` mirror, because `wedding_members.user_id`, `org_members.user_id` and
`audit_log.actor_user_id` are all foreign keys.

Better Auth is **1.6.x** as of this decision — core stable and in production use, with
`owner | admin | member` as the Organization plugin's *default* role set, which is an exact
match for `org_members`. The same third role costs $100/mo on Clerk.

**Rejected alternatives, briefly:** Zitadel Cloud (EU/CH residency native, unlimited orgs free,
Apache-2.0 — the fallback if we ever want this hosted); WorkOS AuthKit (free to 1M MAU, but
US-hosted with no documented EU residency); Logto ($24 + $48/mo orgs add-on, weakest residency
story, dominated).

**The seam stays regardless.** `packages/core/auth` exposes only `getSession()`,
`requireOrgMember(orgId, minRole)`, `requireWeddingAccess(weddingId, minRole)` and the
invitation flow. Everything above is then a one-weekend reversal in either direction.

---

## 2. The tenancy model

An `organization` is **the business that pays and brands** — not "everyone involved in a
wedding."

```
organization  (type: planner | venue | couple_direct)   ← billing, plan, brand
  ├─ org_members        → STAFF only.  owner | admin | member
  └─ weddings           → owned by the org
       └─ wedding_members → THE COUPLE (+ assigned staff).  couple | editor
```

**The couple is never a member of the planner's organization.** They are ordinary users with a
`wedding_members` row and nothing else. They never see an org switcher, the planner's other
weddings, or billing.

`wedding_members.role` does double duty: `couple` for the clients, `editor` for the staff member
assigned to that wedding. That is how §5's *"`member` = assigned weddings only"* is actually
implemented.

### The three shapes

| Scenario | Org | `org_members` | `wedding_members` |
|---|---|---|---|
| **Planner-led** | Studio Wit (`planner`, €49/mo) | planner staff | couple (`couple`) + assigned staff (`editor`) |
| **Venue** | Kasteel X (`venue`, €199/mo) | venue coordinators | couple (`couple`) |
| **Direct couple** | "Jan & Els" (`couple_direct`, €149 one-off) | **one partner** (`owner`) | both partners (`couple`) |

Direct couples are the only case where a couple gets an `org_members` row — someone must own the
payment. Put **one** partner there and both in `wedding_members`: identical rights, and it keeps
the org single-member, which matters if we ever move to a vendor that meters organizations.

**Handover is free.** A couple signs up direct, then hires a planner →
`UPDATE weddings SET org_id = 'studio-wit'`. The `wedding_members` rows are untouched, so the
couple keeps their access and loses nothing. The dormant `couple_direct` org stays for their
payment history.

### Why not couples in the planner's org

Three reasons, and only the third is vendor-specific:

1. **Security.** Org membership means the session carries the planner's `org_id`, which passes
   the org-level check for *all* that planner's weddings — one URL guess from another couple's
   guest list. This is the failure mode the current `se-parti-rsvp` check
   (`lambda/src/handler.ts:71`) would have.
2. **Structural.** Org roles are org-wide. Neither Better Auth nor Clerk can express "member of
   Studio Wit, but only for wedding #7." There is no primitive between organization and user.
   (Better Auth *teams* could theoretically model a wedding, but a wedding is already a
   first-class row with a slug, date and theme — making it also a team just creates a sync
   problem for no gain.)
3. **Caps.** On Clerk specifically: 20 members per org without the add-on. Ten weddings × two
   partners = 20, so a planner paying €49/mo would force a $100/mo add-on.

---

## 3. Permissions

Authorization resolves from **two** tables, never from the GUC:

```
orgRole     = org_members[wedding.org_id, user]
weddingRole = wedding_members[wedding.id, user]

owner/admin        → everything in the org
member + assigned  → full wedding access, no billing, no delete
couple             → their wedding: content, guests, RSVPs, exports
editor             → their wedding: content + guests, no publish, no export
neither            → 404 (not 403 — don't confirm the wedding exists)
```

| | owner | admin | member | couple | editor |
|---|---|---|---|---|---|
| Billing, plan, cancel | ✅ | | | | |
| Invite staff | ✅ | ✅ | | | |
| Create / delete wedding | ✅ | ✅ | | | |
| See **all** org weddings | ✅ | ✅ | assigned only | | |
| Edit content | ✅ | ✅ | assigned | ✅ | ✅ |
| Publish | ✅ | ✅ | assigned | ✅ | |
| Guest list, RSVPs | ✅ | ✅ | assigned | ✅ | ✅ |
| CSV export | ✅ | ✅ | assigned | ✅ | |

Guests appear nowhere on this table. They hold a household token and hit `guestRepo`, which has
no listing method by construction (§5).

### The trap

A couple's session sets `app.org_id` to **the planner's org** — it must, or the RLS policy in §4
rejects every row.

> **`app.org_id` is a data-scoping mechanism, never a permission.** Never infer "is a member of
> this org" from the GUC.

A principal with no `org_members` row **must** also set `app.wedding_id`. The policy's
`wedding_id IS NULL OR wedding_id = …` branch means a couple session that omits it sees the
planner's entire book of business. Enforce it inside `withTenant()`: if the principal is not an
org member, `weddingId` is required, not optional. Five lines, and the highest-risk path in the
model — it gets its own case in the **F6** suite.

> **Better: make it unrepresentable.** A runtime check is a belt; the type is the braces.
> `withTenant` takes a discriminated union, never a loose `{ orgId?, weddingId? }` bag:
>
> ```ts
> type Principal =
>   | { kind: 'orgStaff';      orgId; role: 'owner' | 'admin' }
>   | { kind: 'assignedStaff'; orgId; weddingId; role: 'member' }
>   | { kind: 'weddingMember'; orgId; weddingId; role: 'couple' | 'editor' }
> ```
>
> No inhabitant carries an `orgId` without a `weddingId` unless it is org-wide staff.

> **And note the second half of the trap** (see the correction in `05-architecture.md` §4): because
> a couple's session sets `app.org_id` to the planner's org, **the couple's GUCs and the planner's
> GUCs are identical.** So the two GUCs above cannot express `tasks.visibility = 'internal'`.
> `withTenant` sets a third, `app.wedding_role`, from the resolved membership, and the policy on
> any table with an internal/shared split tests it.

---

## 4. Two schema deltas

**a. `wedding_members` is scoped by user, not by tenant — deliberately.**

It is the table read *before* the tenant is known, in order to determine it. So it is the one
exception to §4's rule that every tenant-scoped table carries both `org_id` and `wedding_id` —
`wedding_members` in `05-architecture.md` §4 having no `org_id` is correct, not an oversight — it and
`org_members` are the **only** two exceptions to that section's both-keys rule. Its RLS policy runs on a different
axis:

> ⚠️ **Amended 2026-08-20: a third policy now runs on this axis.** Migration
> `0005_org_read_for_members` adds a `FOR SELECT` policy to `organizations`, so a `member`
> — who has no org-wide principal and for whom `getOrg` returns null — can still read
> their organisation's name under `withUser`. These two membership tables remain the only
> ones whose *whole* policy set runs on `app.user_id`; `organizations` carries it as a
> second policy beside `tenant_isolation`, guarded to apply only where `app.org_id` is
> unset. `docs/specs/0001-moving-around-the-dashboard.md` argues the decision and prices
> the rejected alternatives.

```sql
ALTER TABLE wedding_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_members FORCE  ROW LEVEL SECURITY;

CREATE POLICY own_memberships ON wedding_members
  USING (user_id = current_setting('app.user_id', true)::uuid);
```

Same for `org_members`. Set `app.user_id` from the verified session, resolve membership, *then*
open the tenant transaction. Do **not** reach for `unsafeDbForMigrationsAndAdminOnly` here.
Put a comment in the migration so this doesn't get "fixed" later.

Request flow:

```
session → userId
  → SELECT wm.role, w.id, w.org_id
    FROM wedding_members wm JOIN weddings w ON w.id = wm.wedding_id
    WHERE wm.user_id = $userId AND wm.wedding_id = $weddingIdFromUrl
  → no row → 404
  → withTenant({ orgId: w.org_id, weddingId: w.id }, …)
```

Resolve the wedding from the **URL**, never from a client-supplied list.

**b. There are two invitation flows; the schema has one.**

`invitations_org` in `05-architecture.md` §4 covers "Ilse invites Tom as staff." Nothing covers "Ilse invites Jan
and Els to their wedding" — which is the *more common* flow, and the only way a couple gets an
account. Replace it with one table rather than adding a second:

```
invitations   id, org_id, wedding_id NULL, email, role, token_hash,
              expires_at, accepted_at, invited_by
              -- wedding_id NULL → staff invite,  role ∈ (admin | member)
              -- wedding_id SET  → wedding invite, role ∈ (couple | editor)
```

You invite an **email**, not a user — at invite time the account doesn't exist yet:

```
invite → INSERT invitations(...)
accept → user signs in (passkey, or the six-digit code) → userId now exists
       → INSERT wedding_members(wedding_id, user_id, role)
       → UPDATE invitations SET accepted_at = now()
```

Accepting a wedding invite writes a `wedding_members` row and **no** `org_members` row. That one
rule is the whole design.

---

## 5. What this changes in the build order

- **M2** — add the `own_memberships` RLS policies and the `withTenant()` guard from §3 to the
  **F6** suite. Two cases: a couple session without `app.wedding_id` must see zero rows, and
  tenant A's user must resolve zero of tenant B's memberships.
  > **Do this with a fake session** — a bare `userId` string. "From the verified session" in §4a
  > reads as though these tests wait for M3; they must not. The highest-value test in the repo does
  > not get gated on the dependency with the most unknowns. M3 swaps in a real session later.
- **M3** — Better Auth for authentication only (see the scope notes at the top), with the
  `passkey` and `emailOTP` plugins, the hand-rolled `organizations` / `org_members` / merged
  `invitations` tables, and both accept flows. `packages/core/auth` is built and is the seam;
  `better-auth` is restricted to `packages/core/src/auth/better-auth.ts` by `biome.json`, and
  that file is what M3 adds. The sign-in and invitation surfaces already exist against the seam
  and run on an in-memory provider, so M3 is a provider swap plus the shell it hands off to.
- **M9** — feature gating reads `organizations.plan`, which is why the wedding belongs to the
  *planner's* org and not the couple's.
