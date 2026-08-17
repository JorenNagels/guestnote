# Market & competitor research — wedding website / RSVP / planning SaaS

Research date: 2026-08-09. Focus market: Belgium + Netherlands (Benelux), with the
global players included because they own the SEO and set feature expectations.

---

## 1. Market size — the honest numbers

### Weddings per year (the real unit of demand)

| Market | Weddings/year | Avg. wedding budget |
|---|---|---|
| Belgium | **48,589** (2024, +4.3% vs 2023) | ~€31,750 (2025 estimate, up from €21,339 in 2022) |
| Netherlands | **68,682** (2024) | ~€23,675 excl. honeymoon (typical range €20k–35k) |
| **Benelux total** | **~117,000** | — |

### Software market size (analyst numbers — treat as directional)

- Wedding **invitations software**: ~$312M globally (2026) → ~$719M by 2035, ~9.7% CAGR.
  (A second source says $2.39B in 2024 → $5.44B by 2034 — the definitions are mush;
  the order of magnitude that matters is "hundreds of millions globally", not billions.)
- Wedding **planning apps**: ~$1.07B (2026) → ~$4B by 2035, ~15.5% CAGR.
- Analysts flag **RSVP management as the fastest-growing sub-category** — couples
  prioritising real-time headcount accuracy.

### What that means for *you* (do this math before anything else)

TAM if you sold a €129 website to **every** Benelux couple: 117,000 × €129 ≈ **€15M/year**.
That is the absolute ceiling with 100% market share, which nobody gets.

Realistic paid-website penetration is low — most couples use a free tool (Joy, Zola)
or nothing, and the Benelux market already has 6+ established players splitting what's
left. A realistic *serviceable obtainable market* for a new B2C entrant in years 1–3
is **hundreds to low thousands of couples per year**:

| Couples/yr | @ €129 one-off | @ €199 one-off |
|---|---|---|
| 200 | €25,800 | €39,800 |
| 500 | €64,500 | €99,500 |
| 1,500 | €193,500 | €298,500 |
| 5,000 | €645,000 | €995,000 |

**Conclusion: software-only, B2C, Benelux = a nice side income, not a company.**
The businesses that got big (Zola, The Knot, Joy) all make their money somewhere
other than the website itself. See §4.

---

## 2. Global players — how they actually make money

| Company | Model | Numbers |
|---|---|---|
| **The Knot Worldwide** (The Knot, WeddingWire, Hitched, Zankyou) | Vendor marketplace ads/subscriptions. Website+RSVP is free bait. | 4M+ couples registered in 2025; ~900,000 wedding pros; 25M+ leads delivered; ~$4B of spend driven to vendors. Vendor listings ~$50–150/mo basic, scaling by location/category, performance-based budgets on top. |
| **Zola** | Registry commission + gifts marketplace + invitations + vendor marketplace. Free planning tools. | ~$43M est. annual revenue; 283 employees; $141M raised (Lightspeed, Thrive, Comcast Ventures); $650M valuation at Series D. |
| **Joy (withjoy.com)** | 100% free website/planning tools. Revenue from registry kickbacks, affiliate commissions, printed stationery, zero-fee cash funds. | ~$64.9M revenue (2023); $108M raised; ~483 employees. |
| **RSVPify / GuestlistOnline** | RSVP-first SaaS, freemium → paid tiers; GuestlistOnline sells an Enterprise/white-label tier with API + webhooks. | — |
| **Paperless Post** | Digital invitation "coins" + paper. | — |

**The pattern is unmistakable:** every large player gives the website away and monetises
gifts, stationery, or vendor leads. Nobody at scale charges couples for the website.

---

## 3. Benelux players — your actual competition

| Player | Market | Price | Notes |
|---|---|---|---|
| **Forever and Ever** (foreverandever.nl) | NL (+BE) | **€99 one-off**, no subscription, 7-day free trial without card | The most complete direct competitor. Drag-and-drop editor, "live in 5 minutes", RSVP with dietary prefs + comments, **personal links per guest group** (day guests / evening guests / family see different sections), checklist, **tafelschikking (seating chart)**, guest list, **photo album with QR code**, guestbook, post-wedding memory page. This is the bar to clear. |
| **Weddamo** (via gaantrouwen.nl) | NL/BE | **€69 / €99 / €139**, 4-week free trial, **1 year validity**, €39/yr renewal, no auto-renew | Tiered: Basic €69; Premium €99 adds premium designs, password protection, custom domain, custom RSVP fields, 30 min support; Pro €139 adds **second language**, guestbook, blog, guest photo uploads. Note the multilingual upsell — relevant for Belgium. |
| **Zeiden Ja** (zeidenja.nl) | NL | — | Wedding sites, all include online RSVP. Info sharing: location, time, dress code. |
| **Flinnley** (via trouwbeleving.nl) | NL | — | Guest list + RSVP modules, customisable forms. |
| **Bruiloft-website.com** | NL | — | Dashboard with all RSVPs/cancellations, guest list overview. |
| **Upwedding** (upwedding.be) | **BE** | — | The clearest Belgian competitor. Positions as "most memorable wedding invitation" — invitation-led with built-in RSVP. |
| **Lovitations** (lovitations.nl) | NL | — | Content/SEO-heavy on templates + RSVP flow. Invitation designer. |
| **WijTrouwen** (wijtrouwen.eu) | NL+BE | — | Content/guide site, not a product — but owns RSVP search intent. Useful for understanding how couples are educated. |
| **Kaartje2Go / KoningKaart** | BE+NL | RSVP card sets from **€34.80** + shipping | Paper. Note their own guidance: the most popular pattern is a **paper invitation with a QR code** linking to the online RSVP form. That hybrid is your integration point, not your enemy. |

### Gaps I could not find anyone filling well in Benelux

1. **No B2B / white-label offer for planners or venues.** Everything is direct-to-couple
   self-serve. The only white-label wedding-planner product I found anywhere is
   `planning.wedding` at a flat **$120/month** — and its licence explicitly forbids
   charging couples for access, i.e. it's a branding tool, not a resale product.
   Aisle Planner ($39.99–69.99/mo), HoneyBook (Starter $36/mo, Essentials $59/mo after
   a Feb-2025 hike from $19), Dubsado ($20–40/mo), Planning Pod ($39–74/mo) are all
   planner CRMs — **none of them produce a beautiful public guest-facing wedding site**.
   That is a genuine hole: the CRM tools don't do guest-facing sites, and the
   guest-facing site tools don't do planner workflows.
2. **Bilingual BE/FR weddings.** Belgium is NL/FR/EN and mixed-language guest lists are
   normal. Weddamo charges extra (€139 tier) for a *second* language. A properly
   multilingual product (per-guest language, translated emails, translated RSVP) is a
   real local moat that the US players will never build.
3. **Guest-group-scoped content done well.** Forever and Ever has it; most don't.
   Day guests vs evening guests vs ceremony-only is very much a Benelux structure.
4. **Cash gift funds.** Belgian couples overwhelmingly receive cash. Joy built a
   zero-fee cash fund (Venmo/PayPal/CashApp) and monetises the flow. The Benelux
   equivalent (Bancontact/Payconiq/iDEAL/Mollie) is not well served.
5. **Practical logistics nobody automates:** shuttle bus sign-up, hotel room blocks,
   allergies aggregated into a caterer-ready export, table plan → place cards PDF,
   day-of timeline shared with vendors.

---

## 4. Revenue models, ranked by realism for you

| # | Model | Price point | Verdict |
|---|---|---|---|
| 1 | **B2B seats to planners** (white-label sites for their couples) | €39–99/mo per planner, or €25–49 per wedding | **Best wedge.** Recurring, doesn't churn on the wedding date, low CAC via Se Parti's network, and nobody in Benelux does it. |
| 2 | **Venue channel** | €99–299/mo per venue | Venues run 50–150 weddings/yr — one signature = 50+ couples. Highest leverage per sale. |
| 3 | **Per-wedding licence to couples** | €99–179 one-off | Matches the market (Forever and Ever €99, Weddamo €69–139). Works, but **100% churn by design** — every customer leaves after their wedding, forever. Volume-only game. |
| 4 | **Printed stationery attach** | €300–800 avg. couple spend | High margin, matched design to the site, print-on-demand partner. This is how Joy and Zola make real money. Big in BE. |
| 5 | **Cash / honeymoon fund** | 1–2% or fee passthrough | Real money in a cash-gift culture. Needs Mollie/Stripe Connect and care with payment regulation — do **not** hold funds yourself. |
| 6 | **Vendor referral / marketplace** | €25–150 per lead | The Knot's whole business. Needs traffic you won't have for years. Park it. |
| 7 | **Guest photo album / post-wedding** | €19–49 add-on | Cheap to build on top of what you have (S3 + CloudFront), decent attach rate. |

**Recommended blend for year 1:** #1 + #3 as the core, #7 as the first upsell, #4 as
the first partnership, #5 once volume justifies the compliance work.

---

## 5. Feature checklist — what "table stakes" actually means

Derived from what Forever and Ever, Weddamo, Joy and Zola all ship. Anything unticked
is a reason a couple picks a competitor.

### Table stakes (must have to be credible)
- [ ] Self-serve site creation, live in minutes, no code
- [ ] Multiple templates/themes, colour + font customisation
- [ ] Custom domain (or clean subdomain)
- [ ] Password protection / private site
- [ ] Mobile-first (most guests RSVP on a phone)
- [ ] RSVP with per-guest fields: attendance, +1s, meal choice, allergies, comments
- [ ] Per-event RSVP (ceremony / dinner / party — guests attend different parts)
- [ ] **Guest-group-scoped content** via personal links (day vs evening guests)
- [ ] Guest list dashboard: statuses, filters, CSV export
- [ ] Automatic confirmation email to guest + notification to couple
- [ ] Reminder emails to non-responders
- [ ] Practical info blocks: venue, map, times, dress code, parking, accommodation
- [ ] Gift / registry section
- [ ] FAQ block
- [ ] QR code for the paper invitation

### Differentiators worth building (where you can actually win)
- [ ] **True multilingual**: per-guest language, translated RSVP + emails (NL/FR/EN)
- [ ] **Seating chart** that reads live RSVP data and exports place cards + a caterer PDF
- [ ] **Allergy/diet aggregation** → one caterer-ready export
- [ ] **Shuttle bus / transport sign-up** with capacity limits
- [ ] **Hotel room block** sign-up
- [ ] Guest photo upload + shared album (QR at the tables)
- [ ] Guestbook / well-wishes
- [ ] Day-of timeline, shareable with vendors
- [ ] Budget tracker + checklist
- [ ] Cash/honeymoon fund with Bancontact + iDEAL
- [ ] Post-wedding thank-you page / memory page
- [ ] **Planner-side multi-wedding dashboard** (this is the B2B product)

### Deliberately skip in v1
- Vendor marketplace (needs traffic)
- Native mobile app (a good PWA is enough)
- AI everything (nobody buys a wedding site for the AI)

---

## Sources

- [Wedding Invitations Software Market — Verified Market Reports](https://www.verifiedmarketreports.com/product/wedding-invitations-software-market/)
- [Global Wedding Invitations Software Market — MarkWide Research](https://markwideresearch.com/global-wedding-invitations-software-market)
- [Wedding Planning Apps Market — Business Research Insights](https://www.businessresearchinsights.com/market-reports/wedding-planning-apps-market-121664)
- [Statbel — Huwelijken België](https://statbel.fgov.be/nl/themas/bevolking/partnerschap/huwelijken)
- [CBS — Trouwen (Nederland)](https://www.cbs.nl/nl-nl/visualisaties/dashboard-bevolking/levensloop/trouwen)
- [Bruiloft Statistieken Nederland & België](https://www.allesvoorjehuwelijk.nl/bruiloft-statistieken-nederland-belgie/)
- [The Knot Worldwide — platform features press release](https://www.theknotww.com/press-releases/the-knot-worldwide-announces-new-platform-features-to-drive-wedding-vendor-success)
- [The Knot vendor pricing guide 2026](https://www.fullybookedvenue.com/the-ultimate-guide-to-the-knot-vendor-pricing-in-2026/)
- [Zola — PitchBook profile](https://pitchbook.com/profiles/company/59276-17)
- [Zola — Growjo revenue estimate](https://growjo.com/company/Zola.com)
- [Zola $100M Series D — PitchBook](https://pitchbook.com/news/articles/zolas-latest-round-is-bigespecially-for-a-wedding-startup)
- [How Withjoy makes money](https://breakevenpointcalculator.com/how-does-withjoy-make-money-revenue-model-explained/)
- [Joy — zero-fee cash fund](https://withjoy.com/cash-fund-registry/)
- [Forever and Ever — trouwwebsite €99](https://foreverandever.nl/trouwwebsite-maken)
- [Forever and Ever — online RSVP](https://foreverandever.nl/online-rsvp-bruiloft)
- [Weddamo/Gaantrouwen — prijzen](https://gaantrouwen.nl/prijzen/)
- [Zeiden Ja — trouwwebsite maken](https://zeidenja.nl/trouwwebsite-maken/)
- [Upwedding (BE)](https://upwedding.be/)
- [Flinnley via Trouwbeleving](https://www.trouwbeleving.nl/trouwwebsite-maken-met-flinnley/)
- [Bruiloft-website.com](https://bruiloft-website.com/)
- [WijTrouwen — digitale RSVP gids 2026](https://www.wijtrouwen.eu/blog/digitale-rsvp-bruiloft-complete-gids)
- [Lovitations — bruiloft website templates](https://lovitations.nl/inspiratie-blog/bruiloft-website-templates-kiezen)
- [Kaartje2Go BE — RSVP kaarten](https://www.kaartje2go.be/trouwkaarten/kaart/stijlvolle-donkerblauwe-enkele-rsvp-kaart-met-invulvelden)
- [planning.wedding — white-label](https://planning.wedding/white-label)
- [Aisle Planner vs HoneyBook vs Planning Pod pricing](https://planningpod.com/blog/aisle-planner-vs-honeybook-vs-planning-pod-wedding-planning-software-alternatives-reviews-pricing)
- [Best CRM for wedding planners 2026](https://www.wedypro.ai/blog/best-crm-wedding-planners-2026)
- [Best wedding RSVP websites 2026 (UK/US)](https://www.guestlistonline.com/blog/best-wedding-rsvp-websites)
