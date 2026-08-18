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

## Local setup

```bash
direnv allow          # Node 24 from .nvmrc, plus AWS_PROFILE=guestnote
npm install
npm run dev           # app.localhost:3000, localhost:3000/nl, <slug>.localhost:3000
```

Node **24** is required, not preferred: `tsconfig.base.json` relies on native type
stripping for the explicit `.ts` import extensions. `.envrc` selects it through direnv so a
fresh shell, an agent shell or a `direnv exec` one-liner all get it without `nvm use`, and
`.npmrc` sets `engine-strict=true` so being on the wrong one is an error rather than a
warning that npm carries on past.

Both files explain themselves; the second exists because a warning once meant an
`npm install` wrote a dependency into `package.json`, skipped installing it, and reported
"up to date".

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
**`app.guestnote.be`**, with `pro.guestnote.be` kept as a permanent redirect to it.

> **Changed 2026-08-17: `pro.` → `app.`** The couple portal (`09-planner-app.md` P7) and
> later vendors log into the *same* host as planners, and a couple is not a "pro" — plus a
> price tier may yet be called Pro. `pro.` redirects rather than dying, so old links and the
> documents that still name it keep working. The host label is one env var, and the app's
> internal route prefix is independent of it. See `docs/adr/0003-one-app-three-hosts.md`.

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

- `design-system/tokens.css` — 7 ramps (neutral has 12 steps), semantic layer for light and
  dark, six RSVP status triples, 5-slot chart palette, density modes. Every pair
  contrast-verified; the chart palette passes protan/deutan/tritan checks.
  **It is a layer, not a Tailwind entry point** — `apps/web/src/app/globals.css` owns the
  `@import "tailwindcss"` and the `@source` set, because `@source` resolves relative to the
  stylesheet that declares it. Two fixes landed 2026-08-17: the `@import "tailwindcss"` line
  moved into the app, and `@custom-variant dark (&:is(.dark *))` was added — without it every
  `dark:` utility keyed off `prefers-color-scheme` while the tokens keyed off the `.dark`
  class, silently. See `docs/adr/0003-one-app-three-hosts.md` §4.
  *Labelled "Generated" but no generator exists in the repo; treat it as hand-maintained
  until one is committed.*
- `design-system/tokens-reference.html` — the visual reference. Doubles as the colour
  brief for the V7 template designer.
- `design-system/theme-contract.ts` — **parked, still correct.** Per-wedding theme type,
  legacy `background-0..3` mapping, `validateTheme()`, `toCssVars()`. Pick up at F4/V7.

## Shipped

- `packages/db/` — **the gate.** PH0 schema, RLS forced on all 9 tables, `withTenant`,
  ~110 assertions including against the real Neon pooled endpoint. `npm run test:db`.
- `packages/core/` — host resolution and `RESERVED_SUBDOMAINS`, import-free so `proxy.ts`
  can use it without pulling in the database layer. Also holds `packages/core/auth`, the seam
  every other module goes through; `better-auth.ts` behind it is M3's remaining work.
- `apps/web/` — the one Next.js 16 app. Marketing on the apex, the dashboard on
  `app.guestnote.be`, guest sites on `<slug>.guestnote.be`, all four host branches real and
  tested. NL/EN/FR. Runs locally; **not deployed** — M1a's OpenNext + CDK is still deferred.
  See `apps/web/README.md` and `docs/adr/0003-one-app-three-hosts.md`.
- `coming-soon/` — the holding page for `guestnote.be`. One self-contained `index.html`,
  NL/EN, no external requests. Deploy notes in `coming-soon/README.md`. Still the live apex;
  the app's marketing surface is a placeholder until there is real copy.
- `waitlist/` — email capture behind it: Lambda Function URL → DynamoDB, SNS email on
  planner/venue leads. Entirely inside AWS perpetual free tiers; costs verified, not
  assumed. `waitlist/README.md`.

## Relationship to the sibling projects

| Directory | What it is | Role here |
|---|---|---|
| `../se-parti-website` | S'e parti's marketing site (Next.js, Dutch, Belgian planning agency) | Cross-marketing partner; links to Guestnote |
| `../se-parti-rsvp` | Multi-wedding RSVP app, one AWS stack per wedding, Clerk-org-scoped admin | **The seed of the product.** Needs config-as-data + a single multi-tenant stack before it's sellable |
| `../emma-joren` | Joren & Emma's own site, 31 July 2027 | Feature lab — prove features here, promote the good ones |

## The bar

**A planner runs one real wedding entirely in Guestnote instead of a spreadsheet.**
That is `research/09-planner-app.md`'s P1 gate, and since the 2026-08-14 pivot it is *the*
goal — not a milestone on the way to one. The competitor to beat is not software; it is
Excel and WhatsApp, which sets the bar: anything slower to use than a spreadsheet loses.

Three things gate it:

1. **Tenancy that provably holds.** One Postgres database scoped by `org_id` + `wedding_id`,
   RLS as the backstop, and a `withTenant()` that cannot be called without a tenant context.
   This is the only part that cannot be retrofitted. → milestone **M2**, spec **F6/T5**
2. **The two-table authz model.** `org_members` is staff; the couple is never an org member,
   `wedding_members` carries them. Tasks carry `visibility`, so a planner's internal notes
   exist from the first migration rather than leaking on the day the couple portal ships.
   → `research/07-auth-and-tenancy.md`, `09-planner-app.md` §b
3. **The task engine.** Shared checklist, assigned to planner *or* couple, due dates anchored
   to the wedding date, applied from a template in one click. → **T3/T6/T8/T9**

### Deferred, not cancelled

The original blocker — every new wedding being a code change, a commit and a `cdk deploy` —
is real and still stands, but it belongs to the guest-site product, which
`research/09-planner-app.md` moved to **P4**: config → database (**F1**), wildcard-subdomain
rendering with per-tenant ISR (**F2**), self-serve onboarding (**S1**). `se-parti-rsvp`
therefore sits idle longer. That is the acknowledged cost of the reordering.

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
- [x] ~~Is French a launch requirement or a Wallonia-expansion feature?~~ → **launch
      requirement, decided 2026-08-17.** The interface ships NL + EN + FR from day one via
      `next-intl`; all three catalogues exist in `apps/web/messages/`. `04-speclist.md`'s
      **V3** already called per-guest NL/FR/EN "the best local moat available" — Weddamo
      charges €139 for a *second* language — so it becomes a property of the platform rather
      than a feature to sell later. Note this is the **interface**; per-*guest* language on
      wedding sites and emails is still V3/PH4 work.

## The schema lives in code

`packages/db/src/schema/*.ts` is the **authoritative schema**. `research/05-architecture.md` §4,
`07-auth-and-tenancy.md` §4 and `09-planner-app.md` §b–§c are the *reasoning* behind it and are
not kept in sync column by column. Where they disagree with the Drizzle schema, the schema wins.

## Next action

**Two tracks, in parallel.**

1. **Build.** Repo skeleton, then the P0 schema, then RLS + `withTenant()` + the isolation
   suite — which is the gate: no feature work until `npm run test:db` exits 0. Then auth, then
   the task engine, then hosting. `05-architecture.md` §9's **M1** is split: its infrastructure
   half (a deployed, authenticated `pro.guestnote.be`) stays; its per-tenant-ISR half moves to
   the P4 boundary, because no P0–P3 surface is cached.
2. **Validate.** 15 Flemish planners + 5 venues, as the non-coding evenings rather than as a
   gate. Take `research/04-speclist.md` into the calls; its final section lists the six
   questions they need to settle, and `09-planner-app.md` §Open adds the one that matters most:
   **how many professional wedding planners actually exist in Flanders.** A planner-seat product
   is capped by that number. See also §7 of `research/02-strategy-and-verdict.md`.

Track 1's first three weekends are *stack* validation — RLS through Neon's pooler, the
`withTenant` guard, the id type — and are needed identically whichever answer track 2 returns.
The first sitting that commits to the pivot is the task engine.
