# Guestnote

Multi-tenant wedding-planner platform, sold B2B-first to Belgian wedding planners and
venues. One Next.js 16 app on three hosts, one Neon Postgres scoped by `org_id` +
`wedding_id`, Better Auth behind a seam. `README.md` is the product and strategy brief;
this file is how to work in the code.

**The bar:** a planner runs one real wedding here instead of a spreadsheet. The competitor
is Excel and WhatsApp, so anything slower to use than a spreadsheet loses.

**Node 24 is required, not preferred.** `direnv allow` once; after that every shell,
including an agent shell, gets it. `engine-strict=true` makes a mismatch an error because a
warning once let `npm install` write a dependency into `package.json` without installing it.

## Where things are

| Path | What it owns |
|---|---|
| `packages/db/` | The authoritative schema, RLS, `withTenant`. **The gate.** |
| `packages/core/src/hosts.ts` | The only host→surface resolver. Zero imports, on purpose. |
| `packages/core/src/auth/` | The auth seam. `better-auth.ts` is the only provider contact. |
| `packages/ui/` | Presentational primitives, one export path per public file. |
| `packages/email/` | The mail seam. `ses.ts` is the only AWS SDK contact. |
| `packages/storage/` | The file-storage seam: presigned PUT/GET. `s3.ts` is the only S3 SDK contact. |
| `packages/billing/` | The billing seam: plain data, `pricing.ts`/`quote()`, and a no-op provider. No provider SDK yet. |
| `apps/web/src/proxy.ts` | The only file that reads the request's hostname. (`lib/app-url.ts` composes the app origin for cross-host links.) Its matcher's exclusion list is a promise those files exist — see invariant 13. |
| `apps/web/src/env.ts` | The only file that reads `process.env`. |
| `docs/adr/` | Decisions that were **measured**. Supersede `research/` where they overlap. |
| `docs/specs/` | What a feature must do, settled by interrogation **before** it is built. Written by `/feature`. |
| `research/` | The reasoning: market, architecture, auth/tenancy, planner spec. |
| `design-system/` | Tokens for the planner platform. Tenant theming is parked. |
| `.impeccable/surfaces/` | Per-surface design briefs. The login brief is the live one. |
| `infra/` | Hand-applied CloudFormation (SES events, GitHub OIDC, budgets) — not CDK, see the header in `mail-events.yaml`. |
| `sst.config.ts` | The hosting stack — SST v3 (`sst.aws.Nextjs`), one per stage. Pulumi engine, not CloudFormation. Runbook: `infra/README.md`. |
| `test/` | The shared Vitest setup and the `server-only` stub. Named by `vitest.config.ts`. |

`packages/db`, `packages/email` and `apps/web` each have a README that argues its decisions
at length. Read the relevant one before changing that area; they record traps that were
measured, not guessed.

## Commands

```bash
npm run check          # typecheck + lint + unit + component. The gate.
npm test               # unit + component, ~4s, nothing external
npm run test:db        # two tiers. Tier 1 needs no env (defaults to localhost:55433);
                       # tier 2 needs the Neon env. See packages/db/README.md
npm run dev            # guestnote.localhost:3000/nl, app.guestnote.localhost:3000, <slug>.guestnote.localhost:3000
npm run build -w @guestnote/web
npm run format         # biome check --write
```

`npm run check` must pass before any work is called done. `npm run test:db` must pass before
anything touching `packages/db` is called done, and the Neon tier is the only thing that can
answer a question about the pooler.

## Invariants

These are the things that cannot be retrofitted, or that have already gone wrong once. Where
one is held by a mechanism, the mechanism is named — and wanting to weaken it is the signal to
stop and ask. The rest are held by convention alone, which is why they are written down here.

1. **Every query on a tenant-scoped table goes through `withTenant()` or `withUser()`.**
   `@guestnote/db` exports no unscoped handle. The escape hatch is `@guestnote/db/unsafe`,
   banned outside `packages/db/**` by both a Biome rule *and* `no-unsafe-imports.test.ts` —
   both, because a lint rule can be silenced inline and a test cannot. **Two sanctioned writers
   bypass both**, enumerated in `apps/web/src/lib/db.ts`: Better Auth's adapter, and
   `recordDelivery` in `lib/mailer.ts`. Each touches `UNSCOPED_TABLES` only, which have no
   tenant column to scope to. A third one is the point to stop, not to widen the list.

2. **A new table must be classified in `packages/db/src/schema/index.ts`**, into exactly one
   bucket. Everything outside `UNSCOPED_TABLES` must then get `force row level security` — not
   merely `enable`, which exempts the table owner, and on managed Postgres the app can be the
   owner — plus a policy whose predicate names its tenant key.
   `packages/db/test/schema-coverage.test.ts` fails if a table is unclassified, and runs the
   FORCE and policy assertions over the *scoped* buckets only (tenant, self, user, and `ORG_SCOPED_TABLES` — `vendors`, `task_templates`, `template_items`, which carry `org_id` and no `wedding_id`). So an `UNSCOPED_TABLES`
   entry carries no RLS **by design**, and needs a stated reason of the same kind as the
   existing ones: the row is written before a principal exists, so there is no `app.user_id`
   to scope by and a policy would break sign-in outright. `mail_deliveries` and `rate_limits`
   are the newest two.
   **One sanctioned exception to "names its tenant key":** a table may carry a *second*
   policy on the `app.user_id` axis where a name has to be readable before a tenant is
   known. `organizations.org_read_for_members` (migration 0005) is the only one, it is
   `for select` so writes stay on the tenant key, and it is guarded to apply only where
   `app.org_id` is unset — without that guard Postgres ORs it with `tenant_isolation` and a
   tenant-scoped read starts returning other organisations, which is how it was found.
   It is named individually in `USER_SCOPED_POLICY_EXCEPTIONS` in `schema-coverage.test.ts`,
   so a *new* policy scoping by neither key still fails.
   **Migration 0007 added two more of the same kind, on the opposite axis:**
   `org_members.org_staff_read` and `wedding_members.org_staff_read` are `for select`
   policies scoped by `app.org_id` (and `app.wedding_role in ('owner','admin')`), so an owner
   or admin can read every membership of their org. Both tables are otherwise `app.user_id`
   scoped. Each exception now carries the GUC its `USING` must name, so it is excused from
   the table's primary key and not from being scoped. **A future `withTenant` query on either
   table now returns the whole org to an owner or admin: it must filter to the caller itself
   if it means "my row".**
   The same migration adds `resolve_invitation` and `accept_invitation`, `SECURITY DEFINER`
   functions that were the only door onto `invitations` before a principal exists (migration 0010
   added `my_pending_invitations` and `accept_invitation_by_id`, both bound to `app.user_id`). They
   install only when the migrating role bypasses RLS, and they are executable by `app_user`
   alone.
   **Migration 0008 added three more, on a third axis: no tenant key at all.**
   `run_sheet_items.link_read`, `wedding_vendors.link_read` and `wedding_events.link_read` are
   `for select` policies scoped by `app.wedding_role = 'link'` plus the vendor-link GUCs
   (`resolve_vendor_link`, the matching `SECURITY DEFINER` function). The `link` principal
   carries no `org_id` and no `user_id` — a signed link is read before either exists — so these
   three are excused from both keys, not just one. `wedding_events.link_read` grants the whole
   row (including `venue`) for every event of the wedding, not just the linked vendor's own
   event, deliberately: nothing on that table is sensitive today, and the migration's own
   comment says so plainly, with a test proving a link principal can read a sibling event's venue.
   **Migration 0010 added four more `SECURITY DEFINER` doors, no policies:** `create_studio`
   (a user makes an org and becomes its owner, one owned studio each), `my_pending_invitations`
   (the caller's own invitations, matched on their `users.email` and never an email argument),
   `accept_invitation_by_id` (hands on to `accept_invitation`), and `orgs_with_trial_ending` —
   the **only cross-tenant read in the schema**, for the trial-reminder cron, returning org id,
   name, trial end and one owner email and nothing else. Same install guard, same grants.

3. **`Principal` stays a discriminated union.** Never `{ orgId?, weddingId? }`. A principal
   with no `org_members` row *must* carry `weddingId`, or RLS falls through to org-wide
   scope and a couple reads the planner's whole book of business. That is the
   highest-risk path in the model: the type is the braces, `assertScoped` is the belt.

4. **GUCs are set with `is_local = true`, as the first statements in the transaction.**
   Never session-level `SET` — unsupported on Neon's transaction-mode pooler *and* a
   cross-tenant leak. `app.org_id` is data scoping, never a permission.

5. **Provider libraries are reachable from exactly one file each.** `better-auth` only from
   `packages/core/src/auth/better-auth.ts`; `@aws-sdk/client-sesv2` only from
   `packages/email/src/ses.ts` and its test; `@aws-sdk/client-s3` and
   `@aws-sdk/s3-request-presigner` only from `packages/storage/src/s3.ts`. No provider type
   crosses any seam — everything returns plain data. That is what keeps a provider swap a
   bounded job, and what stops the AWS SDK being dragged into a bundle by a stray import. All
   the bans are in `biome.json` *and* in `no-unsafe-imports.test.ts`.
   **`packages/billing` is a seam with no provider behind it yet** (spec 0005): the app talks to
   `getBillingProvider()` in `lib/billing.ts`, which returns the no-op provider, and the choice
   between Mollie and Stripe was deferred on purpose. The provider's SDK, when it lands, gets
   the same one-file rule and both bans in the same commit — there is no ban today because a
   rule naming a package nobody installed would be a guess at its name.
   **`@guestnote/db/cron` is banned the same way, for a tenancy reason rather than a provider
   one:** `orgsWithTrialEnding` reads across every tenant, so it is off the package root and
   only `app/api/cron/trial-reminders/route.ts` may import it. Biome's override for that file
   *restates* every other banned path, because an override replaces the rule's options rather
   than merging them — a new ban goes in both places.
   **A vendor pushed in from `instrumentation.ts` must be handed over on `globalThis`**, not
   through a module `let`: Next bundles that file separately from the app, so each side has
   its own copy of every module. `lib/observability.ts` found this 2026-09-24, after Sentry had
   silently received nothing from it since 2026-09-01.

6. **`apps/web/src/env.ts` is the only reader of *configuration*,** and `packages/*` reads no
   environment at all — config arrives as arguments. The single exception is `NODE_ENV`, in
   exactly three places, each guarding a dev-only refusal: `lib/auth.ts`'s `DEV_SECRET`,
   `lib/mailer.ts`'s console transport and `lib/storage.ts`'s local-directory fallback for the
   files bucket. `packages/email/src/console.ts` explains why the check lives in the app and
   not in the package. Values a `next build` must not require
   (`DATABASE_URL`, `BETTER_AUTH_SECRET`) are optional in `env.ts` and validated lazily at the
   point of use. Deployed secrets come from SSM at `/guestnote/<env>/*`.
   Where a variable selects behaviour rather than supplying a value, **the value you get by
   forgetting it must be the safe one** — `GUESTNOTE_MAIL_TRANSPORT` unset resolves to
   `console` in development and `ses` everywhere else, and `mailer.ts` throws rather than let a
   deployed environment write sign-in codes to CloudWatch.
   `GUESTNOTE_BILLING_FROM` is the same shape: unset is the free demo, and nobody is ever locked
   out of a wedding by forgetting it (`lib/billing-mode.ts` is its one reader). `CRON_SECRET`
   too: unset, `/api/cron/trial-reminders` refuses every request, and `sst.config.ts` deploys
   without the cron while `/guestnote/<stage>/CRON_SECRET` does not exist — the one SSM
   parameter whose absence changes the stack instead of failing the deploy.

7. **`proxy.ts` does no I/O, no session validation, no authorization, and does not import
   `@guestnote/db` even transitively.** Authorization lives in Server Functions plus
   `withTenant` plus RLS, because a Server Function is a POST to its own route and a matcher
   change can silently remove proxy coverage.

8. **Migrations run over the unpooled endpoint, and never with `npm run db:migrate`** —
   there is no `__drizzle_migrations` journal in this database, so `drizzle-kit migrate`
   replays from zero and fails behind its own spinner. `drizzle-kit generate` is still the
   right way to *write* one. `packages/db/README.md` has the local container loop; the Neon
   apply command (`psql --single-transaction`) is in the `/db-migration` skill.

9. **Ids are application-side UUIDv7 via `newId()`.** `uuid`, not `text`: every RLS policy
   casts `current_setting('app.org_id', true)::uuid`.

10. **On Neon, create `app_user` with SQL.** Roles made through the Console, CLI or API
    inherit `BYPASSRLS` via `neon_superuser`, and every policy then stops working with no
    error anywhere — measured 2026-08-17, `neondb_owner` has `rolbypassrls = true`
    (`docs/adr/0001`). `pooling.test.ts` asserts `rolbypassrls = false` on whatever role it
    connected as; if that test fails on Neon, this is why.

11. **Do not import components from `react-email` or `@react-email/components`.** Use
    `@react-email/render` plus the markup in `packages/email/src/layout.tsx`. The unified
    package has no subpath exports and drags `prismjs`, `marked`, `tailwindcss` and `esbuild`
    in from one entry — ~80 MB per function, and `output: 'standalone'` traces *files*, not
    tree-shaken imports, so an importable dependency is a shipped one. **This one has no
    mechanism**: it is in neither `biome.json` nor `no-unsafe-imports.test.ts`, which is
    exactly why it is here. `packages/email/README.md` and ADR 0004 have the numbers.

12. **A name excluded from `proxy.ts`'s matcher must exist in `apps/web/public/`.** The
    exclusions are `_next/static`, `_next/image`, `favicon.ico`, `robots.txt` and
    `sitemap.xml`. Excluding a name means nothing rewrites it and nothing 404s it early, so a
    missing file falls through to the router, where `[locale]` is a top-level dynamic segment
    and matches it — and `(marketing)/[locale]/layout.tsx` is a ROOT layout, whose
    `notFound()` has no boundary above it and renders a **500, not a 404** -- that layout's
    own comment records the measurement. `/favicon.ico` was a 500 on every deployed page load
    from 2026-08-19 to 2026-09-01 for exactly this reason (staging Lambda log, alongside
    `Page changed from static to dynamic at runtime /favicon.ico, reason: headers`),
    dismissed three times as log noise. `robots.txt` and `sitemap.xml` are still missing and
    take the same route; locally they 404, and the deployed behaviour has not been read back.
    The mirror of this — a file in `public/` that is NOT
    excluded gets rewritten to `/pro/<file>` and 404s — is why `wordmark.tsx` inlines the
    mark. **This one has no mechanism**, in either direction; both are recorded in
    `proxy.ts`'s matcher comment.

13. **Every write to the apex `TXT` record set must carry all three of its values.** Route 53
    replaces a record set on write, so an `UPSERT` naming only the record you want silently
    deletes the others. `guestnote.be` `TXT` holds `google-site-verification=…`,
    `zoho-verification=…` and `v=spf1 include:zohomail.eu ~all` as of 2026-08-19; dropping
    either verification string un-verifies a domain in a console nobody is watching, and
    dropping the SPF breaks Zoho's outbound alignment. **This one has no mechanism** — read the
    set with `route53 list-resource-record-sets` before writing it. Same silent-failure shape as
    10, different service. `docs/adr/0005-the-apex-receives-mail.md` has the zone id and the
    batch that got it right.

## Testing

Three Vitest projects, and **the file extension is the selector** — a test cannot land in
the wrong one by accident. `vitest.config.ts` argues each choice.

| Project | Selected by | Needs |
|---|---|---|
| `unit` | `{packages,apps}/*/src/**/*.test.ts` | nothing |
| `component` | `{packages,apps}/*/src/**/*.test.tsx` | nothing (jsdom) |
| `db` | `packages/db/test/**` | `TEST_DATABASE_URL` + `SEED_DATABASE_URL`, serial |

A test that imports React but asserts no markup still gets `.tsx`, so it lands in the
project that has a DOM.

**Assertions are checked by mutation, not by going green.** Before an assertion counts,
break the code it covers and watch it fail. A test nobody has seen fail is a test nobody has
tested. Where a branch genuinely cannot be isolated, say so **beside the assertion that
cannot discriminate** rather than deleting the branch or faking coverage — the existing notes
live in `proxy.test.ts`, `auth-flow.test.tsx`, `components/nav/shell.test.tsx` and
`weddings/[id]/page.test.tsx`, not in the source files they cover. The three newest are worth
reading as examples of *why* an assertion could not discriminate: an accessible name `title`
was quietly supplying, a state clear only observable across a navigation, and a UTC date pin
that is invisible in any timezone east of Greenwich.
The `mutation-tester` agent automates the sweep.

**The fake-timer trap:** Testing Library auto-advances fake timers inside `waitFor` only
when it detects *Jest's*, via a `jest` global Vitest does not define. Under
`vi.useFakeTimers()` every `findBy*`/`waitFor` polls a clock nothing advances and hangs
until timeout. Use `fireEvent` + `act`, and narrow `toFake` so React's scheduler keeps its
microtask queue.

There is no browser E2E yet. Playwright is the obvious next layer — it is the only thing
that can drive a real `Host` header end to end, or a WebAuthn virtual authenticator.

## The tooling in this repo

`.claude/agents/` and `.claude/skills/` are committed, because they encode these invariants
rather than a personal preference. Reach for them instead of re-deriving the procedure.

| Use | For |
|---|---|
| `/feature` | **A feature has been chosen and is about to be built.** Questions first, then a spec, then plan mode. |
| `spec-scout` | What a proposed feature already has decided for it, and what is genuinely open. `/feature` runs it. |
| `guestnote-explorer` | Before changing an unfamiliar area: where it lives, why, and what the comments say not to do. |
| `tenancy-auditor` | Anything touching `packages/db`, the seams, `proxy.ts`, `env.ts` or a Server Function. |
| `mutation-tester` | Proving new assertions fail when the code breaks. **Needs a clean tree.** |
| `test-critic` | The same question read-only, safe on a dirty tree. |
| `correctness-reviewer` | Bug hunting on a diff. |
| `rationale-reviewer` | Whether the diff leaves the stated reasoning true. |
| `doc-steward` | Whether the docs still tell the truth. |
| `/verify` | Which verification rungs this change needs, and what green means. |
| `/db-migration` | Writing and applying a migration without hitting the silent traps. |
| `/adr` | Recording a decision that was measured. |
| `/commit` | The review panel, then a commit in house style. |

**No feature gets planned before it gets specified.** When a feature has been agreed and the
next move is to build it, run `/feature` — a full pass of questions, a spec in `docs/specs/`,
and only then plan mode. Not for a bug, a one-line fix, or a refactor with no user-visible
change; and not when told to skip it, which is a fine thing to be told. The reason it is a
rule rather than a preference: every other document here exists to stop a decision being
undone silently, and a feature built from inferred requirements is a dozen decisions made
silently, discovered only once it is built.

## Code style

Biome, 100 columns, single quotes, no semicolons, trailing commas. `npm run format`.

- `any`, non-null assertions and unchecked index access are **errors**, not warnings.
- Imports carry explicit `.ts` / `.tsx` extensions. Legal because nothing emits, and it
  means Node 24 can run these files directly with native type stripping.
- **Source comments use `--`, never an em dash.** Markdown prose uses `—` freely. AWS
  resource names and descriptions use hyphens.
- Comments explain *why*, and name the alternative that was rejected and the cost of the
  choice. That is the house style throughout this repo: a comment that only restates the
  code is worse than none. When something was measured, say it was measured and give the
  number and the date.
- Prefer making a dangerous shape **unrepresentable** over checking for it. Where a runtime
  check is still needed, it throws *before* the dangerous call, with a message naming the
  document that explains why.

## Docs

- **The schema in `packages/db/src/schema/*.ts` is authoritative.** Where `research/`
  disagrees with it, the schema wins and the doc gets a correction note rather than a
  silent edit.
- `docs/specs/` records what a feature must do, decided by asking **before** it is built.
  Numbered sequentially, written by `/feature`. A spec is forward-looking where an ADR is
  backward-looking: the spec says what was decided, the ADR says what was measured. When a
  build diverges from its spec, the spec is amended — one describing a product that does not
  exist is worse than none.
- `docs/adr/` records decisions that were measured against something running. New ADRs are
  numbered sequentially, open with `**Date:** … · **Status:** …`, and say plainly where an
  earlier document turned out to be wrong. The `adr` skill has the template.
- When a decision changes, leave the old name working and say what changed and when —
  `pro.` still redirects to `app.` for exactly that reason.
- Do not delete a rejected option from `research/`; it exists so the decision is not
  re-litigated.

## Deployment status

**`staging` is deployed; `production` is not.** `coming-soon/` is still the live apex,
`waitlist/` the Lambda behind its form, and `infra/mail-events.yaml` the deployed SES→SNS
bounce path — the repo's first IaC. The app answers on `*.staging.guestnote.be` against its
own Neon branch (a COW clone of prod, so a staging credential is a prod credential).

**CI deploys staging, as of 2026-08-30.** The `Deploy` workflow went green on `main` after
three OIDC fixes ending in `de73a5a` — first green run 33302554938 (a re-run, `docs/adr/0006`
records it at 10:41 UTC), first green on its own first attempt 33307284710 at 10:46 UTC,
2m31s. `/guestnote/staging/MIGRATED_THROUGH` is set and advances on every push; the
workflow's migration step fails closed when it is not, which is how we know. This paragraph
used to say "CI has not deployed anything yet"; it was true until that morning.

**`production` has never been deployed by anything and its marker is unset**
(`infra/README.md`). Trigger model: a `main` push deploys **staging**, a `v*` tag deploys
**production** behind a required-reviewer gate. Do not write code that assumes a deployed
*production* environment exists, or that a laptop `sst deploy --stage production` is
reproducible from CI without the bootstrap.

# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.

## This project's AWS account

guestnote uses AWS account `929219061071` (alias `guestnote`), a member account of
org `o-4uh054vlps`. Default region `eu-central-1`.

**Always pass `--profile guestnote`** (or set `AWS_PROFILE=guestnote`) on every AWS
command. The `default` profile on this machine points at AVIV/Realo shared
production (`380331363295`) — a bare `aws` command hits the employer's prod account.
