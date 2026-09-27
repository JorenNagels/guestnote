# Spec 0006 — A planner finds Guestnote, understands it in a minute, and signs up on terms they can read

**Date:** 2026-09-27 · **Status:** Specified, not built
**Built so far (2026-09-27):** everything below, on branch `feat/public-site` -- the eleven pages
in three locales (`app/(marketing)/[locale]/`, `components/marketing/`), the brief
(`.impeccable/surfaces/marketing.md`), the legal texts (`components/marketing/legal/`), migration
0011 and the terms box on sign-up, robots/sitemap/OG image and the proxy change. What keeps it
from "Built" is the staging read-back and the Neon tier of `test:db` (see "Done means").
**Phase:** `research/05-architecture.md` M8 (the public face of self-serve onboarding) ·
**Bar:** a planner runs one real wedding here instead of a spreadsheet — which first means a
planner who has never heard of us trusts the site enough to start a studio.

`guestnote.be` still serves the static `coming-soon/` page, and the app's own apex route is a
placeholder. Sign-up exists since spec 0005, so a stranger can already open a studio, but there
are no terms, no privacy notice and no imprint. This spec specifies the public marketing site
on the apex in NL/EN/FR, the legally required pages that go with it, and the acceptance of the
terms at sign-up.

## Already settled elsewhere

| Decision | Where it was already made |
|---|---|
| Locales are exactly nl/en/fr, the default is `nl`, and `Accept-Language` is never negotiated | `apps/web/src/lib/locales.ts:12,23` |
| Marketing keeps literal paths with the locale as the first segment. `/` → 308 `/nl`, and a non-locale first segment 404s in proxy | `apps/web/src/proxy.ts`, marketing branch |
| The apex has no public `/api/*` | `proxy.ts`, marketing branch |
| Marketing is prerendered per locale and never reads a cookie. Any `cookies()` call would make every page dynamic | `(marketing)/[locale]/layout.tsx`, `i18n/request.ts` |
| Marketing cache is `s-maxage=60, stale-while-revalidate=86400`, with no invalidations | `proxy.ts`, ADR 0003 |
| File-based metadata (`sitemap.ts`, `robots.ts`, `opengraph-image`) belongs on marketing, whose paths are real | ADR 0003 §1 |
| Cross-host CTAs are plain `<a>`, built only by `lib/app-url.ts` (`appSignupUrl`, `appLoginUrl`, `appHomeUrl`), and the dashboard label is decided in the browser | `lib/app-url.ts`, `components/marketing/app-entry-link.tsx` |
| The trial is one calendar month. While `GUESTNOTE_BILLING_FROM` is unset, the product is a free demo | spec 0005, "Demo mode" and "Trial" |
| Prices live only in `PRICING`: 4900 base, 1900 per seat, 10 months for yearly, excl. VAT, in cents | `packages/billing/src/pricing.ts:10-21` |
| Data processors: AWS (SES/S3/Lambda/CloudFront, eu-central-1), Neon, Sentry EU (server-only, plus user feedback), Zoho EU (human mail), Google (optional sign-in) | ADR 0002, ADR 0005, `env.ts:141-177`, `research/07:82-83`, spec 0005, "Report a problem" |
| The apex sets no cookies. `app.` sets only strictly necessary ones: session, `NEXT_LOCALE`, `gn_theme`/`gn_density`/`gn_nav`/`gn_org` | `better-auth.ts:117-165`, `lib/prefs.ts:56-74` |
| Apex cutover is a manual Route 53 batch after a production deploy | `infra/README.md`, "The apex cutover" |

## Decisions taken here

### Who it is for and where it sells

**Belgium-first and open to the EU.** The terms use Belgian law, prices are in EUR, and nothing
blocks an EU sign-up. There is no NL-market copy. Rejected: Belgium-only (it would turn away
paying EU planners for no gain) and Benelux-targeted copy (`research/02` §8 Q4 is still open).
FR is a full translation, but NL is written first.

### URLs are translated per locale

| Page | nl | en | fr |
|---|---|---|---|
| Home | `/nl` | `/en` | `/fr` |
| Features | `/nl/functies` | `/en/features` | `/fr/fonctionnalites` |
| Pricing | `/nl/prijzen` | `/en/pricing` | `/fr/tarifs` |
| About + contact | `/nl/over-ons` | `/en/about` | `/fr/a-propos` |
| Terms | `/nl/algemene-voorwaarden` | `/en/terms` | `/fr/conditions-generales` |
| Privacy | `/nl/privacy` | `/en/privacy` | `/fr/confidentialite` |
| DPA | `/nl/verwerkersovereenkomst` | `/en/dpa` | `/fr/accord-traitement-donnees` |
| Subprocessors | `/nl/subverwerkers` | `/en/subprocessors` | `/fr/sous-traitants` |
| Cookies | `/nl/cookies` | `/en/cookies` | `/fr/cookies` |
| Accessibility | `/nl/toegankelijkheid` | `/en/accessibility` | `/fr/accessibilite` |
| Imprint | `/nl/juridisch` | `/en/legal` | `/fr/mentions-legales` |

One slug map, `lib/marketing-pages.ts` (forwarded by `lib/routes.ts`), drives the builders, the language switcher (which maps a page
to its counterpart, not to the home page), the hreflang alternates and the sitemap. A slug that
belongs to another locale (`/en/prijzen`) is a 404, not a redirect. Rejected: one English slug
for all locales, which is simpler but puts English words in Dutch URLs, weakens SEO in each
language, and is not what `marketing.pricing` already promised.

**As built: one `[locale]/[slug]` segment with `dynamicParams = false`**, validated against
`lib/marketing-pages.ts`; thirty folders were rejected as thirty places for a locale to go
missing. The constraint: validation must live in the
proxy or at page level, **never** in the root layout, where `notFound()` renders a 500.

### Look: an editorial shell around a faithful product

**Marketing gets an editorial layer: a larger type ramp, a display face and the coming-soon
logo animation. The product inside it is shown in the app's real styling.** A new brief,
`.impeccable/surfaces/marketing.md`, is written before the pages are. The colour tokens stay
shared (`globals.css`). The type ramp and any display font are a marketing-only addition,
which the layout's comment already expected as a "second entry point". Rejected: reusing the
dashboard's look unchanged (too plain to sell), and a separate marketing palette (two token
sets that drift).

**Revised 2026-09-27, the same day:** the user asked that neither the copy nor the page read
as AI-made. The uppercase section labels, the italic accent word, the dark glowing hero, the
numbered steps and the before/after cards were removed, and the NL/EN/FR copy rewritten in
plain "we" with concrete detail (no founder name, no S'e parti, no invented figures, all by the
user's choice). The brief's header lists the rules.

### Product visuals are coded mini-UIs, animated

**Screens are recreated in React from the app's own `@guestnote/ui` primitives and tokens, not
screenshotted.** Candidates: a checklist where a task ticks itself off, a run sheet where a row
slides in, a budget where a line updates the total, and the signed vendor link. Animations are
CSS-only, run once when a mini-UI scrolls into view, and are replaced by the final static frame
under `prefers-reduced-motion`. The mini-UIs are server-rendered and static; the animation needs
at most a tiny client island (an IntersectionObserver). The copy inside them comes from the
message catalogue, so they are translated. Rejected: screenshots (they go stale, need one per
locale and theme, and are files in `public/` that invariant 12 bites), and screen recordings
(heavy, and they need re-recording for every language).

### Only built features are sold

**The site markets what a trial user can find today.** Wedding sites and RSVP (PH4) get at most
one "coming later" line. No testimonials exist, and none are invented.

### Waitlist is replaced by sign-up

**The primary CTA everywhere is "Start free" → `appSignupUrl()`.** A demo request is a
`mailto:hello@guestnote.be`. The `waitlist/` Lambda stays up until cutover and is retired with
`coming-soon/` (`infra/README.md` cutover step). Rejected: porting the form, which needs a
public `/api` allow-list entry on the apex, and a queue of leads nobody is working through.

### Pricing is public

**`/prijzen` shows €49/month per studio (owner included) + €19/month per extra planner, yearly
= 10 months, labelled "excl. VAT".** The numbers are read from `PRICING`/`quote()` and never
typed into copy. While billing is off (demo mode, which is how the site is built), a banner
says: everything is free during early access, and you'll get notice before anything is
charged. The pricing page does **not** repeat `pricing.ts`'s "no VAT with a VAT number" rule,
which is wrong for Belgian numbers. Rejected: "free during early access" with no prices (it
hides the one number a planner needs to decide), and presenting the trial as live.

The build sets demo-vs-trial copy at build time from `GUESTNOTE_BILLING_FROM` (via `lib/billing-mode.ts`, its one reader),
so the page stays static. Once billing is on, a later deploy switches the copy.

### Operator: a personal eenmanszaak, not yet registered

**The operator's details (name, "eenmanszaak", address, KBO number, VAT status, email) come from
one config object, and the imprint and the footer line are hidden while any of them is unset.**
As built, that object is a committed constant, `apps/web/src/lib/operator.ts`, not environment
variables as the first plan had it: the details are public, identical in every environment, and
baked into prerendered pages, so a commit is the reviewable place for them. The legal-notice page
says the details will follow and gives the contact address while they are unset.
The slots, layout and copy are built and tested with fixture values. Registering at the KBO is
the operator's job, not code.

⚠️ **This must be filled before production.** WER art. XII.6 requires these details on the site
(€50–5,000 per missing item), and the terms and privacy notice name the operator. Staging
may run without them; the apex cutover may not. There is no mechanical guard (the user chose
hiding over blocking), so the cutover checklist in `infra/README.md` gains the line.

VAT status copy: until there is a VAT number, "Vrijgesteld van btw — bijzondere
vrijstellingsregeling kleine ondernemingen" **if** the exemption is taken. That is the
operator's call with an accountant. It also makes the 21% in `pricing.ts` wrong, which is a
billing-provider problem (spec 0005 left it there) and is noted, not fixed, here.

### Legal texts are drafted here and shipped as drafted

**Claude drafts terms, privacy, DPA, subprocessors, cookies and accessibility in NL, then EN and
FR.** The user chose to ship them without a legal review. Recorded plainly: the liability cap and
the DPA are where template drafts usually go wrong, and nobody qualified will have read these.

- **Terms:** B2B SaaS terms covering the account and studio, the trial and demo period,
  subscription and payment, termination and export of your data, availability without an SLA,
  the liability cap (fees paid in the last 12 months), changes with 30 days' notice, Belgian
  law, and the courts of the operator's arrondissement. Written to survive the Belgian B2B
  unfair-terms law (2019, in force 2020).
- **Privacy:** Guestnote is the *controller* for planner accounts, site logs, mail delivery logs
  and support feedback. Purposes, legal bases, retention, rights, and a complaint route to the
  GBA/APD.
- **DPA:** Guestnote is the *processor* for what planners enter about couples, guests and
  vendors. It covers the art. 28(3) elements, with general authorisation for subprocessors
  listed on the subprocessor page. It is incorporated into the terms, so accepting the terms
  accepts the DPA.
- **Subprocessors:** a table of name, purpose, data and location, covering AWS, Neon, Sentry,
  Zoho and Google (optional sign-in), plus the 30-day change notice. Neon's region must be read
  from the Neon console (it is not recorded in any ADR) and written in at build.
- **Cookies:** lists the strictly necessary cookies above and says no consent banner is needed
  because nothing else is set.
- **Accessibility:** the target (WCAG 2.1 AA), known gaps, and a contact. The EAA gives Belgian
  micro-enterprises a transition to 2030, not an exemption.

Every legal page shows its version date. Terms carry a version string (a full date, `2026-09-27`, in `lib/legal.ts`) that is
also stored at acceptance.

### Terms are accepted by the studio owner, when the studio is created

**A required checkbox on sign-up's Studio step: "I accept the terms and the data processing
agreement" (both linked).** It is stored on the **organisation** as `terms_version` +
`terms_accepted_at`, written by `create_studio`. The studio is the contracting party, and
invited staff, couples and vendors are covered by their studio's contract. Rejected:
acceptance on every account (it touches Better Auth's `users` table, and a couple is not a
customer), and on the Account step (nothing exists to write to until Verify).

## Behaviour

**Every page:** a header with the wordmark (home), nav (Features, Pricing, About), the language
switcher (to the same page in the other locale), and `AppEntryLink` (Log in / Dashboard) plus a
"Start free" button. A footer with legal links, `hello@guestnote.be`, and the imprint line when
it is configured. Keyboard-navigable, with visible focus, and no horizontal scroll at 360px.

**Home:** hero (headline, subline, "Start free" + "Book a demo", and an animated mini-UI), the
"replace the spreadsheet and the WhatsApp group" framing, 3–4 feature bands each with a
mini-UI, how it works (create studio → add wedding → share with couple and vendors), a pricing
teaser, an FAQ, and a closing CTA.

**Features:** one section per built capability (weddings dashboard and Today, tasks and
templates, run sheet, vendors + signed vendor link, budget, couple access, NL/EN/FR, passkeys),
each with a mini-UI or icon, and one "coming later" line for wedding sites/RSVP.

**Pricing:** the plan card with a seat stepper and a monthly/yearly toggle (a client island;
the numbers come from `quote()`), an excl.-VAT label, the early-access banner (demo mode) or
the trial line (billing on), and an FAQ: cancel anytime, your data (export, EU hosting), VAT,
what counts as a planner.

**About + contact:** who builds it and why (Belgian, alongside a working planning practice),
`hello@guestnote.be`, and the imprint details when configured.

**Legal pages:** a readable long-form layout, a table of contents on desktop, and the version
date at the top.

**States:** there is no data and no loading on these pages. A JavaScript failure leaves every
page fully readable (the islands only enhance), and the pricing card renders the default
(1 planner, monthly) server-side. Unknown slug → 404 page (not the root-layout 500). Printed:
legal pages print cleanly (nav and footer hidden).

**SEO:** `generateMetadata` per page and locale (title, description, canonical, hreflang
alternates incl. `x-default` → nl), `opengraph-image` generated per locale, `sitemap.ts`
listing every page × locale with alternates, `robots.ts` allowing the apex. JSON-LD
`Organization` + `SoftwareApplication` (with the offer price) on home and pricing.
**Invariant 12:** `robots.txt`/`sitemap.xml` stop being matcher exclusions and are served by the
route handlers on the apex only. Their responses on `app.` and tenant hosts must be decided
(robots: `Disallow: /` on app and tenant hosts). The matcher comment and CLAUDE.md invariant
12 are updated in the same commit.

**As built:** the proxy passes `/robots.txt` and `/sitemap.xml` through on the apex and answers
them itself everywhere else -- a constant disallow-all robots file, and a 404 for the sitemap --
because it is the only reader of the hostname. On the apex, `app/robots.ts` allows crawling only
when the root domain is `guestnote.be` (`lib/indexing.ts`), so staging is never indexed. The
share card is `[locale]/opengraph-image.tsx`, generated per locale; `coming-soon/og.png` says
"Binnenkort" and was not reused.

## Data

Migration `0011`: `organizations.terms_version text null` and `organizations.terms_accepted_at
timestamptz null`. Null means "created before terms existed", which covers every seeded and
spec-0005 studio today. They are not backfilled, because nobody accepted anything. `create_studio`
gains a `p_terms_version text` argument and sets both columns in its insert. The function
refuses (`outcome = 'terms'`) when the argument is null or blank, so an unchecked box fails
closed in the database, not only in the form. The Server Function validates the box first and
passes the current version constant. Reads: none in this spec (a later "re-accept on change"
flow would read them).

## Permissions

The marketing pages are public. The only write is inside `create_studio`, which is already
bound to `app.user_id` and makes the caller owner (migration 0010). No new policy and no new
table.

## Copy

Every string goes in `apps/web/messages/{nl,en,fr}.json` under new `marketing.*` slices
(`marketing.nav`, `.home`, `.features`, `.pricing`, `.about`, `.footer`, `.legalPages`,
`.imprint`). As built they sit in the base catalogues, not a `catalogue.ts` slice -- marketing is
not an `app.*` screen -- and `messages.test.ts` holds parity. NL anchors, to be refined in the
build:

| Key | nl | en |
|---|---|---|
| `marketing.home.headline` | Plan elke trouw vanuit één plek — niet vanuit Excel en WhatsApp. | Plan every wedding from one place — not from Excel and WhatsApp. |
| `marketing.cta.start` | Gratis starten | Start free |
| `marketing.cta.demo` | Plan een demo | Book a demo |
| `marketing.pricing.exclVat` | excl. btw | excl. VAT |
| `marketing.pricing.earlyAccess` | Tijdens de early access is alles gratis. We laten het je ruim op voorhand weten voor we iets aanrekenen. | Everything is free during early access. We'll tell you well in advance before we charge anything. |
| `signup.studio.terms` | Ik ga akkoord met de {terms} en de {dpa}. | I accept the {terms} and the {dpa}. |

Legal texts are long-form. They live as per-locale content modules, not as message keys, and
parity is a type: `LegalText` is `Record<Locale, LegalDoc>`, so a missing locale does not
compile (as built; a test was the first plan).

## Not in scope

| Not building now | Why, or which phase it belongs to |
|---|---|
| Blog / resources | Later, if SEO earns it |
| Analytics | None at launch. A later one must be cookieless (Plausible or Umami) to keep "no banner" true |
| `withguestnote.com` | Apex `guestnote.be` only. `session-hint` CORS names one origin; the second domain redirects later |
| Testimonials | None exist yet, and none are invented |
| Waitlist form in the app | Replaced by sign-up plus mailto |
| Re-accepting changed terms | The columns make it possible, but the flow comes when the terms first change |
| Fixing VAT in `pricing.ts` | Belongs to the billing provider (spec 0005 "Still open") |
| Production deploy and apex cutover | `infra/README.md` runbook, gated on the operator details |
| Legal review | Declined by the user, recorded above |

## Done means

- [x] `.impeccable/surfaces/marketing.md` brief written before the pages
- [x] All 11 pages render in nl/en/fr at their translated slugs. A wrong-locale slug 404s, and the switcher lands on the counterpart page
- [x] Mini-UIs built from `@guestnote/ui`, animated, with a static final frame under reduced motion
- [x] Pricing numbers come from `quote()`: a test fails when the card stops following it (mutation-checked)
- [x] The imprint and footer line are hidden while operator config is unset, and render every field when set (both tested)
- [ ] Migration 0011 applied locally (done) and on staging (CI applies it on push). `create_studio` refuses without a terms version (mutation-checked), and sign-up's Studio step has the checkbox (component test)
- [x] `robots.ts`/`sitemap.ts` in place, matcher and invariant 12 updated, `proxy.test.ts` covers them (mutation-checked)
- [x] Every marketing page prerenders static (`npm run build -w @guestnote/web` output)
- [ ] Lighthouse on staging apex: accessibility ≥ 95, SEO 100 except `is-crawlable`, which staging fails by design; `/robots.txt` and `/sitemap.xml` return 200 there
- [x] `infra/README.md` cutover checklist gains "operator details set", and CLAUDE.md "Deployment status" still tells the truth
- [ ] `npm run check` (green), `npm run test:db` tier 1 (green, 633) and tier 2 on Neon (after 0011 reaches it)

## Still open

- **The legal texts promise processes that are manual today.** A data export within 30 days of
  the end, deletion within 90, a 48-hour breach notice, 30 days' notice of a new subprocessor:
  none has a tool behind it, so each is a job for the operator when it happens. There is no
  account-deletion flow and no purge of `mail_deliveries`; the privacy page's retention periods
  are commitments, not mechanisms.

- **The operator's details:** the KBO number, address (home or domiciliation) and VAT
  exemption. It blocks the cutover, not the build.
- ~~Neon's region~~ -- settled 2026-09-27: `aws-eu-central-1`, read from the Neon API.
- ~~The display typeface~~ -- settled 2026-09-27 by the brief: Fraunces, headlines only.
- ~~How robots/sitemap answer off the apex~~ -- settled: see "SEO", as built. Both are
  `private` at the edge until the CloudFront cache key includes the host (research/05 M1b).
- **`hello@guestnote.be` must exist.** Every page and legal text names it; ADR 0005 records only
  `joren@` and `info@` on Zoho. Create the alias before the cutover.
- **Migrations run before the deploy**, so for ~2.5 minutes of a deploy the old Lambda calls a
  `create_studio` signature 0011 dropped and sign-up errors. Harmless on staging; the first
  signature change after production has users needs a shim.
