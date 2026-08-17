# Strategy, verdict, naming and money

Companion to `01-market-and-competitors.md`. This is the opinionated part.

---

## 1. Is this a good idea? — Verdict

**Yes, but not the version you described.** Two things are true at once:

**The good news.** You have an unfair advantage almost nobody entering this market has:
a real wedding planning business (S'e parti) with real paying couples, a codebase that
*already* does multi-tenant weddings on isolated AWS stacks, and a live wedding of your
own to dogfood on. Adding wedding #2 in `se-parti-rsvp` is already a 2-file change plus
a `cdk deploy`. Most people entering this market are starting at zero on both the
distribution side and the product side. You're starting mid-way on both.

**The bad news, stated plainly.** B2C wedding software is a structurally bad business:

1. **100% churn by design.** Every customer leaves after their wedding and never comes
   back. There is no expansion revenue, no renewal, no compounding ARR. You re-earn
   your entire revenue base every single year.
2. **Word of mouth is weak** — your happiest customer's friends are mostly *already
   married or not engaged*. Referral loops are slow and lossy.
3. **The price ceiling is set at €99** by Forever and Ever, and they ship more features
   than you do today (seating chart, checklist, photo album, guestbook, drag-and-drop
   editor, memory page). Weddamo undercuts at €69.
4. **The free tier is world-class and free forever.** Joy raised $108M to give couples a
   beautiful site for €0, funded by registry kickbacks. You cannot out-price free.
5. **SEO is owned.** "trouwwebsite maken" is dominated by players who have been building
   content for years. Paid acquisition against a €99 one-off LTV is brutal — you'd need
   CAC under ~€30 to work, which is very hard in a keyword this commercial.

**So: don't enter as "another €99 trouwwebsite."** Enter as the **B2B tool for wedding
professionals in the Benelux**, with the couple-facing product as the visible artefact.
That flips every problem above:

| Problem in B2C | How B2B fixes it |
|---|---|
| 100% churn | Planners stay for years and bring 10–40 weddings each |
| Weak word of mouth | Planners talk to each other constantly — tight, gossipy industry |
| €99 price ceiling | Planners pay €39–99/**month** for something that saves them hours per wedding |
| Free competition | Joy/Zola have no planner-facing multi-wedding product at all |
| SEO owned | You don't need SEO — you need ~30 phone calls to Flemish planners |

And critically: **the CRM tools (HoneyBook, Aisle Planner, Dubsado) don't produce a
beautiful guest-facing wedding site, and the site builders don't do planner workflows.**
That gap is the whole business.

---

## 2. Should it be separate from S'e parti? — Yes, and here's why it matters

Your instinct is right, for a reason that's sharper than "cleaner branding":

> **If the product is branded as S'e parti's tool, no competing wedding planner will
> ever buy it.**

A planner in Antwerp is not going to hand their couples a product stamped with a rival
Belgian planner's name. That single fact decides the structure. Separate brand, separate
domain, separate entity, neutral positioning.

### How the two businesses relate

```
   S'e parti (planning agency)          NEW BRAND (software)
   ─────────────────────────────        ────────────────────
   Sells planning packages       ──────► "+ your wedding website included"
   Customer #1, reference case   ──────► credibility, screenshots, testimonials
                                 ◄────── discount code for S'e parti clients
   Recommends vendors            ◄────── "planners who use us" directory listing
```

Concretely:
- **S'e parti gets** a differentiator ("a personal wedding website is included in our
  package") and can bundle it at a discount. That is a real reason to pick S'e parti
  over another planner.
- **The software gets** customer zero, a portfolio of live sites to show, and a founder
  who genuinely understands planner workflow.
- **Keep the money clean.** S'e parti *buys* licences from the software company at a
  partner rate, and resells or includes them. Separate invoices, separate bank account.
  Do this from day one — it's much harder to untangle later, and it's what makes the
  product credibly neutral.
- **Cross-marketing, yes** — but as an arm's-length partnership, not a shared identity.
  A "trusted partners" link each way. Never a shared logo lockup.

### On the "discount if you go with S'e parti" idea

Do it, but frame it as **S'e parti includes it**, not "software company gives S'e parti
customers a discount." The second version tells every other planner that S'e parti gets
preferential treatment. The first is just a planner bundling a tool — which is exactly
what you want every other planner to do too.

---

## 3. Naming

> **SUPERSEDED — resolved 2026-08-10: the name is GUESTNOTE.**
> Everything in this section is the *first* pass and its recommendations are stale:
> `Ceremo` turned out to collide with an unlaunched product and a Japanese funeral
> company, and `Vowly` with five existing wedding companies. The constraint also changed
> — Joren later dropped French and asked for Dutch + English.
> **See `03-name-candidates.md` for the full exercise and the final decision.**

### Constraints you actually have
- Must work in **Dutch and French** (Belgium), ideally English (expansion).
- Must survive being spelled over the phone to a 60-year-old venue manager.
- Must **not** sound like a sub-brand of S'e parti — no "parti", no shared French pun.
- `.com` is essentially gone for anything wedding-adjacent. `.be` + `.nl` is fine for a
  Benelux product; `.app` / `.wedding` are acceptable modern fallbacks.

### Availability checked 2026-08-09 (verify before buying — this moves fast)

| Name | `.be` | `.nl` | `.com` | Read |
|---|---|---|---|---|
| **Vowly** | ✅ free | ✅ free | taken | Short, English, brandable, SaaS-sounding. Both Benelux TLDs free — rare. Weak in French. |
| **Ceremo** | ✅ free | ✅ free | taken | Neutral in NL/FR/EN ("ceremonie"/"cérémonie"). Serious, works B2B. Both TLDs free. |
| **Ouiday** | ✅ free | ✅ free | taken | FR "oui" + EN "day". Very Belgian-bilingual. Slightly cute for B2B. |
| **Feestlijk** | ✅ free | ✅ free | taken | Warm, native Dutch — but Dutch-only, dead in Wallonia, and "feest" pulls it toward parties generally. |
| Wedwise | ✅ free | taken | taken | Clear but generic, and `.nl` gone. |
| Invitely | ✅ free | taken | taken | Nice but invitation-only positioning; boxes you in. |
| Grandjour | ✅ free | — | taken | "le grand jour" — lovely in FR, opaque in NL. |
| Confetta / Aisly / Toastly / Ohoui / Yesday | ✅ free | taken | taken | All viable, all with `.nl` gone. |
| trouwly / bruiloftly / huwelijkje | ✅ free | taken | **✅ free** | Dutch-only, and Dutch-diminutive names read cheap in B2B. Avoid. |
| jawoord, dedag, onzedag, trouwlijn, guestly, jawel, sparkel, nuptia, bloomday | ❌ taken | | | Off the table. |

### My recommendation

**`Ceremo`** — `ceremo.be` + `ceremo.nl` both free, reads correctly in all three Belgian
languages, sounds like a product a professional would put on an invoice, and doesn't
lock you to weddings-only if you later expand to other events (which the venue channel
will pull you toward). **`Vowly`** is the better name if you're certain you're
weddings-only and English-leaning; it's the stronger consumer brand of the two.

Whichever you pick: **register `.be` + `.nl` together**, same day. The `.nl` being free
alongside `.be` is the scarce part and it's why these two rose to the top.

---

## 4. How to make money — the concrete plan

### Pricing I'd actually launch with

**Couples (via a planner, or direct)**
| Tier | Price | Contents |
|---|---|---|
| Gratis | €0 | Save-the-date one-pager, subdomain, up to 25 guests. Exists to get the site live and shared — it's your distribution, not your revenue. |
| Compleet | **€149 one-off** | Full site, unlimited guests, RSVP + per-event + guest groups, custom domain, reminders, exports, guestbook, photo album. Prices *above* Forever and Ever's €99 — justified by multilingual + planner-grade polish. Do not race to the bottom. |
| Compleet+ | **€249 one-off** | Adds seating chart + place-card/caterer exports, transport & hotel sign-up, day-of timeline for vendors, priority support. |

**Professionals — this is the real business**
| Tier | Price | Contents |
|---|---|---|
| Planner | **€49/mo** or €490/yr | Up to 10 active weddings, your logo + your domain on client sites, multi-wedding dashboard, your name in the guest emails. |
| Studio | **€99/mo** | Unlimited weddings, team seats, template library, CSV/vendor exports, white-label emails. |
| Venue | **€199/mo** | Everything above + venue-branded templates, floorplan-aware seating, direct catering export. |

Rationale: a planner charging €2,000–5,000 per wedding will not blink at €49/month for
something that removes the guest-list spreadsheet from their life. Their alternative is
HoneyBook at $36–59/mo, which doesn't even give their couples a website.

### Revenue ladder (later, in order)
1. **Guest photo album** upsell — €29. Cheap to build on S3/CloudFront, high attach rate.
2. **Matched printed stationery** — partner with a print-on-demand shop, take 20–30%.
   Belgian couples spend €300–800 here; this can exceed your software revenue per couple.
3. **Cash / honeymoon fund** with Bancontact + iDEAL via Mollie or Stripe Connect.
   Real money in a cash-gift culture. **Never hold the funds yourself** — use a licensed
   PSP's Connect product so you stay out of payment-institution regulation.
4. **Vendor directory** — only once you have meaningful couple traffic. Years out.

### What break-even looks like

Your AWS-per-wedding cost is near zero (Lambda + Neon + S3 + CloudFront on tiny
traffic; SES is fractions of a cent per email). So essentially all revenue is margin,
and the only real costs are your time and domains. Auth is self-hosted Better Auth at €0
— see `07-auth-and-tenancy.md`.

- **20 planners on €49/mo = €11,760/yr recurring** — a meaningful side business.
- **50 planners + 300 direct couples = €29,400 + €44,700 ≈ €74,000/yr** — that's a
  real one-person company in Belgium.
- **Add 3 venues at €199/mo = +€7,164/yr** and the venue-driven couple volume behind it.

That's the honest ceiling shape: **a strong one- or two-person business, not a startup
you raise money for.** Which is fine — just decide that on purpose rather than
discovering it in year three.

---

## 5. What you'd need to build (and what you already have)

### Already done, and it's a lot
- Multi-tenant wedding architecture, one isolated AWS stack per wedding (CDK)
- Per-wedding config as single source of truth, theme/colour/font injection
- RSVP flow: guest search by name, attendance, allergies, generic `extraQuestions`
- Couple admin dashboard, Clerk org-scoped per wedding
- SES confirmation emails on a verified domain
- Wildcard cert + Route53, `<slug>.se-parti.be` subdomains
- `/add-wedding` skill + `ADD_A_WEDDING.md` — a repeatable onboarding runbook

### The gap between that and a sellable product
The honest summary: **you have a bespoke-site factory, not a SaaS.** Every new wedding
today is a code change, a commit and a `cdk deploy` by you. That's excellent for an
agency add-on and impossible as a product. The single biggest piece of work is turning
the per-wedding config file into **data in a table, edited through a UI**, and collapsing
one-stack-per-wedding into **one shared stack with tenant-scoped rows**.

Priority order:

1. **Config → database.** `shared/src/weddings/*.ts` becomes rows. No deploy to add a
   wedding. This is the prerequisite for literally everything else.
2. **Single multi-tenant stack.** One DynamoDB table partitioned by `weddingId`, one
   Lambda, one CloudFront with wildcard subdomains. One stack per wedding will not scale
   past ~20 weddings (CloudFormation limits, deploy time, cost, and your sanity).
3. **Self-serve onboarding.** Sign up → pick a template → fill a form → site is live.
   No Joren in the loop. This is the actual moment it becomes a business.
4. **Editor UI** for the couple: text, photos, colours, sections. Table stakes.
5. **Guest-group / personal links** — day vs evening guests seeing different content.
   Forever and Ever has this; you need it.
6. **Multilingual** — per-guest language for RSVP + emails. Your best local moat.
7. **Reminder emails** to non-responders. Trivially valuable, easy win.
8. **Planner dashboard** — the multi-wedding view. This is the B2B product.
9. **Payments** — Mollie (Bancontact/iDEAL) or Stripe. Needed before self-serve.
10. **Seating chart** — the highest-perceived-value premium feature.
11. Templates: at least 5–6 genuinely distinct, genuinely beautiful ones. Design quality
    *is* the product in this market; do not under-invest here.

`emma-joren` stays exactly what it is: your own site, your feature lab. Anything that
proves itself useful there earns a promotion into the product.

---

## 6. Biggest risks, named

| Risk | Mitigation |
|---|---|
| **Free competitors (Joy, Zola)** — beautiful, free, funded | Compete on Benelux specifics they'll never build: NL/FR bilingual, Bancontact/iDEAL, day-vs-evening guest structure, and a planner-facing product. Don't compete on price with free. |
| **100% annual churn in B2C** | Make B2B the revenue backbone. Planners renew; couples never do. |
| **Design quality gate** | This market buys on looks. If the templates aren't genuinely beautiful, nothing else matters. Budget real money for a designer — this is the one place not to DIY. |
| **You are the bottleneck** | Nothing ships until per-wedding config is data, not code. Treat items 1–3 above as non-negotiable before any selling. |
| **Conflict of interest with S'e parti** | Separate entity, separate brand, arm's-length partner pricing from day one. |
| **GDPR** — you're processing guest names, emails, dietary/allergy data (health-adjacent) | You are a processor for the couple/planner. Need a DPA template, a retention policy (auto-delete N months post-wedding), and an EU-only region (you're already in eu-central-1). Not optional in BE. |
| **Time** — you have a full-time job and your own wedding in July 2027 | Sequence around it. Your wedding is a feature, not a distraction: it's the dogfood deadline. |

---

## 7. What I'd do in the next 90 days

**Weeks 1–2 — Validate before you build.**
Call or email **15 Flemish wedding planners** and **5 venues**. Not a pitch — a question:
*"How do you handle guest lists and RSVPs for your couples today, and what does it cost
you in hours?"* If 5+ of them describe a spreadsheet nightmare and ask what you're
building, you have a business. If they shrug, you have a hobby — and you'll have learned
that for the price of 20 emails instead of six months of code. S'e parti gives you a
legitimate reason to be in that conversation.

**Weeks 3–4 — Decide and register.**
Pick the name, register `.be` + `.nl` the same day, set up the entity (or at least a
separate bank account and invoicing under your existing structure). One landing page
with a waiting list and honest screenshots from the live weddings.

**Weeks 5–12 — Build only items 1–3.**
Config-to-database, single multi-tenant stack, self-serve onboarding. Nothing else.
Resist the seating chart; it's more fun and less important. The goal at day 90 is that
**a stranger can create a live wedding site without you touching a keyboard.**

Then: onboard 3 planners at a discount in exchange for weekly feedback and permission to
use their weddings as portfolio pieces. Your own wedding in July 2027 is the deadline
that keeps the whole thing honest.

---

## 8. Open questions for Joren

1. How many couples does S'e parti actually serve per year? That number sets whether the
   in-house channel is a real launch pad or just a reference case.
2. Do you want a real company (register a BV/VOF, invoice properly) or a side project
   under an existing structure? This changes the timeline more than any technical choice.
3. Realistically, how many hours/week can you give this alongside your job and the 2027
   wedding? Be conservative — the plan above assumes ~8–10.
4. Belgium-only first, or Benelux from day one? Belgium-only lets you be bilingual and
   deeply local; NL is 40% more weddings but a crowded, price-anchored market.
5. Are you willing to pay a designer for 5–6 templates? I'd argue this is the highest-ROI
   euro you can spend, and the one thing you can't substitute engineering for.
