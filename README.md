# Guestnote

Wedding websites with RSVP and guest management, in Dutch and English — sold **B2B-first**
to wedding planners and venues as a white-label tool they hand to every client, and
directly to couples as a one-off.

A **separate business from S'e parti**, cross-marketing with it at arm's length.

**Name decided 2026-08-10.** Picked from ~600 domain checks across every naming direction
— see `research/03-name-candidates.md` for the full reasoning and why each alternative
died. Chosen because it is conflict-clean, trivially easy in both Dutch and English, and
**event-neutral**, so it survives the expansion into venues and non-wedding events that
the strategy predicts.

## Domains to register

| Domain | Status (2026-08-10) | Priority |
|---|---|---|
| `guestnote.be` | free | **buy first** — local trust signal, primary |
| `withguestnote.com` | free | **buy first** — international/product face |
| `getguestnote.com` | free | defensive |
| `guestnote.eu` | unchecked | later |
| `guestnote.io` | **taken** | — |
| `guestnote.com` | **taken** (squatter) | buy from squatter later if revenue justifies (€1–15k) |

Client sites live at `<couple>.guestnote.be`; the planner dashboard at
`pro.guestnote.be`.

**Still to do before spending money:** EUIPO/TMView search on **class 42** (software) and
**class 41** (event services); check `@guestnote` on Instagram and LinkedIn.

## Contents

- `research/01-market-and-competitors.md` — market size (BE/NL wedding counts, software
  market), global players and how they really monetise, the Benelux competitors with
  prices, gaps in the market, revenue models ranked, feature checklist.
- `research/02-strategy-and-verdict.md` — is this a good idea (yes, but B2B not B2C), why
  it must be a separate brand, pricing, build order vs what already exists, risks,
  90-day plan, open questions.
- `research/03-name-candidates.md` — the full naming exercise and every rejected name
  with its reason. Kept so this doesn't get re-litigated.
- `research/04-speclist.md` — **the wedding-site + RSVP feature spec**, tiered T0→T4 with
  persona and effort. Still valid; **re-tiered by `09-planner-app.md` into P4** (built after
  the planner app). Ends with the questions the validation calls should settle.
- `research/05-architecture.md` — the technical decisions: Next.js 16 with ISR on OpenNext,
  one multi-tenant stack, Neon Postgres + Drizzle, Better Auth, tenant isolation, schema,
  build order M0→M10.
- `research/06-hosting-costs.md` — what this costs on AWS, with figures pulled from the
  Pricing API rather than from memory.
- `research/07-auth-and-tenancy.md` — **Better Auth decided**, with the checked Clerk numbers
  kept so it isn't re-litigated, plus the org/role model: orgs are the *business*, couples are
  never org members, `wedding_members` carries them. Supersedes §5 of `05-architecture.md`.
- `research/09-planner-app.md` — **🔄 the direction change (2026-08-14): planner
  application first.** The planner feature set specced P0→P4, what the wedding-site/RSVP
  product becomes (P4, folded in later), the schema and auth deltas it needs (vendor role,
  task visibility, shared budget), and what is deliberately not built. **Supersedes the
  tiering of `04-speclist.md`, not its content.**
- `research/08-design-system.md` — **the theme decisions for `pro.guestnote.be`**:
  Tailwind v4 + shadcn token names, three token layers, the six RSVP states (declined is
  *not* red), the CVD-validated chart palette with its honest series caps, and why the
  logo colours can't be UI colours. Tenant wedding-site theming is parked until F4/V7.

## Design system

Scoped to the **planner platform**. Tenant wedding-site theming is parked.

- `design-system/tokens.css` — generated: 7 ramps (neutral has 12 steps), semantic layer
  for light and dark, six RSVP status triples, 5-slot chart palette, density modes.
  Every pair contrast-verified; the chart palette passes protan/deutan/tritan checks.
- `design-system/tokens-reference.html` — the visual reference. Doubles as the colour
  brief for the V7 template designer.
- `design-system/theme-contract.ts` — **parked, still correct.** Per-wedding theme type,
  legacy `background-0..3` mapping, `validateTheme()`, `toCssVars()`. Pick up at F4/V7.

## Shipped

- `coming-soon/` — the holding page for `guestnote.be`. One self-contained `index.html`,
  NL/EN, no external requests. Deploy notes in `coming-soon/README.md`.
- `waitlist/` — email capture behind it: Lambda Function URL → DynamoDB, SNS email on
  planner/venue leads. Entirely inside AWS perpetual free tiers; costs verified, not
  assumed. `waitlist/README.md`.

## Relationship to the sibling projects

| Directory | What it is | Role here |
|---|---|---|
| `../se-parti-website` | S'e parti's marketing site (Next.js, Dutch, Belgian planning agency) | Cross-marketing partner; links to Guestnote |
| `../se-parti-rsvp` | Multi-wedding RSVP app, one AWS stack per wedding, Clerk-org-scoped admin | **The seed of the product.** Needs config-as-data + a single multi-tenant stack before it's sellable |
| `../emma-joren` | Joren & Emma's own site, 31 July 2027 | Feature lab — prove features here, promote the good ones |

## The blocker

Right now every new wedding is a code change, a commit and a `cdk deploy` by Joren. That's
a bespoke-site factory, not a SaaS. Three things gate everything else:

1. **Config → database.** `shared/src/weddings/*.ts` becomes rows. No deploy to add a wedding.
   → spec **F1**, milestone **M2/M4**
2. **Single multi-tenant stack.** One Postgres database scoped by `wedding_id`, one Lambda,
   one CloudFront with wildcard subdomains. One-stack-per-wedding dies around ~20 weddings.
   → spec **F2**, milestone **M1**
3. **Self-serve onboarding.** Sign up → pick a template → fill a form → site is live, with
   no Joren in the loop. → spec **S1**, milestone **M8**

Day-90 goal: a stranger can create a live wedding site without Joren touching a keyboard.

## Technical decisions (2026-08-11)

Full reasoning in `research/05-architecture.md`; costs in `research/06-hosting-costs.md`.

| | Choice |
|---|---|
| Framework | Next.js 16 App Router, **ISR + tag revalidation** (server-rendered on publish, not per request) |
| Hosting | OpenNext on Lambda + CloudFront + S3, wired with CDK, `eu-central-1` |
| Database | **Neon Postgres** + Drizzle — real Postgres at €0, over HTTP, so no VPC and no $37.96/mo NAT Gateway |
| Auth | **Better Auth** self-hosted (confirmed 2026-08-12, `07-auth-and-tenancy.md`). Guests never get accounts — signed household links |
| Custom domains | Deferred to v2. Subdomains only at launch; schema reserved |
| Email / payments | SES + react-email · Mollie (Bancontact €0.39 vs Stripe €2.34) |

**Running cost: ~€0.50/mo idle, ~€6–8/mo at 100 weddings.** SSR does not end the free ride —
the permanent free tiers (CloudFront 1 TB, Lambda 1M requests) absorb it comfortably.

## Decisions still open

- [x] ~~Name~~ → **Guestnote**
- [x] ~~Tech stack and hosting~~ → see above
- [ ] Belgium-only vs Benelux at launch
- [ ] Legal entity vs side project under existing structure (founder name belongs here —
      e.g. "Nagels BV" — not on the customer-facing brand)
- [ ] Designer budget for 5–6 templates — **€2,000–5,000, and the highest-ROI euro available**
- [ ] Is French a launch requirement or a Wallonia-expansion feature? (Changes T2 materially)

## Next action

Validation calls: 15 Flemish planners + 5 venues, before writing any product code.
Take `research/04-speclist.md` into the calls; its final section lists the six questions
those calls need to settle. See also §7 of `research/02-strategy-and-verdict.md`.
