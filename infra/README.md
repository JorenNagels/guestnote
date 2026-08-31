# infra/

How Guestnote deploys. This is the doc `research/05-architecture.md` §9 promises as "the
fallback written into `infra/README.md`".

| File | What it is |
|---|---|
| `../sst.config.ts` | The hosting stack — `sst.aws.Nextjs` per stage. The whole app deploy. |
| `github-oidc.yaml` | CloudFormation: GitHub OIDC provider + `GuestnoteDeployRole`. Bootstrap for CI. |
| `budgets.yaml` | CloudFormation: AWS Budgets alerts at €25 / €50 / €100. |
| `mail-events.yaml` | CloudFormation: SES bounce/complaint → SNS. Predates this and is unchanged. |
| `deploy.sh` | Deploys `mail-events.yaml` only. |

**Account `929219061071` (`guestnote`), region `eu-central-1`.** Always `--profile guestnote`
— the machine default is the employer's shared production account.

---

## The shape

One Next.js app, three surfaces, resolved from the `Host` header by `apps/web/src/proxy.ts`.
Deployed with **SST v3** (`sst.aws.Nextjs`), which wraps **OpenNext** onto Lambda + CloudFront
+ S3 + a DynamoDB/SQS revalidation cache. SST state lives in an auto-created `sst-state-*`
S3 bucket in the account — there is no `cdk bootstrap`.

Two stages:

| Stage | Domains | Database | DNS |
|---|---|---|---|
| `production` | `guestnote.be`, `app.guestnote.be`, `*.guestnote.be` | Neon primary branch, pooled, as `app_user` | **manual** (`dns: false` in `sst.config.ts`) |
| `staging` | `staging.guestnote.be`, `app.staging.guestnote.be`, `*.staging.guestnote.be` | Neon **`staging` branch** (copy-on-write clone of prod), pooled, as `app_user` | SST-managed (`sst.aws.dns`) |

Staging is a throwaway deploy target for the **web app**. Its Neon branch is isolated from
production *writes* — a staging bug or a bad migration never reaches a real customer row —
but it is **not** free of production *data*: the branch starts as a point-in-time copy of
every production row, customer PII included, and diverges from there. Treat a staging
credential as a production credential, and drop/re-create the branch if it drifts far enough
to matter.

Why SST and not the CDK two-stack `research/05` §8 describes: that document's §2 sanctions
it — *"If the OpenNext plumbing eats more than one weekend, switch wholesale to SST v3."*
Two stages from day one made the multi-stage ergonomics worth it. Correction notes are in
`research/05-architecture.md` §2 and §8.

---

## One-time setup (laptop, `--profile guestnote`)

Do these in order. Nothing here is in CI — CI only ships code.

### 1. SSM parameters

The contract `apps/web/src/env.ts` and CLAUDE.md invariant 6 document: deployed config comes
from SSM at `/guestnote/<env>/*`. SST calls a deploy target a "stage", so this doc writes
`<stage>` for the same path segment — the values are `production` and `staging`.
`sst.config.ts` reads these at deploy time.

```bash
# --- shared ---
aws ssm put-parameter --type String --name /guestnote/shared/HOSTED_ZONE_ID \
  --value "$(aws route53 list-hosted-zones-by-name --dns-name guestnote.be \
    --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')"

# --- per stage: production and staging ---
for STAGE in production staging; do
  aws ssm put-parameter --type SecureString --name /guestnote/$STAGE/DATABASE_URL \
    --value 'postgres://app_user:...-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require'
  aws ssm put-parameter --type SecureString --name /guestnote/$STAGE/DATABASE_URL_UNPOOLED \
    --value 'postgres://<owner>:...eu-central-1.aws.neon.tech/neondb?sslmode=require'   # DIRECT host, no -pooler
  aws ssm put-parameter --type SecureString --name /guestnote/$STAGE/BETTER_AUTH_SECRET \
    --value "$(openssl rand -base64 32)"                                                # distinct per stage
  aws ssm put-parameter --type SecureString --name /guestnote/$STAGE/GOOGLE_CLIENT_ID   --value '...'
  aws ssm put-parameter --type SecureString --name /guestnote/$STAGE/GOOGLE_CLIENT_SECRET --value '...'
  # The migration marker -- see "First deploy" for the value. String, not SecureString:
  # it holds a git SHA, nothing secret.
  aws ssm put-parameter --type String --name /guestnote/$STAGE/MIGRATED_THROUGH --value '<sha>'
done
```

- `DATABASE_URL` is the **pooled** (`-pooler`) host, role `app_user`. `app_user` must have
  been created with SQL and **not** carry `BYPASSRLS` (CLAUDE.md invariant 10) — the health
  check verifies this after deploy.
- `DATABASE_URL_UNPOOLED` is the **direct** host, as the branch owner. Used only by the CI
  migrate step. Never handed to the app.
- `MIGRATED_THROUGH` is the last git SHA whose migration files are applied to that stage's
  Neon branch. `deploy.yml` reads it, applies only migration files added since, and advances
  it. There is no `__drizzle_migrations` journal to derive this from (CLAUDE.md invariant 8),
  so it is tracked here.
- The Neon `staging` branch inherits `app_user` from the primary branch with the same
  password, so only the host differs between the two `DATABASE_URL`s.

### 2. Neon `staging` branch

In the Neon console: branch the primary branch, name it `staging`. Copy its pooled and
direct connection strings into the `/guestnote/staging/*` parameters above. Roles and data
come across automatically.

### 3. Production ACM certificate (us-east-1)

`production` uses `dns: false`, so SST cannot DNS-validate a cert it creates. Make it once:

```bash
ARN=$(aws acm request-certificate --region us-east-1 \
  --domain-name guestnote.be --subject-alternative-names '*.guestnote.be' \
  --validation-method DNS --query CertificateArn --output text)

# Read the two CNAME validation records ACM wants...
aws acm describe-certificate --region us-east-1 --certificate-arn "$ARN" \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'
# ...and UPSERT them into the guestnote.be zone. They are `_x.guestnote.be` CNAMEs and
# touch nothing else. Wait for status ISSUED (a few minutes), then:

aws ssm put-parameter --type String --name /guestnote/production/ACM_CERT_ARN --value "$ARN"
```

Staging's cert is created and validated by SST automatically (all-new names, no conflict).

### 4. GitHub OIDC + deploy role

```bash
aws cloudformation deploy --template-file infra/github-oidc.yaml \
  --stack-name guestnote-github-oidc --capabilities CAPABILITY_NAMED_IAM \
  --profile guestnote --region eu-central-1
```

The trust policy pins the role to two **stage environments** (`environment:staging`,
`environment:production`), not to branch refs — `deploy.yml` runs every deploy against a
GitHub Environment, so that is the claim it presents. Both the classic and the
immutable-subject forms (org `37642555`, repo `1336925415`) are in the template's
`GitHubSub` default. Verify those ids have not changed:

```bash
gh api /repos/JorenNagels/guestnote --jq '{org: .owner.id, repo: .id}'
```

> ⚠️ **`sub` and `aud` are the only claims this policy can pin.** IAM populates just those
> two (plus `job_workflow_ref`) as condition keys; GitHub's `repository` and
> `repository_owner` are in the token but are **not** condition keys, so a `StringEquals`
> on one compares against a key that does not exist — false — and denies every request.
> Measured 2026-08-30: those two were pinned to values the token matched byte-for-byte and
> every deploy was refused for two hours. Do not "harden" this by adding them back. Nothing
> is lost: the immutable `sub` already carries the org and repo ids. ADR 0006 has the full
> account.

> ⚠️ **`GitHubSub` must be passed explicitly on every re-apply. Editing the template's
> `Default:` does nothing to an existing stack** — `aws cloudformation deploy` sends
> `UsePreviousValue=true` for any parameter absent from `--parameter-overrides`, so the
> stored value wins and, if nothing else in the template changed a resource, CFN reports
> "No changes to deploy" and exits 0. Measured 2026-08-29: the branch→environment re-apply
> looked like it succeeded and changed nothing at all. **And pass it as JSON, not
> shorthand** — the value is itself comma-separated (`CommaDelimitedList`) and the
> shorthand parser splits on those commas; that is how the deployed policy ended up with a
> trailing `\` glued to three of its four entries.

**Re-apply after any `GitHubSub` change** — until it lands, CI fails at
`sts:AssumeRoleWithWebIdentity`:

```bash
cat > /tmp/oidc-params.json <<'JSON'
[{"ParameterKey":"GitHubSub","ParameterValue":"repo:JorenNagels/guestnote:environment:staging,repo:JorenNagels/guestnote:environment:production,repo:JorenNagels@37642555/guestnote@1336925415:environment:staging,repo:JorenNagels@37642555/guestnote@1336925415:environment:production"}]
JSON

aws cloudformation deploy --template-file infra/github-oidc.yaml \
  --stack-name guestnote-github-oidc --capabilities CAPABILITY_NAMED_IAM \
  --profile guestnote --region eu-central-1 \
  --parameter-overrides file:///tmp/oidc-params.json

# Confirm -- `deploy` exits 0 on "No changes", so read the result back, never trust the exit code.
aws iam get-role --role-name GuestnoteDeployRole --profile guestnote \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals."token.actions.githubusercontent.com:sub"'
```

Add the repo secret: `gh secret set AWS_ACCOUNT_ID --body 929219061071`.

`GuestnoteDeployRole` carries `AdministratorAccess` (SST's recommendation for a self-hosted
CI role). The trust policy pins it to this repo (`repository` + `repository_owner`) and the
two stage environments, so a botched `GitHubSub` edit cannot widen it beyond the repo — but
any deploy run has admin on the account through it, and for `production` the environment's
required reviewer is the only gate. Least-privilege scoping is [deferred](#deferred).

### 4b. GitHub Environment protection

`deploy.yml` runs against a GitHub Environment named for the stage. In the repo's
Settings → Environments:

- **`staging`** — created automatically on first use. No protection rules needed; a `main`
  push deploys it unattended, which is the point.
- **`production`** — you must configure it before the first `v*` tag:
  - **Required reviewers:** add yourself. This is the gate — a tag push starts the deploy
    and then waits for your approval.
  - **Deployment branches and tags:** *Selected* → add a rule for the tag pattern `v*`.
    Without it any tag can trigger a prod run (still behind the reviewer, but noisier).

The OIDC trust policy in `github-oidc.yaml` pins the deploy role to
`environment:production` / `environment:staging`, so these environments are load-bearing,
not decoration — CI cannot assume the role without them. `research/05` §8's 2026-08-29
correction note frames why the tag + reviewer gate replaced the old `main`→prod push.

### 5. Budgets — already done

The account already carries `guestnote-monthly-cost-{25,50,100}usd` (actual-spend alerts at
$25 / $50 / $100, subscriber `njoren@gmail.com`), created outside this repo. `infra/budgets.yaml`
is the IaC equivalent for a clean account and applying it now only duplicates them — its
header explains. (The account is billed in USD; AWS Budgets rejects any other unit.)

### 6. `sst` is pinned

`package.json` pins `"sst": "3.19.3"` exactly, like every other dependency here — an
OpenNext/Next incompatibility should never arrive via a silent minor bump (`research/05`
§11.1). Bump it deliberately, watch a staging deploy, then commit.

### 7. First deploy (bootstraps SST state + the migration baseline)

CI's migrate step only applies migrations **added since `/guestnote/<stage>/MIGRATED_THROUGH`**
and refuses to run if that marker is unset. The initial full schema, and the marker, have to
go on by hand, once per stage, before CI ever deploys that stage:

```bash
# staging first
UNPOOLED=$(aws ssm get-parameter --name /guestnote/staging/DATABASE_URL_UNPOOLED \
  --with-decryption --query Parameter.Value --output text)
for f in packages/db/migrations/0*.sql; do
  psql "$UNPOOLED" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done

# Point the marker at the commit whose migration set you just applied (usually HEAD).
aws ssm put-parameter --type String --overwrite \
  --name /guestnote/staging/MIGRATED_THROUGH --value "$(git rev-parse HEAD)"

npx sst deploy --stage staging          # auto-creates the sst-state bucket on first run
```

Run the [verification](#verification) against staging. Then repeat for `production`
(migrations + marker + `npx sst deploy --stage production`) and do the
[apex cutover](#the-apex-cutover).

After that: a `main` push deploys staging, a `v*` tag deploys production.

> **Status 2026-08-29:** `staging` is bootstrapped — its Neon branch is at migration `0005`
> and `sst deploy --stage staging` has run from a laptop. It still needs
> `/guestnote/staging/MIGRATED_THROUGH` set (to the SHA of the commit that added `0005` or
> later) before the first CI deploy, or that deploy will try to re-apply `0005` and fail on
> "already exists". `production` is not bootstrapped at all.
>
> **Updated 2026-08-30:** done. The marker is set, and CI has deployed staging end to end
> twice (runs 33302554938 and 33307284710) — every step green, including "Apply new
> migrations", which fails closed when the marker is unset, and the `/api/health` RLS gate.
> `production` is still not bootstrapped and its marker is still unset.

---

## The pipeline

- **`.github/workflows/pr.yml`** — `npm run check` + `npm run db:check` + the DB tier-1
  suite against a Postgres service container. On every PR and on push to `main`.
- **`.github/workflows/deploy.yml`** — push `main` → `staging`, push a `v*` tag →
  `production` (behind the `production` environment's required reviewer), or
  `workflow_dispatch` with a stage picker (code only, no migrations). OIDC into
  `GuestnoteDeployRole`, no stored keys. Steps: restore `.next/cache` → apply new migrations
  (direct endpoint, `--single-transaction`, marker-diffed) → `sst deploy --stage <stage>` →
  verify `/api/health`.

**Rollback:** `git revert <sha>`, then `git push` (staging) or a fresh `v*` tag (production).
The pipeline redeploys the prior tree. Migrations are not auto-reverted — `expand → deploy →
contract` (never drop/rename a column in the same change that stops using it) is what keeps
a revert safe.

---

## The apex cutover

`production` deploys with `dns: false`, so the live `guestnote.be` apex keeps serving
`coming-soon/` until this deliberate step. **CLAUDE.md invariant 12**: Route 53 replaces a
whole record set on write, and the apex `TXT` holds three load-bearing values (Google +
Zoho verification, SPF). Read before you write.

1. `npx sst deploy --stage production`, then get the distribution domain:
   `npx sst outputs --stage production` (or the CloudFront console).
2. Verify against that `*.cloudfront.net` name with a spoofed `Host` **before any DNS
   change** — see verification 1 below.
3. `aws route53 list-resource-record-sets --hosted-zone-id <ZONE>` — read the **whole**
   zone. Note what `www.guestnote.be` currently is.
4. One `change-resource-record-sets` batch that `UPSERT`s **only** these, each an alias to
   the CloudFront distribution (`HostedZoneId: Z2FDTNDATAQYW2`, the fixed CloudFront zone):
   `guestnote.be` A + AAAA, `www.guestnote.be` A + AAAA, `app.guestnote.be` A + AAAA,
   `*.guestnote.be` A + AAAA. It names no `TXT`, `MX`, `_dmarc`, DKIM or `_acme` record, so
   none are touched.
   - You can bring `app.guestnote.be` over first, on its own, and test the dashboard on the
     real hostname while the apex still serves `coming-soon/`. The apex + `www` + wildcard
     go in a later batch.
5. Re-verify on the real hostnames. Then the `coming-soon/` S3 bucket and its CloudFront
   distribution can be torn down (the `waitlist/` Lambda stays).

Once this is trusted, `sst.config.ts` can switch production to
`dns: sst.aws.dns({ zone: zoneId, override: true })` and a normal deploy will do the apex
swap — but only after a human has watched it work once.

---

## Verification

The M1a gate (`research/05` §9). Run against **staging** first, then production.

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | `x-forwarded-host` survives CloudFront → Lambda | `curl -sI https://app.staging.guestnote.be/` | 200, the login page — proves `proxy.ts` saw the real host |
| 2 | `__Host-` cookie survives | sign in on staging, reload | session persists; `Set-Cookie` is `__Host-`-prefixed, `Secure`, no `Domain` |
| 3 | `/pro/*` never cached | `curl -sI https://app.staging.guestnote.be/weddings` | `cache-control: private, no-store`; no `Age`/`x-cache: Hit` on repeat |
| 4 | `/api/health` green | `curl -s https://app.staging.guestnote.be/api/health` | `{"ok":true}`, `db.role:"app_user"`, `bypassRls:false`, `ownMemberships:0` |
| 5 | apex marketing | `curl -sI https://staging.guestnote.be/` | 308 → `/nl`; `cache-control: public, s-maxage=60, stale-while-revalidate=86400` |
| 6 | wildcard 404s | `curl -sI https://no-such-slug.staging.guestnote.be/` | 404 |
| 7 | `www` redirect | `curl -sI https://www.staging.guestnote.be/` | 308 → `https://staging.guestnote.be/` |
| 8 | rollback | revert a trivial commit, push to `main` | redeploy serves the prior tree |

**If verification 1 fails** (every path 404s): OpenNext did not surface the viewer `Host` as
`x-forwarded-host`. Add a CloudFront viewer-request function that copies `Host` into
`x-forwarded-host`, via `transform.cdn` on the `Nextjs` component in `sst.config.ts`. This
is the single highest-risk unknown in M1a and the reason the gate calls it out.

---

## Escape hatch

If OpenNext breaks on a future Next release and cannot be fixed quickly: `research/05` §2's
contingency is **Lambda Web Adapter running `next start`**. The dashboard is `private,
no-store`, so the "ISR cache diverges across instances" objection to that option does not
apply here — it is a genuinely viable host for this surface, reachable in about a day.

## Version pins (fill in after first deploy)

- `sst`: `3.19.3` (`package.json`)
- OpenNext (`@opennextjs/aws`, pulled in by `sst` at deploy time): record after first deploy
  from `.sst/` — `_______`
- OpenNext: `3.9.14` (bundled by `sst` 3.19.3, seen in the first deploy log)
- Next: `16.3.1` (`apps/web/package.json`)
- Lambda runtime: `nodejs22.x`, `arm64` — `nodejs24.x` is rejected by SST 3.19.3's AWS
  provider; revisit on an `sst` bump. Runtime Node != the repo's build-time Node 24.

---

## Deferred

- **Least-privilege deploy role.** `GuestnoteDeployRole` has `AdministratorAccess`. Once
  `sst deploy` has run a full create for both stages, pull the action set from CloudTrail
  (or `sst`'s own IAM report) and replace the managed policy in `infra/github-oidc.yaml`
  with a scoped inline one. Blast radius until then: full admin on account `929219061071`
  for any deploy run — a `main` push, or a `v*` tag once its `production` review is approved.
- **`sst.config.ts` type coverage.** It sits outside `npm run check` — no `tsconfig`
  `include` covers it and it is only linted, not typechecked, because SST's ambient types
  (`sst-env.d.ts`) exist only after `sst install`. A wrong SSM path or env-var name is
  caught at deploy, not in CI. When it matters: add `npx sst install` + a `tsc` step over a
  dedicated `tsconfig` to `pr.yml`. For now, run `npx sst diff --stage staging` locally
  before merging a `sst.config.ts` change.
- **Automated per-tenant DNS / custom domains** — `research/05` §3, unchanged by M1a.
