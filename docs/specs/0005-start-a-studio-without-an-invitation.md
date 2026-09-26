# Spec 0005 — Start a studio without an invitation, run it as a demo, and tell us what broke

**Date:** 2026-09-24 · **Status:** Specified, not built
**Built so far:** slices 1-2 of 6 -- demo mode (`GUESTNOTE_BILLING_FROM`, `lib/billing-mode.ts`),
the demo banner and "Report a problem" (Sentry User Feedback); migration 0010 and its repos
(`repos/studios.ts`, `myPendingInvitations`, `acceptInvitationById`, `seedTemplates`, the vendor
link's `logoKey`, `studioSlugFromName`). Not built: the sign-up screens, starter template
content, studio page and logo upload, trial, billing. Where the build differs from
the first draft, the text says so with "(as built)".
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

**The trial reminder mail is built**, sent three days before the trial end to the owner, once
per org per trial (deduplicated through `mail_deliveries`), by a daily `sst.aws.Cron`. It never
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

### Sign-up

**`/pro/signup` is a public route on the `app.` host, six steps as the design draws them**, with
one screen added between Verify and Studio (below). Every step's Server Function authorises
itself; `proxy.ts` does nothing new (invariant 7).

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
match *(as built: an invitation addressed to another email answers `unknown`, not
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
picker shows these three plus "Start empty". This also means the in-app Templates screen of a new
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
(`components/auth/copy.ts`). `.impeccable/surfaces/src-app-pro-public-login.md:200` ("orgs are
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

**Served by presigning on each render.** The sidebar, the Studio page and the vendor-link page
are dynamic, so a fresh 5-minute GET per render costs one signature, no request. Cost: the
browser cannot cache the logo across page loads. Rejected: a public prefix in the bucket (the
bucket's whole design is private-only).

**Shown in**: the sidebar org chip, open and collapsed, in place of the monogram; the Studio
page; the **vendor-link page header**, which means `resolve_vendor_link` (migration 0008) returns
the logo key too, in a new migration. The couple portal does not exist yet, so not there.

### Studio page

**`/pro/studio`, a sidebar item "Studio" between Team and Billing, owner and admin only.** It
holds the logo block and the studio name (rename). Not in the design as a nav item — the design
only says a settings page is needed; putting it in the sidebar beside Team keeps "things about
the studio" together.

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
| banners.demo.pill | DEMO | DEMO |
| banners.demo.body | Guestnote is in demo. Alles is gratis terwijl we bouwen. | Guestnote is in demo. Everything is free while we build. |
| banners.demo.ask *(as built: shown only when there is an inbox to report to)* | Loopt er iets mis? | Something off? |
| banners.demo.action | Meld het | Report it |
| banners.trial.* | the design's three messages, with "veertien dagen" → the computed date | |
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
- [ ] Signing up with an address that has a pending invite shows the invited screen; Join lands in
      that studio.
- [ ] The logo uploads, shows in the sidebar (open and collapsed) and on a vendor link, and can be
      removed.
- [ ] "Report a problem" produces a Sentry feedback item with category, text, screenshot and context
      on staging, and a Sentry alert rule emails `joren@guestnote.be` on new feedback (manual,
      in the Sentry UI).
- [ ] With `GUESTNOTE_BILLING_FROM` set locally: trial banner in all three states, Billing screen
      for owner/admin, 404 for member, staff writes refused after the trial end, couple and
      vendor-link reads unaffected; the guard-coverage test fails when a guard call is removed.
- [ ] The reminder cron sends once, only with billing on.
- [ ] Starter template content reviewed by Joren in NL; EN and FR present.
- [ ] Correction notes in `research/05-architecture.md` (provider deferred), `research/07-auth-and-
      tenancy.md` (billing owner + admin), `.impeccable/surfaces/src-app-pro-public-login.md`
      (self-serve reopened); CLAUDE.md invariant 2 names the new definer functions; invariant 5
      names `packages/billing`; invariant 6 names `GUESTNOTE_BILLING_FROM`.
- [ ] `tenancy-auditor` on the migration and every new Server Function.
- [ ] `npm run check`, `npm run test:db` (both tiers), and whatever else `/verify` names.

## Still open

- **The rate-limit mechanism for reports.** In-process per instance is weak; if reports get abused,
  a scoped table is the fix.
- **The provider.** Mollie vs Stripe, when billing goes live. The seam's shape assumes a hosted
  checkout and a hosted portal, which both offer.
- **Starter template content**, until reviewed.
