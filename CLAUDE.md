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
| `apps/web/src/proxy.ts` | The only file that reads the request's hostname. (`lib/app-url.ts` composes the app origin for cross-host links.) |
| `apps/web/src/env.ts` | The only file that reads `process.env`. |
| `docs/adr/` | Decisions that were **measured**. Supersede `research/` where they overlap. |
| `docs/specs/` | What a feature must do, settled by interrogation **before** it is built. Written by `/feature`. |
| `research/` | The reasoning: market, architecture, auth/tenancy, planner spec. |
| `design-system/` | Tokens for the planner platform. Tenant theming is parked. |
| `.impeccable/surfaces/` | Per-surface design briefs. The login brief is the live one. |
| `infra/` | Deployed infrastructure. CloudFormation, not CDK — see the header in `mail-events.yaml`. |
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
   FORCE and policy assertions over the three *scoped* buckets only. So an `UNSCOPED_TABLES`
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

3. **`Principal` stays a discriminated union.** Never `{ orgId?, weddingId? }`. A principal
   with no `org_members` row *must* carry `weddingId`, or RLS falls through to org-wide
   scope and a couple reads the planner's whole book of business. That is the
   highest-risk path in the model: the type is the braces, `assertScoped` is the belt.

4. **GUCs are set with `is_local = true`, as the first statements in the transaction.**
   Never session-level `SET` — unsupported on Neon's transaction-mode pooler *and* a
   cross-tenant leak. `app.org_id` is data scoping, never a permission.

5. **Provider libraries are reachable from exactly one file each.** `better-auth` only from
   `packages/core/src/auth/better-auth.ts`; `@aws-sdk/client-sesv2` only from
   `packages/email/src/ses.ts` and its test. No provider type crosses either seam — everything
   returns plain data. That is what keeps a provider swap a bounded job, and what stops the AWS
   SDK being dragged into a bundle by a stray import. Both bans are in `biome.json` *and* in
   `no-unsafe-imports.test.ts`.

6. **`apps/web/src/env.ts` is the only reader of *configuration*,** and `packages/*` reads no
   environment at all — config arrives as arguments. The single exception is `NODE_ENV`, in
   exactly two places, each guarding a dev-only refusal: `lib/auth.ts`'s `DEV_SECRET` and
   `lib/mailer.ts`'s console transport. `packages/email/src/console.ts` explains why the check
   lives in the app and not in the package. Values a `next build` must not require
   (`DATABASE_URL`, `BETTER_AUTH_SECRET`) are optional in `env.ts` and validated lazily at the
   point of use. Deployed secrets come from SSM at `/guestnote/<env>/*`.
   Where a variable selects behaviour rather than supplying a value, **the value you get by
   forgetting it must be the safe one** — `GUESTNOTE_MAIL_TRANSPORT` unset resolves to
   `console` in development and `ses` everywhere else, and `mailer.ts` throws rather than let a
   deployed environment write sign-in codes to CloudWatch.

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

12. **Every write to the apex `TXT` record set must carry all three of its values.** Route 53
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
cannot discriminate** rather than deleting the branch or faking coverage — the two existing
notes are in `proxy.test.ts` and `auth-flow.test.tsx`, not in the source files they cover.
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

**No part of the app is deployed yet.** `coming-soon/` is the live apex, `waitlist/` the
Lambda behind its form, and `infra/mail-events.yaml` the deployed SES→SNS bounce path — the
repo's first IaC. M1a (OpenNext + CDK) is deliberately still deferred. Do not write code that
assumes a deployed *application* environment exists.

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
