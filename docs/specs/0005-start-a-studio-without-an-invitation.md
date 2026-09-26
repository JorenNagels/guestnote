# Spec 0005 — Start a studio without an invitation, run it as a demo, and tell us what broke

**Date:** 2026-09-24 · **Status:** Built 2026-09-26 -- what is left is under "Still open"
**Built:** all six slices -- demo mode (`GUESTNOTE_BILLING_FROM`, `lib/billing-mode.ts`),
the demo banner and "Report a problem" (Sentry User Feedback); migration 0010 and its repos
(`repos/studios.ts`, `myPendingInvitations`, `acceptInvitationById`, `seedTemplates`, the vendor
link's `logoKey`, `studioSlugFromName`); the sign-up flow at `/signup` (`app/pro/(public)/signup/`,
`components/signup/`, `lib/signup-step.ts`), the starter templates (`lib/starter-templates.ts`,
drafted, not yet reviewed) and the sign-in footer link; the studio logo (`<org>/brand/<id>` keys and
`deleteBrandObject` in `packages/storage`, `lib/studio-logo.ts`, `components/studio/`), the Studio
page at `/studio` (`app/pro/(app)/studio/`), the sidebar's Studio item and logo, and the logo on the
vendor-link header; the trial, the lock and billing, all switched off while
`GUESTNOTE_BILLING_FROM` is unset (`packages/billing`, `lib/trial-state.ts`, `lib/trial.ts`,
`app/pro/trial-guard.test.ts`, `components/banners/trial-banner.tsx`, `/billing` in
`app/pro/(app)/billing/` and `components/billing/`, `@guestnote/db/cron`, the reminder route
`app/api/cron/trial-reminders/` and its `TrialReminders` cron in `sst.config.ts`); and slice 6, the
correction notes in `research/05`, `research/07` and the login brief, plus sign-up's pass against
the design handoff. Where the build differs from the first draft, the text says so with "(as
built)".
**Phase:** `research/05-architecture.md` M8 (self-serve onboarding) and the UI half of M9 (billing),
plus a demo-period bug channel · **Bar:** a planner runs one real wedding here instead of a
spreadsheet — which first means a planner can get in without the founder seeding their org.

Today an organisation exists only if it was seeded by hand; a stranger who signs in lands on
`noOrg`. This spec lets a planner create their own studio, see Guestnote working on a first
wedding within a minute, and report what went wrong — while the product is a free demo. The
trial, the billing screen and the lock that follows an ended trial are built now and stay
**switched off** until the demo ends.

Design reference: claude.ai design project `05ecfba4-7ead-4616-acd8-17f07762ab7c`,
`design_handoff_signup_billing/README.md` and `Guestnote Planner.dc.html` (Sign-up tab, Planner app
tab with the Account chips, Billing under Team). High fidelity: copy, colours, spacing and states
are final unless this spec says otherwise below; pricing numbers are placeholders.

## Already settled elsewhere

| Decision | Where it was already made |
|---|---|
| An org is the business that pays and brands; `type` is `planner`/`venue`/`couple_direct`; `slug` unique among the living | `packages/db/src/schema/orgs.ts:20,43,46` |
| A user row is created by the first verified email code; `disableSignUp: false` | `packages/core/src/auth/better-auth.ts:289-292` |
| Google sign-in is optional, wired only when both secrets are set, and links to an existing row with the same email | `research/07-auth-and-tenancy.md:89-97`, `apps/web/src/env.ts` |
| The code step to reuse is `verifyEmailCode` | `apps/web/src/components/auth/actions.ts:91` |
| A signed-in user with no org sees `noOrg`, not a sidebar | `docs/specs/0001-moving-around-the-dashboard.md:308-312` |
| Only owner and admin create weddings | `apps/web/src/app/pro/(app)/weddings/new/actions.ts:34-35` |
| Templates are org-scoped and copied on apply | `packages/db/src/schema/templates.ts:6-26`, `repos/templates.ts:461` |
| Staff invites mail through the mailer | `apps/web/src/app/pro/(app)/team/actions.ts:43-76` |
| A plain insert into `org_members` lets any user join any org; pre-principal writes go through `SECURITY DEFINER` functions with `search_path=''`, `revoke from public` | `packages/db/migrations/0007_team_read_and_invitations.sql:105-163` |
| A third unscoped writer in `lib/db.ts` is the point to stop | `apps/web/src/lib/db.ts:44-45`, CLAUDE.md invariant 1 |
| Billing columns are hidden from members only by a select list | `packages/db/src/repos/memberships.ts:116-121` |
| SVG is excluded from uploads because it can carry script; objects are private, presigned, 5-minute GETs | `packages/storage/src/limits.ts:17-36,53-55` |
| Sentry is server-only, EU region; no browser SDK | `apps/web/src/env.ts:141-177` |
| A behaviour-selecting variable's unset value is the safe one | CLAUDE.md invariant 6, `lib/mailer.ts`, `lib/storage.ts:28-34` |
| Provider SDKs reachable from one file each, banned in `biome.json` and `no-unsafe-imports.test.ts` | CLAUDE.md invariant 5 |
| The login bundle ships no message catalogue | `apps/web/src/components/auth/copy.ts` |
| `billing` is a reserved subdomain | `packages/core/src/hosts.ts:47` |
| NL default, EN and FR alongside; app catalogues per area in `messages/app/<area>.{nl,en,fr}.json` | `apps/web/src/lib/locales.ts:12,23`, `apps/web/src/i18n/catalogue.ts` (`SLICES`) |
| Amber is `--warning-*`, red is `--danger-*` | `design-system/tokens.css:34,36,63` |

## Decisions taken here

### Demo mode

**Billing is switched by one environment variable, `GUESTNOTE_BILLING_FROM`, a date; unset means
demo.** Unset, every environment is a free demo: the demo banner shows, the trial banner, the
Billing nav item and `/pro/billing` do not exist (the route 404s), and nothing is ever locked.
Set to `YYYY-MM-DD`, billing is on from that date. Invariant 6: forgetting the variable must give
the safe result, and the safe result is that nobody is locked out of a wedding. Rejected: a
per-org `plan = 'demo'` (more states, and the demo is a property of the product, not of a
customer); an unset-means-billing flag (forgetting it would lock every studio). Cost: you cannot
take one studio out of demo on its own — the per-org override below covers the one case that
needs it.

A date rather than `enabled` because the trial start depends on it (next section), so the switch
and the date it happened cannot disagree.

### Trial

**The trial is one calendar month, not the design's 14 days.** It ends on the same day of the
following month, in Europe/Brussels, at end of day. **Studios created during the demo get their
month from the day billing starts**: the trial end is computed on read as
`max(created_at, GUESTNOTE_BILLING_FROM) + 1 month`. Nothing is backfilled, so turning billing on
is a config change and not a migration. Rejected: counting from org creation (a studio two months
into the demo would be locked the moment billing turned on); grandfathering demo studios free
forever (a pricing decision this spec does not get to make).

**A nullable `organizations.trial_ends_at` overrides the computed end** when set — the one lever
for giving a single studio more time, set by hand.

**When the trial ends, staff lose writes; nobody loses reads.** Planners see every wedding and
can edit nothing. Couples and vendor links keep reading as before, so a live wedding is not
broken for the couple because of the planner's invoice. Nothing is deleted. Rejected: locking
couples out too (punishes the wrong person); banner-only (no reason to pay).

The lock is enforced **server-side, once**: a single guard every staff-writing Server Function
calls before its first write, refusing with a named error. A test enumerates every `'use server'`
module under `app/pro/(app)/` and fails if one writes without it — the guard is only as good as
its coverage, and a test is what makes a forgotten call site visible. Rejected: RLS (the lock
depends on an env date Postgres cannot see without a new GUC on every transaction). The Billing
screen, sign-out and "Report a problem" stay writable.
*(As built: the guard is `assertWritable(orgId)` in `lib/trial.ts`, written as the first statement
of every exported Server Function under `app/pro/(app)/` with the caller's `currentOrgId()`, and
`trial-guard.test.ts` reads those modules as text; its allowlist is sign-out, the org switcher and
the three preference cookies, the palette read, "Report a problem", the three Billing actions and
the file download. Sign-up's steps after Studio carry the guard too, by hand -- that folder is
outside the test. The guard THROWS a named `TrialEndedError`, as decided, rather than returning a
result: a component that catches its action shows its generic inline error, and a form action
(`useActionState`) or an uncaught call reaches the route's error boundary instead. "Forms stay
visible" therefore holds only for the first kind today; turning the throw into a `locked` result
per action is the follow-up if billing goes live before those screens change. Seen in the browser
2026-09-26: the rename on `/studio` refused with the red banner up. `active` and `past_due` count
as paid; `canceled` reads as an ended trial.)*

**The trial reminder mail is built**, sent three days before the trial end to the owner, once
per org per trial (deduplicated through `mail_deliveries`), by a daily `sst.aws.Cron`.
*(As built: the cron is a small Lambda (`infra/cron/trial-reminders.ts`) that POSTs
`/api/cron/trial-reminders` on the app host daily at 07:00 UTC with `Authorization: Bearer
<CRON_SECRET>`; the route does the work. `CRON_SECRET` is optional in `env.ts` (unset: the route
refuses everything), and `sst.config.ts` lists the stage's SSM names and deploys neither the
secret nor the cron while `/guestnote/<stage>/CRON_SECRET` is absent -- which it is on both
stages, so turning the reminder on is one `put-parameter` and a deploy. The dedupe is "this address
was sent `trial-reminder` in the last 7 days", because `mail_deliveries` has no org column; two
studios owned by one address would share one reminder, which one-studio-per-owner makes
unreachable. A failed send is not retried the next day, when the org is no longer three days
out. The mail is in Dutch: the owner has no stored language. `orgsWithTrialEnding` lives at
`@guestnote/db/cron`, off the package root, importable only by that route -- `biome.json` and
`no-unsafe-imports.test.ts` both.)* It never
sends while billing is off. The cron needs to find orgs across tenants with no principal: that is
a new `SECURITY DEFINER` function returning only org id, name, trial end and owner email, executable
by `app_user` alone — a `tenancy-auditor` pass is required on it, and it is named in CLAUDE.md
invariant 2 alongside `resolve_invitation`.

### Billing

**Billing is built behind a new seam, `packages/billing`, with a no-op provider only.** The
provider — Mollie (`research/05-architecture.md` §Payments, measured on Bancontact and SEPA fees)
or Stripe (what the design assumes) — is chosen when payments go live, not now. The seam returns
plain data (plan, status, next invoice, invoices) and takes plain commands (start checkout, open
portal, set seat count). Nothing in the app names a provider. Cost: the no-op provider's
"Continue to checkout" goes nowhere, so the Billing screen is reviewed with fixtures, not a
checkout; and whichever provider wins still has to fit the seam's shape. `research/05`'s Mollie
choice is not reversed by this spec; it gets a note that the choice was deferred again, on
purpose, on this date.

**Owner and admin see and use Billing** — the design's choice. This reverses
`research/07-auth-and-tenancy.md:229,237` ("billing, plan, cancel: owner only"), which gets a
correction note. Members never see it; the nav item is absent and the route 404s for them. Why:
a studio's office manager is typically an admin and handles the invoices. Cost: more people can
move the studio's money; cancelling is still an owner action once cancelling exists.

**Pricing lives in one config file**, with the design's placeholders: €49/month base including the
owner, €19/month per extra planner, yearly = 10× monthly, excl. VAT (BE 21% unless a VAT number
is given). Not `PRODUCT.md:189-195`'s tier model — pricing is undecided (`spec 0003:200`) and the
screen is hidden, so the placeholders change nothing today.

**Seats = active `org_members` rows**, owner included in the base; pending invites count only when
accepted; couples and vendor links never count. Joining and leaving call the seam's `setSeats`,
which the no-op provider ignores — the call sites exist so wiring a provider is not a hunt.
*(As built: `seatsChanged(orgId, userId)` in `lib/billing.ts`, called after both accept paths
(the invitation link in `lib/auth.ts` and sign-up's Join). There is no member-removal path in the
app yet, so there is no call there. The count uses `listTeam`, which only an owner or admin can
run under RLS, so a joining `member` cannot count their studio and the call is skipped; checkout
counts again as the owner or admin who pays. Pricing is `packages/billing/src/pricing.ts`; its
"no VAT with a VAT number" follows this spec and is flagged there as wrong for a Belgian number,
for the provider to settle.)*

### Sign-up

**`/pro/signup` is a public route on the `app.` host, six steps as the design draws them**, with
one screen added between Verify and Studio (below). Every step's Server Function authorises
itself; `proxy.ts` does nothing new (invariant 7).
*(As built: one route, and the server derives the step from the session and the database --
`lib/signup-step.ts` -- with only `?own=1` and `?step=wedding|team|ready` in the URL. Account and
Verify are `AuthFlow` itself, pointed back at `/signup`; the signed-in steps use the same
`.signin` shell and stage. The steps after Studio act in the org the caller OWNS, resolved fresh
with `resolveMemberships`, never the `gn_org` cookie, and creating or joining a studio sets that
cookie so the dashboard opens there. "Continue with Google" comes back to `/signup`
(`startGoogleSignIn('signup')`, a closed set, not a URL). The design handoff could not be read
during the build -- no DesignSync tool in that session -- so layout follows the sign-in shell and
this spec's copy table, and a pass against the handoff was owed -- made below.)*
*(As built, 2026-09-26: the pass against the handoff was made, in Chrome at 390px and desktop,
light and dark. It moved the "getting married or supplying a wedding" line from the footer to
under the Account step's button, made the footer "Already have an account? Sign in" before a
session and "Signed in as {email}" after it, put Google first on the Account step with an "or"
divider and a "Work email" label (`AuthFlow`'s `account` prop; sign-in keeps Google below), put the
preview caption inside the preview card, drew the starting-plan rows as the design does (visible
radio, white ground and strong border when selected, task count in mono), named the three Team
rows ("Planner's email", "Another planner", "And another") and set the design's 24px/−0.015em
heading, 14px/1.55 intro, 22px under it and 14px between controls on every step, sign-in's too.
The button copy is the design's: "Create wedding", "Send invitation" / "Send N invitations". NL and
FR for those labels were written here, not taken from the handoff, which is English. Found on the
way: the dark theme never set `color-scheme`, so native controls (the date field's icon) drew for
a light page; `globals.css` now sets it on `.dark`.)*

**The org is created by a new `SECURITY DEFINER` function**, `create_studio(name, owner_name)`
*(as built: `create_studio(org_id, user_id, name, slug_base, owner_name)` -- the org id is the
app's `newId()` (invariant 9), `user_id` must equal `app.user_id` as in `accept_invitation`, and
the app passes the slug base already cleaned by `lib/slug.ts`'s `studioSlugFromName`, which
falls back to `studio` for a reserved or empty name; the function adds `-2`, `-3` on collision
among live orgs. A blank owner name leaves `users.name` as it is.)*
modelled on `accept_invitation` (migration 0007): it inserts the `organizations` row with type
`planner`, the caller as `owner` in `org_members`, and sets the user's display name, in one
transaction, keyed by `app.user_id`. Not a third sanctioned unscoped writer. The org slug is
generated from the studio name with a numeric suffix on collision and checked against
`hosts.ts`'s reserved labels; **it is not shown or editable anywhere**, because nothing on screen
uses an org slug today (tenant hosts are wedding slugs).

**One studio per owner.** A user who already owns a studio and opens `/pro/signup` is sent to
`/pro`. A user who is only admin or member elsewhere may create their own; the existing org
switcher handles two memberships.

**Invitations are looked up after the code is verified, by the verified email only.** A new
`SECURITY DEFINER` function returns the caller's own pending, unexpired invitations (org name,
wedding name, role) — matched against the email on the caller's `users` row, never an email
argument, so it cannot be used to probe whether an address is invited. If there are any, the
**"You've been invited"** screen lists each with Join (staff) or Open (wedding), plus "Start my
own studio anyway". Joining accepts by invitation id through a function that re-checks the email
match *(as built: only a staff invitation is joined from this screen -- the action checks the id
is in the caller's own pending list with no wedding; the definer function re-checks whose it is,
not which kind. A successful Join answers `ok` and the client navigates, because a `redirect()`
from a directly-called Server Function rejects its promise on the client)* *(as built: an invitation addressed to another email answers `unknown`, not
`wrong_user`, so an id reveals nothing about an invitation that was never the caller's; the
function then hands on to `accept_invitation`, which does every other check. The list also
leaves out an invitation whose wedding is deleted or belongs to another org, since accepting it
could only be refused)*. A couple invite opens the existing invitation outcome, which today is `inviteCouple`
("the portal is not open yet"). Rejected: checking the email before verification (leaks
invitation existence to anyone who types an address); auto-redirecting (blocks a staff planner
who also wants their own studio).

**Every new studio is seeded with three starter templates**, copied in by the app as the new
owner, through the normal scoped template repo, right after `create_studio`:
"Volledige planning · 12 maanden", "Gedeeltelijke planning · 6 maanden", "Dagcoördinatie". Task
content is drafted from `research/09-planner-app.md` in NL/EN/FR and reviewed by Joren before this
ships. Seeded in the studio's locale at creation; they are ordinary templates afterwards. Step 4's
picker shows these three plus "Start empty". *(As built: EN "Full planning · 12 months",
"Partial planning · 6 months", "Day-of coordination"; FR "Organisation complète · 12 mois",
"Organisation partielle · 6 mois", "Coordination du jour J" -- 28, 17 and 12 tasks, each task
written once with its three titles so the languages cannot drift. A seed that fails does not fail
the sign-up; it is reported, and the picker then offers "Start empty" alone.)* This also means the in-app Templates screen of a new
studio is not empty.

**Step 4 uses the in-app new-wedding code path**, extended with an optional template id. The
in-app new-wedding screen does not gain a picker in this spec.

**Step 5 uses the existing staff invite path**, role `member`, up to three addresses; blank rows
are ignored; one invalid address blocks the send with an inline error on that field.

**Abandoning after step 3 leaves a usable account**: `/pro` opens normally for an owner whose
studio has no wedding. Revisiting `/pro/signup` after that sends them to `/pro`.

**Copy differs in demo.** The design's trial promises ("Fourteen days…", "Your trial runs
until…") are replaced while billing is off; see Copy.

### Sign-in

**The sign-in footer "Guestnote is invite-only" becomes a link to `/pro/signup`.** Its copy
lives in the auth copy module, not a catalogue, because the login bundle ships none
(`components/auth/copy.ts`). *(As built: the strings are `auth.noAccount.{prompt,linkDemo,
linkBilling}` in the base `messages/*.json`, read on the server by `getAuthCopy(billingOn)` --
which is how every sign-in string already reached the page without a catalogue in the browser.)* `.impeccable/surfaces/src-app-pro-public-login.md:200` ("orgs are
founder-seeded until pricing mechanics settle") gets a correction note.

### Studio logo

**PNG, JPG and WebP only, ≤ 2 MB.** Not SVG: the storage package excludes it because it can
carry script, and the design's SVG option is dropped rather than weakening that rule. The design's
help text and error copy change accordingly.

**Stored as a nullable `organizations.logo_key`**, the storage key of the object, under a new key
shape `<org>/brand/<id>` — a sibling of the wedding prefix, not a `files` row, because `files.
wedding_id` is NOT NULL and a logo belongs to no wedding. Not in `brand jsonb`: that column has
no shape and giving it one is its own decision (`spec 0001:108-111`). Uploaded by presigned PUT
as wedding files are; replacing deletes the old object after the new key is saved.
*(As built: the key is built by `buildBrandKey` from an org-only `BrandScope`, a type of its own so a
wedding call can never omit its wedding; `assertBrandKeyInScope` guards the GET and the delete. The
delete is the app's first: `s3:DeleteObject` is granted on `*/brand/*` only (`sst.config.ts`), so a
wedding file cannot be removed by any bug in the app, and a failed delete is reported, not shown --
the new key is already saved. A `member` is refused before anything is signed.)*

**Served by presigning on each render.** The sidebar, the Studio page and the vendor-link page
are dynamic, so a fresh 5-minute GET per render costs one signature, no request. Cost: the
browser cannot cache the logo across page loads. Rejected: a public prefix in the bucket (the
bucket's whole design is private-only).

**Shown in**: the sidebar org chip, open and collapsed, in place of the monogram; the Studio
page; the **vendor-link page header**, which means `resolve_vendor_link` (migration 0008) returns
the logo key too, in a new migration. The couple portal does not exist yet, so not there.

*(As built, sign-up: the studio does not exist when the logo is picked, so the Studio step holds the
file in the browser -- checked there against the same types and 2 MB, restated in
`components/studio/logo-upload.ts` and pinned to the storage package by a test -- and "Create studio"
posts `logo=1`. The action then answers `{ created: true }` instead of redirecting and does not set
the org cookie, because a cookie written by a Server Action re-renders `/signup`, which sends an
owner with no step home and would drop the file. The browser uploads into the studio the user owns,
then posts the form again; that second post is `create_studio`'s `alreadyOwner` path, which sets the
cookie and goes to the wedding step. If the upload fails the step stays, says the studio was created
and the logo can be added on the Studio page, and the button reads "Continue".)*

### Studio page

**`/pro/studio`, a sidebar item "Studio" between Team and Billing, owner and admin only.** It
holds the logo block and the studio name (rename). Not in the design as a nav item — the design
only says a settings page is needed; putting it in the sidebar beside Team keeps "things about
the studio" together. *(As built: a member gets a 404, not Team's explanatory notice -- they have no
link to it. The shell draws the item from a `canManage` the layout computes with `principalForOrg`;
the Billing item after it waits for slice 5.)*

### Demo banner

**Always shown while billing is off, not dismissible**, in the same slot and neutral style as the
trial banner (white, 1px border, grey mono pill), at the top of the app's main area. It carries a
"Report it" button that opens the report dialog. It never shows on the public sign-up or sign-in
pages.

The app shell gains one banner slot at the top of `<main>` (`components/nav/shell.tsx`, as
built).
At most one banner shows: demo, or else trial, or else nothing.

### Report a problem

**Reports go to Sentry User Feedback**, via `captureFeedback` from a Server Function — Sentry is
already the EU sub-processor, it has an inbox with resolved/unresolved, and it emails on new
feedback. Rejected: GitHub Issues (the repository is **public**, so every report and email would
be published); a new `bug_reports` table (RLS classification and a viewer for no gain over
Sentry); email only (no status tracking).

**Staff only**: the account menu's "Report a problem" and the demo banner's "Report it". Not
couples, vendor links or the unauthenticated pages.

**The form asks for a category, a description and an optional screenshot.** Category is Bug /
Idea / Question, sent as a Sentry tag. The screenshot is an image the user picks; the browser
downscales it to JPEG, longest edge ≤ 1600px, and refuses anything still over 900 KB, because a
Server Function body is capped at 1 MB by Next's default and raising the cap app-wide is not worth
one dialog. It goes as a Sentry attachment. Attached automatically: page path, org id, wedding id
(if any), locale, user agent, the reporter's name and email. (As built: no build sha -- the app
has no variable carrying one, and adding it for a tag was not worth a deploy change.)

**When `SENTRY_DSN` is unset the report entry points are hidden.** Showing a form whose submission
goes nowhere would be a lie; development without a DSN logs nothing and offers nothing. The demo
banner still shows, without its button.

**Rate-limited to five delivered reports per user per hour, counted in-process per Lambda
instance** (as built: a send that did not arrive does not count). Weak,
and accepted: the reporters are signed-in staff, not the internet. Rejected: the existing
`rate_limits` table, which Better Auth's adapter writes — a writer from here would be the third
sanctioned bypass of invariant 1, which is where it says to stop.

**(As built) A feedback event carries no request.** Sentry runs `beforeSend` on error events
only, so the app's scrubber never sees feedback, and the request integration would otherwise
attach the `Cookie` header with the session token. `stripFeedbackRequest` in `lib/scrub.ts`
drops it; found in review before the first deploy.

## Behaviour

### Sign-up

Shell, header, step indicator and spacing exactly as the design's Sign-up tab. Steps:

1. **Account** — Google (only when configured, as on sign-in) or work email → Continue. A user who
   is already signed in skips to the first incomplete step.
2. **Verify** — the sign-in code step: six-digit field, Verify, "Different address", "Send a new
   code". Errors as on sign-in.
3. **Invited** *(only when the lookup finds any)* — the list and "Start my own studio anyway".
   Join → the studio's `/pro`. Open (wedding) → the invitation outcome.
4. **Studio** — studio name (required, 1–80 chars), your name (required), logo (optional), preview
   row. "Create studio" is disabled until both names are non-blank. On failure: inline error, the
   form keeps its values. Double submit creates one studio (the function refuses a second owned
   org).
5. **First wedding** — couple (required), main day (optional date), starting plan (the three
   seeded templates + Start empty, default the first). "Skip for now" goes to step 6.
6. **Team** — three email fields; button counts the non-blank ones. "Just me for now" skips.
   *(As built: when one row's mail fails, the rows already invited are locked and marked
   "Invited" so a retry does not send them twice.)*
7. **Ready** — badge, "{Studio} is ready", summary (Studio / Wedding or "—" / Team: n invited or
   "Just you"), "Open Guestnote" → `/pro`.

The step indicator stays four labels (Account · Studio · Wedding · Team); Verify and Invited sit
under Account.

### Trial banner (billing on only)

The design's three states, with the dates from the trial computation. Days 1 through (end − 4):
neutral. Last three days: amber. Ended: red. Hidden on `/pro/billing` and when the org's status is
active.

### Billing (billing on only)

The design's screen. With the no-op provider: status "trial", Plan card with the monthly/yearly
toggle and computed line items from live seat count, Invoice details editable and saved to the org
(billed-to, billing email, VAT number), Invoices empty state. "Continue to checkout" calls the seam;
the no-op provider returns "not available" and the screen shows an inline error rather than
pretending. The success banner and paid state are exercised in component tests with fixture
data.
*(As built: the provider's return lands on `/billing?checkout=done`, and the success banner shows
only when the studio then reads as paid. The notes column is "How billing works": seats, changing
planners, and what an ended trial means. The trial banner offers "Choose a plan" to owners and
admins only; a member sees the banner without the button. Amber is the last day and the two
before it (three calendar days); the reminder goes out the day before amber starts.)*

### Trial ended (billing on only)

Every staff write returns the lock error; the UI shows it as the standard inline error with the red
banner already explaining why. Forms stay visible, not disabled, so the planner can still copy
what they typed.

### Report dialog

Category radio (default Bug), textarea (required, 1–4000 chars), "Add a screenshot" file picker
(image only), Send. Sending → `report.sent` in place of the form (as built: the dialog stays open on the thanks
until closed, and closing unmounts it so the next report starts empty). Failure (Sentry
unreachable, rate limit) → inline error, text kept. Screenshot too large after downscaling →
inline error on the picker, report still sendable without it.

### Logo

As the design's logo block, with the format change. LiveRegion announces added/removed. A logo
that fails to load falls back to the monogram.

## Data

Migration `0010` (next after 0009):

| Change | Nullability, and why |
|---|---|
| `organizations.logo_key text` | null = no logo, the default for every studio |
| `organizations.trial_ends_at timestamptz` | null = computed from `created_at` and `GUESTNOTE_BILLING_FROM`; set only to grant one studio more time |
| `organizations.billing_cycle text` check `monthly`/`yearly` | null until a plan is chosen |
| `organizations.billing_status text` check `trialing`/`active`/`past_due`/`canceled` | null = trialing; "trial ended" is computed, never stored, so it cannot go stale |
| `organizations.billing_name`, `billing_email`, `vat_number text` | null until entered on the Billing screen |
| `organizations.billing_customer_id`, `billing_subscription_id text` | null until a provider exists; provider-neutral names |
| `create_studio`, `my_pending_invitations`, `accept_invitation_by_id`, `orgs_with_trial_ending` | `SECURITY DEFINER`, `search_path=''`, executable by `app_user` only. *(As built: `orgs_with_trial_ending(on, billing_from)` returns the trial's last day as a Europe/Brussels `YYYY-MM-DD`, with Postgres's month arithmetic -- 31 January + 1 month is the last day of February, which `lib/trial.ts` must match -- one row per org with its earliest owner's email, and nothing at all when `billing_from` is null.)* |
| `resolve_vendor_link` | also returns `logo_key` |

`mollie_customer_id` and `subscription_status` stay untouched and unused — dropping them is a
separate cleanup once the provider is chosen. `plan` stays `'free'` by default.

No new table. `resolveMemberships`' select list stays narrow; billing fields are read by a new
repo function that requires an owner or admin principal.

## Permissions

| | owner | admin | member | editor | couple |
|---|---|---|---|---|---|
| Create a studio (sign-up) | any signed-in user who owns none | | | | |
| Studio page: logo, rename | ✅ | ✅ | | | |
| Billing screen | ✅ | ✅ | | | |
| Report a problem | ✅ | ✅ | ✅ | | |
| Writes after trial end | ❌ | ❌ | ❌ | unchanged | unchanged |
| See the logo | ✅ | ✅ | ✅ | vendor link: ✅ | no portal yet |

## Copy

NL first; EN below; FR written at build and reviewed. Keys under `messages/app/signup.*`,
`app/billing.*`, `app/studio.*`, `app/banners.*`, `app/report.*`; sign-in footer in
`components/auth/copy.ts`.

| Key | NL | EN |
|---|---|---|
| signIn.footer.prompt | Plan je bruiloften beroepsmatig? | Planning weddings for a living? |
| signIn.footer.link (demo) | Start je studio | Start your studio |
| signIn.footer.link (billing) | Probeer een maand gratis | Try it free for a month |
| signup.account.title | Start je studio | Start your studio |
| signup.account.intro (demo) | Guestnote is in demo: alles is gratis terwijl we bouwen. | Guestnote is in demo: everything is free while we build. |
| signup.account.intro (billing) | Een maand lang alles open. Geen kaart tot je beslist te blijven. | A month with everything unlocked. No card until you decide to stay. |
| signup.account.emailLabel, .or *(as built)* | Zakelijk e-mailadres · of | Work email · or |
| signup.account.haveAccount *(as built, the design's)* | Al een account? | Already have an account? |
| signup.signedInAs *(as built)* | Aangemeld als {email} | Signed in as {email} |
| signup.team.emailFirst/Second/Third *(as built)* | E-mailadres van de planner · Nog een planner · En nog een | Planner’s email · Another planner · And another |
| signup.account.notPlanner | Ga je trouwen, of lever je aan een bruiloft? Dan heb je geen account nodig. Open de link die je planner stuurde. | Getting married, or supplying a wedding? You don’t need an account. Open the link your planner sent you. |
| signup.invited.title | Je bent uitgenodigd | You’ve been invited |
| signup.invited.join | Deelnemen | Join |
| signup.invited.open | Openen | Open |
| signup.invited.ownStudio | Toch mijn eigen studio starten | Start my own studio anyway |
| signup.studio.title | Geef je studio een naam | Name your studio |
| signup.studio.preview | Zo zien koppels en leveranciers je | How couples and vendors will see you |
| signup.studio.create | Studio aanmaken | Create studio |
| signup.wedding.title | Je eerste bruiloft | Your first wedding |
| signup.wedding.empty | Leeg beginnen | Start empty |
| signup.wedding.skip | Later | Skip for now |
| signup.team.title | Wie plant er met je mee? | Who plans with you? |
| signup.team.note (demo) | Gratis tijdens de demo. | Free during the demo. |
| signup.team.note (billing) | Gratis tijdens je proefmaand. Daarna is elke extra planner een plaats in je abonnement. | Free during your trial. After that, each extra planner is a seat on your plan. |
| signup.team.skip | Voorlopig alleen ik | Just me for now |
| signup.ready.title | {studio} is klaar | {studio} is ready |
| signup.ready.trial (billing only) | Je proefmaand loopt tot {date}. We sturen je drie dagen vooraf een herinnering. | Your trial runs until {date}. We’ll remind you three days before. |
| signup.ready.open | Guestnote openen | Open Guestnote |
| logo.help | PNG, JPG of WebP tot 2 MB. Vierkant werkt het best. Zichtbaar in je zijbalk en op leverancierslinks. | PNG, JPG or WebP up to 2 MB. Square works best. Shown in your sidebar and on vendor links. |
| logo.notImage | Dat is geen afbeelding. Gebruik een PNG, JPG of WebP. | That isn’t an image. Use a PNG, JPG or WebP. |
| logo.tooLarge | Dat bestand is groter dan 2 MB. Probeer een kleinere afbeelding. | That file is over 2 MB. Try a smaller image. |
| logo.* *(as built)* | the logo copy lives under `app.studio.logo.*` and sign-up reads it from there; beyond the three above: label, upload, replace, remove, uploading, removing, added, removed, `errors.failed` ("Het logo kon niet worden opgeslagen. Probeer het opnieuw.") and `errors.afterCreate` (sign-up only) | |
| studio.* *(as built)* | the Studio page: title, subtitle, and `name.*` for the rename -- see `messages/app/studio.*.json`; sign-up gained `studio.continue` and lost `studio.logoLater` | |
| banners.demo.pill | DEMO | DEMO |
| banners.demo.body | Guestnote is in demo. Alles is gratis terwijl we bouwen. | Guestnote is in demo. Everything is free while we build. |
| banners.demo.ask *(as built: shown only when there is an inbox to report to)* | Loopt er iets mis? | Something off? |
| banners.demo.action | Meld het | Report it |
| banners.trial.* | the design's three messages, with "veertien dagen" → the computed date *(as built: plus a pill per state, `lastDaysNone` for a studio with no live wedding, and `lastDay` for the final day's pill)* | |
| billing.* *(as built)* | the Billing screen, NL/EN/FR, in `messages/app/billing.*.json`; the reminder mail is `email.trialReminder` in the base catalogues | |
| report.menu, report.title | Een probleem melden | Report a problem |
| report.category *(as built: the fieldset's label)* | Soort | Kind |
| report.categories.{bug,idea,question} | Fout · Idee · Vraag | Bug · Idea · Question |
| report.message | Wat gebeurde er? | What happened? |
| report.screenshot | Schermafbeelding toevoegen (optioneel) | Add a screenshot (optional) |
| report.sent *(as built: says how we answer)* | Bedankt, we hebben het. We antwoorden per e-mail als we meer moeten weten. | Thanks — it’s with us. We’ll reply by email if we need to know more. |
| report.errors.tooLarge | Die afbeelding is te groot, ook verkleind. Verstuur zonder, of kies een kleinere. | That image is too large even when shrunk. Send without it, or pick a smaller one. |
| report.errors.* *(as built)* | one per refusal: forbidden, empty, tooLong, badScreenshot, rateLimited, unavailable -- see `messages/app/report.*.json` | |
| trial.locked | Je proefperiode is voorbij. Je bruiloften zijn alleen-lezen tot je een abonnement kiest. | Your trial has ended. Your weddings are read-only until you choose a plan. |

The Billing screen's strings are the design's, translated at build.

## Not in scope

| Not building now | Why, or which phase it belongs to |
|---|---|
| A real payment provider, checkout, customer portal, webhooks | Deferred by choice; M9 proper, when the demo ends |
| Editing the org slug | Nothing on screen uses it |
| A template picker in the in-app new-wedding flow | Sign-up only; the in-app picker is S7's deferred block |
| Logo on a couple portal | The portal does not exist |
| SVG logos | Storage rule, see Studio logo |
| Couple, vendor or anonymous bug reports | Staff only |
| Cancelling a subscription | Needs a provider |
| Dropping `mollie_customer_id` / `subscription_status` | Cleanup once a provider is chosen |

## Done means

- [ ] A stranger can sign up on staging with email, create a studio, a first wedding from a starter
      template and invite a planner, and land on `/pro` with the demo banner.
      *Walked end to end on dev 2026-09-26 (console mail), landing on `/pro` with the banner; not
      yet on staging, which needs a real inbox for the code.*
- [ ] Signing up with an address that has a pending invite shows the invited screen; Join lands in
      that studio. *Covered by component and action tests; not recorded as seen in a browser.*
- [ ] The logo uploads, shows in the sidebar (open and collapsed) and on a vendor link, and can be
      removed. *Built and tested; the vendor-link header is not recorded as seen in a browser.*
- [ ] "Report a problem" produces a Sentry feedback item with category, text, screenshot and context
      on staging, and a Sentry alert rule emails `joren@guestnote.be` on new feedback (manual,
      in the Sentry UI). *Both open: the staging readback and the alert rule.*
- [ ] With `GUESTNOTE_BILLING_FROM` set locally: trial banner in all three states, Billing screen
      for owner/admin, 404 for member, staff writes refused after the trial end, couple and
      vendor-link reads unaffected; the guard-coverage test fails when a guard call is removed.
      *The refused write was seen 2026-09-26; the member's 404 is not browser-checked.*
- [ ] The reminder cron sends once, only with billing on. *Tested in code; never live -- neither
      stage has `CRON_SECRET`, so the cron is not deployed.*
- [ ] Starter template content reviewed by Joren in NL; EN and FR present. *EN and FR present;
      the review is Joren's.*
- [x] Correction notes in `research/05-architecture.md` (provider deferred), `research/07-auth-and-
      tenancy.md` (billing owner + admin), `.impeccable/surfaces/src-app-pro-public-login.md`
      (self-serve reopened); CLAUDE.md invariant 2 names the new definer functions; invariant 5
      names `packages/billing`; invariant 6 names `GUESTNOTE_BILLING_FROM`.
- [ ] `tenancy-auditor` on the migration and every new Server Function. *Recorded for the
      migration (`91f1f55`, nothing blocking); not recorded here for slices 3-5's actions.*
- [ ] `npm run check`, `npm run test:db` (both tiers), and whatever else `/verify` names.
      *`npm run check` green 2026-09-26; the local db tier passed with migration 0010 (630); the
      Neon tier is not recorded.*

## Still open

- **Starter template content**, until Joren reviews the NL.
- **The Sentry alert rule** that emails on new feedback (manual, Sentry UI), and **a staging
  readback** of one real report with its screenshot and context.
- **The provider.** Mollie vs Stripe, when billing goes live. The seam's shape assumes a hosted
  checkout and a hosted portal, which both offer.
- **The trial lock's error shape.** `assertWritable` throws; a `locked` result per action is
  needed before billing goes live, so form actions show an inline error rather than the route's
  error boundary (Trial, as built).
- **The reminder mail is NL only**, because the owner has no stored language.
- **The BE VAT rule in `packages/billing/src/pricing.ts`**: "no VAT with a VAT number" is wrong for
  a Belgian number; the provider settles it.
- **Browser checks not yet made:** the member's view (no Studio or Billing item, `/billing` 404),
  the invited screen's Join, the logo on a vendor link, and sign-up on staging with a real inbox.
- **The rate-limit mechanism for reports.** In-process per instance is weak; if reports get abused,
  a scoped table is the fix.
- **The `noOrg` hint** on `/pro` (`weddings.noOrgHint`) still says only an invitation grants
  access, and does not link to `/signup`. Product copy, left for a decision.
