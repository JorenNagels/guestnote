# Speclist — what Guestnote is, feature by feature

Written 2026-08-11, before the planner validation calls. This is the artefact to walk a
planner down on a call — not a pitch, a list they can react to.

Derived from the table-stakes checklist in `01-market-and-competitors.md` §5 and the
priority order in `02-strategy-and-verdict.md` §5. Every unticked item in those documents
appears here or in **Parked** with a reason.

**Legend**

| | |
|---|---|
| **Personas** | 👥 Guest · 👰 Couple · 🎩 Planner · 🏛 Venue · ⚙️ Ops |
| **Effort** | **S** under a day · **M** one weekend · **L** 2–3 weekends · **XL** a month or more |

**Tiers**

- **T0 Foundation** — invisible to customers, gates everything else
- **T1 MVP** — the day-90 goal: a stranger creates a live site with no developer involved
- **T2 v1 launch** — completes the table-stakes list competitors already ship
- **T3 Differentiators** — where Guestnote actually wins in the Benelux
- **T4 Revenue ladder** — upsells, in the order they should arrive

---

## T0 — Foundation

Nothing in T1 is possible until these exist. These are the three blockers named in the
README, plus the plumbing they imply.

| ID | Item | Effort | Notes |
|---|---|---|---|
| **F1** | **Tenant config as database rows, not TypeScript files** | L | Kills `se-parti-rsvp/shared/src/weddings/*.ts`. Adding a wedding stops being a commit. Prerequisite for literally everything else |
| **F2** | **Single multi-tenant stack, tenant resolved from the Host header at request time** | L | One CloudFront, one Lambda, one database, wildcard `*.guestnote.be`. Replaces one-CDK-stack-per-wedding, which dies around 20 weddings |
| **F3** | Org / user / role model with invitations | M | Planner org → team seats → weddings → couples. A direct couple gets their own org, so there is exactly one code path |
| **F4** | Template rendering driven by content blocks in the database | L | The editor preview and the live guest site must share components, or they will drift |
| **F5** | Deploy pipeline, migrations in CI, rollback runbook | M | |
| **F6** | Cross-tenant isolation test suite | S | For every tenant table, assert a query under tenant A returns zero of tenant B's rows. ~50 lines, and the highest-value test in the repo |

---

## T1 — MVP

The bar: **a stranger signs up and has a live wedding site without Joren touching a keyboard.**

### Guest-facing 👥

| ID | Item | Effort | Notes |
|---|---|---|---|
| G1 | Wedding site: hero, countdown, story, venue + map, timeline, dress code, practical info | L | Most of this already exists in `se-parti-rsvp` and is portable |
| G2 | Mobile-first everything | — | Not a feature, a constraint. Most guests RSVP on a phone, often on 4G |
| G3 | RSVP via personal household link: attendance, dietary preferences, free-text note | L | The revenue-critical path |
| G4 | Per-event RSVP — ceremony / dinner / party | M | Guests attend different parts. Today's single yes/no is not enough |
| G5 | Name-lookup fallback for guests who lost their link | S | Real support-load reducer. Strict matching + rate limits + opt-out per wedding |
| G6 | Confirmation email to the guest | M | Exists today; needs to become per-tenant themed and translated |
| G7 | QR code for the paper invitation | S | The dominant Benelux pattern is a paper invite with a QR to the RSVP |
| G8 | FAQ block | S | |
| **G9** | **Plus-ones** — a guest invited "+1" names their partner on the RSVP | M | Table stakes everywhere; **`se-parti-rsvp` has no plus-one concept at all**, households are pre-known only. Needs `guests.plus_one_of` and a per-guest "may bring a guest" flag |
| G10 | Meal choice as a per-guest select (chicken / fish / vegetarian) | S | Distinct from dietary preferences — this is the caterer's menu. Falls out of the `questions` table for free once V6 exists; ship a built-in version at MVP |

### Couple / Planner 👰🎩

| ID | Item | Effort | Notes |
|---|---|---|---|
| C1 | Guest list dashboard: statuses, filters, sorting, households | M | Port `se-parti-rsvp/frontend/src/components/dashboard/DataTable.tsx` |
| C2 | Add / edit / delete guests; CSV import and export | M | CSV import is how a planner onboards 150 guests in one go. Do not skip it |
| C3 | Generate and send invitation links | M | |
| C4 | Site editor: text, photos, colours, section order | L | Table stakes. Every competitor has a drag-and-drop editor |
| C5 | Template picker — 2–3 at MVP | M | |
| C6 | Draft → preview → publish | M | |
| C7 | Notification to the couple when someone responds | S | |

### Self-serve ⚙️

| ID | Item | Effort | Notes |
|---|---|---|---|
| S1 | **Sign up → create org → pick template → 6-field form → live subdomain** | M | **The day-90 goal.** Needs a reserved-subdomain list (`www`, `pro`, `api`, `app`, `mail`, `admin`, `cdn`, `static`, `blog`, `help`, `status`) |
| S2 | Password protection / private site | S | Table stakes; some couples insist |
| S3 | NL + EN interface and guest-facing copy | M | FR follows in V3 |

---

## T2 — v1 launch

Everything a competitor already ships. Anything unticked here is a reason a couple picks
Forever and Ever or Weddamo instead.

| ID | Item | Persona | Effort | Why it's here |
|---|---|---|---|---|
| **V1** | **Reminder emails to non-responders** | 👥👰 | M | Trivially valuable, easy to build, universally requested |
| **V2** | **Guest-group-scoped content** — day vs evening guests see different sections | 👥 | M | Forever and Ever has it. Day/evening/ceremony-only is a very Benelux structure |
| **V3** | **Per-guest language (NL/FR/EN)** across site, RSVP and emails | 👥 | L | Weddamo charges €139 for a *second* language. Belgium is bilingual by default — **this is the best local moat available** |
| **V4** | **Planner multi-wedding dashboard** | 🎩 | L | **This is the B2B product.** Nobody in the Benelux has one |
| **V5** | **White-label** — planner logo, name and reply-to on client sites and emails | 🎩🏛 | M | The thing they are actually paying for |
| V6 | Custom RSVP questions, editable through the UI | 👰🎩 | M | Port the dynamic-Zod-from-config pattern in `se-parti-rsvp/lambda/src/lib/validation.ts` |
| **V7** | **5–6 genuinely distinct, genuinely beautiful templates** | 👰 | XL | **Budget a designer.** This market buys on looks. If the templates aren't beautiful, nothing else on this list matters |
| V8 | Gift / registry section | 👥 | S | |
| V9 | Accommodation & travel info block | 👥 | S | |
| V10 | Guest self-service — change your answer via the same link | 👥 | S | Removes a whole category of support email |
| V11 | Payments — Mollie checkout + planner subscriptions | ⚙️ | L | Required before self-serve is a real business |
| V12 | Team seats for planner agencies | 🎩 | M | |

---

## T3 — Differentiators

Gaps nobody in the Benelux fills well. This is where the product stops being a commodity.
**Which of these a planner names first, unprompted, is the single most valuable thing the
validation calls can tell you.**

| ID | Item | Persona | Effort | Why |
|---|---|---|---|---|
| D1 | **Seating chart** reading live RSVP data | 👰🎩 | XL | Highest perceived value in the market. Also the most fun to build and the least urgent — resist it until T2 is done |
| D2 | Place-card PDF + caterer export from the seating chart | 🎩 | M | The part planners will actually pay for |
| D3 | **Dietary aggregation → one caterer-ready export** | 🎩🏛 | S | Nobody automates this. Cheap to build, disproportionately loved. Best effort-to-delight ratio on the whole list |
| D4 | Shuttle bus sign-up with capacity limits | 👥🎩 | M | Practical logistics nobody automates |
| D5 | Hotel room block sign-up | 👥 | M | |
| D6 | Guest photo upload + shared album, QR code at the tables | 👥 | L | Also the first upsell (R1) |
| D7 | Guestbook / well-wishes | 👥 | S | |
| D8 | Day-of timeline, shareable with vendors | 🎩🏛 | M | Pure planner workflow. A CRM feature that no site builder has — this is the gap the strategy identified |
| D9 | Venue-branded templates + floorplan-aware seating | 🏛 | L | Unlocks the €199/mo venue tier. One venue signature = 50+ couples |
| D10 | Template library planners can save and reuse | 🎩 | M | Makes the tool stickier the longer a planner uses it |

---

## T4 — Revenue ladder

In the order they should arrive, per `02-strategy-and-verdict.md` §4.

| ID | Item | Price | Effort | Notes |
|---|---|---|---|---|
| R1 | Guest photo album upsell | €29 | D6 + a paywall | Cheap on S3/CloudFront, high attach rate |
| R2 | Post-wedding thank-you / memory page | included | S | Keeps the site alive past the wedding date |
| R3 | **Custom domains** (`www.jan-en-els.be`) — Studio tier | upsell | L | Deferred from v1 on purpose — see the architecture doc |
| R4 | Matched printed stationery via a print-on-demand partner | 20–30% of €300–800 | partnership | Belgian couples spend real money here. This can exceed software revenue per couple |
| R5 | Cash / honeymoon fund with Bancontact + iDEAL | 1–2% | L + compliance | |
| R6 | Budget tracker + checklist | included | L | |

> ⚠️ **R5: never hold the funds yourself.** Holding third-party money makes you a regulated
> payment institution. Use Mollie or Stripe Connect, or don't ship it.

---

## Parked — deliberately not building

| Item | Why not |
|---|---|
| Vendor marketplace / directory | The Knot's whole business, but it needs traffic you won't have for years |
| Native mobile app | A good PWA is enough. Guests will not install an app to RSVP |
| AI features | Nobody buys a wedding site for the AI |
| SSO / SAML | Until an actual venue group asks. Both Better Auth and Clerk add it later |
| Multi-region / DR | Automated backups plus a **tested** restore runbook is the correct level of paranoia. Actually test the restore once |

---

## Pricing this maps onto

From `02-strategy-and-verdict.md` §4 — repeated here so the tiers line up with the features.

**Couples**

| Tier | Price | Contents |
|---|---|---|
| Gratis | €0 | Save-the-date one-pager, subdomain, up to 25 guests. Distribution, not revenue |
| Compleet | €149 one-off | T1 + T2 |
| Compleet+ | €249 one-off | Adds D1, D2, D4, D5 |

**Professionals — the real business**

| Tier | Price | Contents |
|---|---|---|
| Planner | €49/mo | Up to 10 active weddings, V4, V5, V12 |
| Studio | €99/mo | Unlimited weddings, D10, R3 (custom domains), white-label email |
| Venue | €199/mo | Everything + D9 |

---

## What the validation calls should settle

Leave these open until the ~15 planner and 5 venue calls are done. Each one changes the spec:

1. **Which T3 item do they name first, unprompted?** That is your real roadmap, not this list.
2. Do they want to **white-label** (their brand, tool invisible) or **co-brand** (visible
   "powered by Guestnote")? V5 is built differently for each.
3. Do they **charge their couples** for the site, or absorb it into their package? Decides
   whether the planner tier is per-seat or per-wedding.
4. **How many weddings per year each?** Sets whether "10 active weddings for €49/mo" is the
   right shape or wildly off.
5. Is **French** a launch requirement or a Wallonia-expansion feature? V3 is an L; if FR can
   wait, T2 gets meaningfully shorter.
6. What do they use **today**, and what does it cost them in hours? If five or more describe a
   spreadsheet nightmare, this is a business. If they shrug, it's a hobby — and you learned it
   for the price of 20 emails.
