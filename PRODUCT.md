# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Design Scope

Two of the three hosts served by `apps/web`:

- **`app.guestnote.be` — the planner application.** The PH0–PH3 product in
  `research/09-planner-app.md`. Currently a token-proof placeholder at
  `apps/web/src/app/pro/page.tsx`.
- **`guestnote.be` — the marketing apex.** `apps/web/src/app/(marketing)/[locale]/`,
  today a placeholder; `coming-soon/index.html` is what actually serves the apex until
  there is real copy.

`<slug>.guestnote.be` — the per-tenant guest wedding sites — is a **known PH4 surface,
not in scope now**. Its route is a stub, and `design-system/theme-contract.ts` holds the
parked per-wedding theme work. Do not design it, and do not let planner-app decisions
foreclose it.

## Users

**Primary: the professional wedding planner in Flanders (🎩).** Runs 10–40 weddings a
year, charges €2,000–5,000 per wedding, and today coordinates them in spreadsheets and
WhatsApp. Works from a laptop at a desk between weddings, and from a phone on site on
the day. The job: know what is due, across every wedding, without opening twelve files.

**Secondary, confirmed and in the build:**

- **The couple (👰).** Logs in perhaps six times a year to their own wedding only, sees
  only shared tasks and the budget. Never an org member — `wedding_members` carries them.
- **The venue (🏛).** Same planner workflows at higher volume; a distinct paid tier.
- **The vendor (🤝).** Sees one slice of one run sheet. Occasional to the point of
  near-anonymity; may not get an account at all.
- **The wedding guest.** Never gets an account, ever — signed household links only. Out
  of scope until PH4.

## Product Purpose

Guestnote is the tool a wedding planner runs their weddings in, and the wedding website
plus RSVP their couples get as the visible artefact of it. Planner-side: weddings as
records, a shared task engine with due dates anchored to the wedding date, checklist
templates, budget, payment schedule, vendor directory, day-of run sheet, and "due this
week" across every wedding. Couple-side (PH4): the wedding site and RSVP.

**Success is one sentence:** a planner runs one real wedding entirely in Guestnote
instead of a spreadsheet. That is the PH1 gate and it is the goal, not a milestone on the
way to one.

## Positioning

The gap is **the intersection**, and it is the whole business: the planner CRMs
(HoneyBook, Aisle Planner, Dubsado, Planning Pod) do not produce a guest-facing wedding
site, and the site builders (Joy, Zola, Forever and Ever, Weddamo) have no planner-facing
multi-wedding product. Guestnote is one product that is both, sold B2B-first to planners
and venues as a white-label tool they hand to every client, and directly to couples as a
one-off.

Two claims a neighbouring product cannot truthfully copy today:

- **"Due this week" across every wedding.** Nobody in the Benelux has the multi-wedding
  planner dashboard.
- **NL + FR + EN as a property of the platform, not a paid add-on.** Weddamo charges €139
  for a *second* language. The interface ships trilingual from day one.

**The competitor to beat is not software. It is Excel and WhatsApp.** That sets the bar
absolutely: anything slower to use than a spreadsheet loses.

Guestnote is a **separate business from S'e parti**, deliberately. A planner in Antwerp
will not hand their couples a product stamped with a rival Belgian planner's name.
Cross-marketing happens at arm's length — a trusted-partner link each way, never a shared
logo lockup, never a shared identity.

## Operating Context

- **The incumbent workflow is a spreadsheet and a group chat.** Every screen is measured
  against how fast the same thing is in Excel.
- **A planner opens this daily or not at all.** "Due this week" across weddings is what
  makes it daily; that screen carries the retention.
- **Assignment is the feature.** A shared checklist nobody owns is just a document. Every
  task is assigned to the planner or to the couple.
- **Tasks carry `visibility`.** Planners keep internal tasks the couple must never see —
  chasing a late invoice, checking a margin. This exists from the first migration, not
  from the day the couple portal ships.
- **The budget is fully shared with the couple.** Decided 2026-08-14: the planner's fee is
  either outside the budget or simply another line, so there is no margin to hide.
- **Printing and offline are real.** Planners live in PDFs on site with no signal, and
  venue printouts are black and white — so status must never be carried by colour alone.
- **Density is a requirement, not a preference.** A 300-guest list and a dozen weddings are
  the normal case; `[data-density="compact"]` switches row height, cell padding and control
  height together (44px / 32px).
- **The day-of surface is a phone.** Deliberately responsive web, not a native app.

## Capabilities and Constraints

**Confirmed functionality** (`research/09-planner-app.md`, phases PH0→PH4):

| Phase | What it is |
|---|---|
| PH0 | Wedding as a first-class record · orgs, roles, wedding-scoped invitations · task engine · task comments · cross-tenant isolation tests |
| PH1 | Shared assigned checklist · couple portal · wedding-date-anchored due dates · checklist templates · assignment and weekly-digest email |
| PH2 | Budget · payment schedule · vendor directory · day-of run sheet · files per wedding |
| PH3 | "Due this week" across every wedding · reusable template library · vendor's own run-sheet slice · run-sheet PDF and budget CSV export · team seats |
| PH4 | The wedding site + RSVP product folded in (all of `research/04-speclist.md`) |

**Deliberately not building:** contracts and e-signature, invoicing/accounting, a lead
pipeline or sales CRM (Guestnote starts once a couple is *booked*), moodboards, and a
native mobile app.

**Technical constraints that bind design:**

- **Three root layouts, no shared `app/layout.tsx`.** The surfaces share no `lang`, no
  fonts and no token scope; a shared root would ship the dashboard's tokens to every
  guest's phone.
- **Tenancy is the one thing that cannot be retrofitted.** One Postgres database scoped by
  `org_id` + `wedding_id`, RLS forced on every tenant table, `withTenant()`. `npm run
  test:db` is the gate.
- **Cache posture differs per host** and is asserted: marketing `public, s-maxage=60,
  swr=86400`; the dashboard `private, no-store`.
- Next.js 16 App Router · Neon Postgres + Drizzle · Better Auth self-hosted · Tailwind v4
  with shadcn/ui token names · OpenNext on Lambda + CloudFront, `eu-central-1`, **not yet
  deployed**.
- **`packages/db/src/schema/*.ts` is the authoritative schema.** Where the research docs
  disagree with it, the schema wins.

**Terminology** (use these words; they are the schema's words too): org · wedding ·
`org_members` (staff) vs `wedding_members` (the couple, editors, vendors) · task
`visibility` shared / internal · budget line · run sheet · household link · tenant.

**Explicitly undecided:**

- Belgium-only vs Benelux at launch.
- Legal entity vs side project under an existing structure.
- Whether the couple gets an email code every time or something longer-lived. The planner
  side settled 2026-08-18: passkey primary, six-digit email code beneath it, no password and
  no magic link. The couple's answer is expected to follow, but is not decided.
- Whether vendors get accounts at all, or a signed link like guests.
- How many professional wedding planners actually exist in Flanders — the single number
  that decides whether planner-seat or per-wedding pricing is right.
- Whether couple-facing views are the same UI scoped down or a separate surface.
- Whether the planner dashboard is ever white-labelled (currently no — white-label is
  scoped to client sites and emails). The planner's own uploaded logo still needs a
  neutral, bounded slot in the org switcher.
- The dashboard typeface. Inter sits in the tokens as a safe default and is acknowledged
  as the most generic choice available; revisit alongside the PH4 template designer.

## Brand Commitments

- **Name: Guestnote**, decided 2026-08-10 from ~600 domain checks. Chosen to be
  conflict-clean, trivially spellable in Dutch and English, and **event-neutral** so it
  survives expansion into venues and non-wedding events.
- **Hosts:** `guestnote.be` (apex, primary, local trust signal) · `app.guestnote.be`
  (dashboard) · `pro.guestnote.be` (permanent redirect to `app.`) · `<couple>.guestnote.be`
  (guest sites) · `withguestnote.com` (international/product face).
- **The logo colours are not UI colours.** `--logo-teal` `#94CFC9` and `--logo-gold`
  `#D6B776` both sit at OKLCH L≈0.80 — 1.10:1 against each other, ~1.8:1 on white. Fine for
  the mark, unusable for text, borders, icons, state or series. They stay frozen; the UI
  draws from ramps on the same two hues (teal 188.1°, gold 84.9°). Asset:
  `guestnote-logo.svg`.
- **Trilingual interface: NL + EN + FR from day one**, decided 2026-08-17. Catalogues live
  in `apps/web/messages/`. Dutch is the primary market language.
- **Never a shared identity with S'e parti.** No shared logo lockup. Any cross-link is
  framed as a planner bundling a tool, never as preferential treatment.
- The founder's name belongs on the legal entity, not on the customer-facing brand.

## Evidence on Hand

**Real and usable:**

- `guestnote-logo.svg` — the mark.
- `design-system/tokens.css` and `tokens-reference.html` — 7 ramps, semantic light/dark
  layers, six RSVP status triples, a CVD-validated 5-slot chart palette, density modes.
  Every pair machine-verified, 0 failures.
- `apps/web/messages/{nl,en,fr}.json` — real trilingual catalogues (currently placeholder
  copy).
- `coming-soon/` — the live holding page for the apex, NL/EN, self-contained.
- `waitlist/` — working email capture; Lambda Function URL → DynamoDB → SNS on
  planner/venue leads.
- Two live weddings in the sibling `../se-parti-rsvp` repo (`els-en-jan`,
  `paulien-sander`) as the seed product and the source of screenshots — noting
  `paulien-sander` ships body text at **1.74:1**, which is why a publish-time contrast gate
  exists at all.

**Committed pricing** — quotable as real:

| | |
|---|---|
| Planner | €49/mo or €490/yr — up to 10 active weddings, planner's logo and domain on client sites, multi-wedding dashboard |
| Studio | €99/mo — unlimited weddings, team seats, template library, exports, white-label emails |
| Venue | €199/mo — venue-branded templates, floorplan-aware seating, direct catering export |
| Couples · Gratis | €0 — save-the-date one-pager, subdomain, up to 25 guests |
| Couples · Compleet | €149 one-off — full site, unlimited guests, RSVP, custom domain, reminders, exports |
| Couples · Compleet+ | €249 one-off — adds seating chart, place-card/caterer exports, transport and hotel sign-up, day-of timeline |

**Absent — future work must not fabricate any of it:**

- **No customers, no planner testimonials, no case studies, no partner or press logos.**
  The 15-planner / 5-venue validation round has not been run.
- **No usage, adoption, time-saved or headcount figures.** Nothing about hours saved has
  been measured.
- **No product screenshots of the planner app** — it is a placeholder; screenshots must
  come from the two live sibling weddings or be honestly labelled as mockups.
- **Nothing is deployed.** Do not imply availability, uptime, SLAs, certifications or a
  security audit.
- **No trademark clearance yet** (EUIPO/TMView classes 41 and 42 outstanding), and the
  `@guestnote` social handles are unverified.
- No app-store presence — there is no native app and none is planned.

## Product Principles

1. **Beat the spreadsheet or lose.** Excel and WhatsApp are the incumbents. Every flow is
   judged on time-to-done against them, not against other SaaS.
2. **Assignment and ownership over listing.** A task without an owner is a document.
   Surface who owes what, by when, before surfacing anything else.
3. **Status at a glance, across weddings.** The hard problem is not the brand palette; it
   is reading a dozen weddings and hundreds of guests at once. Density, alignment and
   encoding serve that first.
4. **The internal/shared boundary is sacred.** A planner's private note reaching a couple
   is the failure that ends the trust. Design so that boundary is always visible, never
   inferred.
5. **Encode meaning twice, never in colour alone.** These screens get printed in mono and
   read on a phone in bad light. Declines are neutral, not red — red is reserved for
   things genuinely broken.
6. **Trilingual and neutral by construction.** NL/EN/FR is a platform property, and the
   brand stays neutral enough that a rival planner will put their own logo on it.

## Accessibility & Inclusion

**WCAG 2.2 AA is a hard gate on every surface** — not a convention. It formalises what the
token layer already does: every semantic pair machine-verified in both light and dark, the
six RSVP status chips at 5.83–6.15:1 light and 6.92–7.09:1 dark, and a chart palette run
through a protan/deutan/tritan validator rather than eyeballed.

Two deliberate, documented calls that stand:

- **`--border` carries no contrast minimum.** WCAG 1.4.11 covers UI component boundaries,
  not decorative dividers. Light mode is 1.28:1 on purpose — a table with 3:1 gridlines is
  a spreadsheet from 1997.
- **`--input` does hold 3:1.** A field's edge is what tells you the control is there. This
  forces a darker border than is fashionable. Keep it.

Also binding:

- **Dot + label, never colour alone**, on every status. Beyond 1.4.1: planner exports get
  printed in mono, and a status column that only means something in colour is useless on a
  venue's black-and-white printout.
- **Chart series are capped honestly.** 5 slots for stacked/grouped bars and lines
  (adjacent pairs only); **3 slots** for scatter, bubble and small multiples, where every
  pair is on screen at once. Past three, facet. Assign in fixed order, never cycled.
- **Empty, loading, and filtered-to-zero are three different states with three different
  messages.** "No guests yet" and "No guests match these filters" are not the same problem.
- **Trilingual NL/EN/FR** means every string is translatable and layouts survive the length
  differences; French runs longest.
- The audience skews older on the guest and venue side — spelling a domain to a
  60-year-old venue manager was a naming constraint, and it is an interface constraint too.

**GDPR is a product constraint, not a footnote.** Guestnote processes guest names, emails
and dietary/allergy data (health-adjacent) as a processor for the couple or planner:
EU-only region (`eu-central-1`), a DPA template, and a retention policy that auto-deletes
some months after the wedding.
