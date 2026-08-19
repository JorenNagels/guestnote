---
name: verify
description: Run the right verification ladder for a change in this repo and report honestly what passed, what was skipped and why. Use before calling any work done, when asked "does this work", "is this green", "verify this", or "can I commit". Covers npm run check, the two-tier database suite, the production build, the standalone artefact, and the curl host matrix -- and knows which of those a given change actually needs.
user-invocable: true
argument-hint: "[all | check | db | build | hosts]  (default: pick from the diff)"
---

# Verifying a change in Guestnote

Five rungs, cheapest first. **You do not run all of them for every change** — you pick from
the diff, and you say which ones you skipped. A skipped rung reported as skipped is fine; a
skipped rung reported as green is not.

Every command runs from the repo root, on Node 24. If anything reports `EBADENGINE` or an
unexpected Node version, run it under `direnv exec . …` rather than fighting it.

## Which rungs this change needs

| The diff touches | Rungs |
|---|---|
| anything at all | 1 |
| `packages/db/**`, a migration, `withTenant`, a policy | 1, 2 |
| `apps/web/**`, `packages/ui/**`, `next.config.ts` | 1, 3 |
| `proxy.ts`, `hosts.ts`, `env.ts`, `locales.ts`, cache headers | 1, 3, 5 |
| deploy work, `outputFileTracingRoot`, a new dependency in a package | 1, 3, 4 |
| a release, or "is everything green" | all five |

If the argument names a rung, run that one. If it is `all`, run all five. Otherwise read the
diff and decide:

```bash
git status --porcelain && git diff --stat && git diff main...HEAD --stat
```

## Rung 1 — the gate

```bash
npm run check          # tsc across every workspace + biome + unit + component
```

**Green means:** `✓ Types generated successfully`, *every* workspace typechecking with no
output (five as of `packages/email`, and the count moves with each new package), `No fixes
applied` from Biome, and every test passing with no skips you did not expect.

Note what rung 1 does **not** cover: `npm run check` runs `unit` and `component` only, so
nothing in `packages/db/test/**` runs — including the assertion that the migration journal and
the `.sql` files on disk agree. A schema change that passes rung 1 is unverified.

A skipped test is a finding, not a pass. Vitest reports skips when a `beforeAll` throws —
that is exactly how a broken database seed once read as "47 passed / 48 skipped, zero
failures". If the count of tests *dropped*, find out which file stopped being collected; a
missing `describe` block is silent.

## Rung 2 — the database gate, both tiers

**Both tiers must pass.** They answer different questions and neither substitutes for the
other. Full commands and the reasoning are in `packages/db/README.md`.

Tier 1, local Postgres — proves the policy *logic*, offline:

```bash
docker run -d --name gn-pg -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=guestnote \
  -p 55433:5432 postgres:17-alpine
docker exec gn-pg psql -U postgres -d guestnote \
  -c "create role app_user login password 'verify' nobypassrls;"
for f in packages/db/migrations/0*.sql; do
  docker cp "$f" gn-pg:/tmp/m.sql
  docker exec gn-pg psql -U postgres -d guestnote -v ON_ERROR_STOP=1 -q -f /tmp/m.sql
done
npm run test:db
```

Tier 2, Neon — proves the *pooler*, which nothing else can:

```bash
set -a; . ./.env.local; set +a
REQUIRE_NEON_TIER=1 npm run test:db
```

**Green means** a passing count with zero skips, and `pooling.test.ts` printing that it ran
against the Neon tier. `REQUIRE_NEON_TIER=1` is what makes a misconfigured host a failure
instead of a weaker claim quietly substituted for the real one.

If `.env.local` is absent, **do not invent credentials and do not fall back to tier 1 alone
while calling it green.** Report that tier 2 was not run and that a pooler claim is therefore
unverified. Last recorded result: **101 passed** against `-pooler` on PostgreSQL 18.4 and 101 on the local
container, 2026-08-19 (`packages/db/README.md` keeps 99 and 94 as dated history). Read the
README rather than this line if they disagree — it is the record, this is a pointer to it.

## Rung 3 — the production build

```bash
npm run build -w @guestnote/web
```

**Green means** `✓ Compiled successfully`, a `Finished TypeScript` line (that one carries no
checkmark), and no route unexpectedly changing rendering mode.
`next build` evaluates route modules while collecting page data, so this is the rung that
catches a value that has accidentally become a build-time dependency — the symptom is a
missing-credential error during build rather than at request time.

## Rung 4 — the standalone artefact

The only check that proves the TypeScript-source workspace packages and the Neon driver
actually made it into what ships. Worth running before any deploy work.

```bash
npm run build -w @guestnote/web
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/
(set -a; . ./.env.local; set +a; cd apps/web/.next/standalone/apps/web && node server.js)
curl -s http://app.localhost:3000/api/health
```

Note the output is at `.next/standalone/apps/web/server.js`, not `.next/standalone/server.js`,
because `outputFileTracingRoot` points at the monorepo root.

**Green means** `/api/health` returns `ok: true`, `app_user`, `bypassRls: false` — **and** the
bundle contains no `apps/web/.mail/` and no `react-email`:

```bash
find apps/web/.next/standalone -name '.mail' -o -name 'react-email' | head
du -sh apps/web/.next/standalone
```

Both checks exist because this rung caught the leak: file tracing does not read `.gitignore`, so
the first standalone build after the mail transport landed copied `.mail/` — rendered sign-in
codes and all — into the bundle. `next.config.ts`'s `outputFileTracingExcludes` is the fix.
Measured 2026-08-19, ADR 0004.

## Rung 5 — the host matrix

**Against `npm run start`, never `npm run dev`.** Dev overwrites `Cache-Control`, so cache
assertions are meaningless there.

```bash
npm run build -w @guestnote/web && npm run start -w @guestnote/web
```

```bash
curl -sI http://localhost:3000/                    # 308 -> /nl
curl -sI http://localhost:3000/nl                  # 200, public, s-maxage=60, swr=86400
curl -sI http://localhost:3000/xx                  # 404 -- [locale] is a catch-all
curl -sI http://app.localhost:3000/                # 200, private, no-store
curl -sI http://pro.localhost:3000/weddings        # 308 -> http://app.localhost:3000/weddings
curl -sI http://localhost:3000/pro                 # 404 -- rewrite target unreachable
curl -sI http://localhost:3000/sites/els-en-jan    # 404 -- the guard that matters most
curl -sI http://els-en-jan.localhost:3000/         # 404 from the sites stub, NOT marketing
curl -sI http://admin.localhost:3000/              # 404 -- reserved subdomain
curl -sI -H 'x-forwarded-host: app.localhost' http://localhost:3000/   # 200 -- the CloudFront path
curl -s   http://app.localhost:3000/api/health     # ok: true, app_user, bypassRls false
curl -sI  http://localhost:3000/api/health         # 404 -- no public API
```

Two known warts, both expected:

- **`www.localhost:3000` loops.** Local only. Next collapses a proxy `Location` to a relative
  path when it matches its own bound origin. Test that branch against a production hostname
  instead:
  ```bash
  GUESTNOTE_ROOT_DOMAIN=guestnote.be npm run start -w @guestnote/web
  curl -sI -H 'x-forwarded-host: www.guestnote.be' -H 'x-forwarded-proto: https' http://localhost:3000/
  # expect: location: https://guestnote.be/
  ```
- **Safari does not resolve `*.localhost`.** Chrome, Edge and Firefox do (RFC 6761). Use the
  `guestnote.test` `/etc/hosts` route from `apps/web/README.md` only when Safari matters, and
  note that `__Host-` cookies break there.

Kill the server when you are done; do not leave it running in the background.

## Reporting

State, per rung: run and green, run and failed (with the actual output, not a summary), or
skipped and why. Then one line on what remains unverified — for this repo that is usually
"no browser E2E exists, so the real `Host` header and the WebAuthn flow are untested
end to end", and saying so is more useful than implying otherwise.

If a rung failed, do not report the others as though the change is fine. Lead with the failure.
