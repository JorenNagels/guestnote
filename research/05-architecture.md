# Architecture

Decided 2026-08-11. Companion to `04-speclist.md` (what to build) and `06-hosting-costs.md`
(what it costs). This is *how*.

Constraints this design is optimising for: **one developer, ~8–10 h/week, alongside a
full-time job and a July 2027 wedding.** Every choice below trades cleverness for the thing
that survives that.

---

## 0. The decisions, in one table

| Area | Choice |
|---|---|
| Framework | Next.js 16 App Router, `output: 'standalone'`, Cache Components |
| Rendering | **ISR + tag revalidation** for guest sites; dynamic only where genuinely per-request |
| Hosting | **OpenNext (`@opennextjs/aws` v4.x) on Lambda + CloudFront + S3, wired with CDK** |
| Region | `eu-central-1` (Frankfurt). EU-only data residency |
| Tenant routing | `proxy.ts` reads `x-forwarded-host` → rewrites to `/_sites/[tenant]/…` |
| Custom domains | **Deferred to v2.** Schema reserved from day one |
| Database | **Neon Postgres** (on AWS eu-central-1) |
| Query layer | **Drizzle ORM** + `drizzle-kit` migrations |
| Isolation | Tenant-scoped repository layer **+ Postgres RLS** as the backstop |
| Auth | **Better Auth** self-hosted — Organization + magic-link plugins. Guests never get accounts |
| Email | **SES** + `react-email` templates. Friendly-From white-labelling in v1 |
| Payments | **Mollie** (Bancontact/iDEAL economics decide it) |
| Jobs | EventBridge Scheduler one-shots → SQS → Lambda |
| IaC | **CDK**, two stacks: Foundation / App |

---

## 1. Rendering — server-rendered, but not per request

The instinct to move off static export is right: pages must be rendered from the database,
not baked at build time. The refinement is **when** the server renders — on publish, rather
than on every request.

A wedding site is edited 5–20 times over a year, then read by 200–300 guests. Reads outnumber
writes about **1000:1**, and the HTML is identical for everyone in a guest group. That is the
textbook profile for regenerate-on-publish.

| | Per-request SSR | ISR + tag revalidation |
|---|---|---|
| Lambda invocations/mo at 100 weddings | ~300,000 | ~2,000 |
| DB queries/mo | ~900,000 | ~6,000 |
| p50 TTFB | 150–400 ms | **~20 ms** (edge hit) |
| p99 TTFB | **1.5–2.5 s** (cold start) | ~20 ms |
| When the database is down | **every customer's site is down** | **sites keep serving** |

That last row decides it. A wedding site's worst possible day is the day the invitations
land — a traffic spike, everyone on mobile 4G, and a solo maintainer at their day job. ISR
means CloudFront absorbs that spike entirely, and a database problem degrades RSVP submission
rather than taking 100 customers' sites offline.

**Note that cost is not on this list.** See `06-hosting-costs.md` — both options are free at
this scale. Choose on latency and resilience.

### Per surface

| Surface | Host | Strategy |
|---|---|---|
| Marketing | `guestnote.be` | Static / `use cache` with `cacheLife('max')`, revalidated on deploy |
| Guest wedding site | `<slug>.guestnote.be` | **ISR** — `use cache` + `cacheTag('wedding:<id>')`, busted by `revalidateTag` on publish |
| RSVP flow | `<slug>.guestnote.be/rsvp/*` | Cached shell (same tag) + per-household data in a `<Suspense>` boundary; mutations via Route Handlers |
| Planner dashboard | `pro.guestnote.be` | SSR shell (auth, org context, nav) + client-side data via TanStack Query. `Cache-Control: private, no-store` |
| Couple editor | `pro.guestnote.be/w/<id>/edit` | Same, plus a preview iframe rendering with a draft token (cache bypassed) |
| Webhooks, uploads, health | `/api/*` | Dynamic Route Handlers, no cache |

The dashboard is deliberately **not** RSC-per-interaction. A guest table with inline edit,
filter, sort and CSV export is an *app*; a server round-trip per filter change is worse UX
and more Lambda invocations than fetching once and filtering client-side.

### How tenancy and caching coexist

Cache Components forbid reading `headers()` inside a `use cache` scope — a problem, because
the tenant *comes from* a header. The standard resolution:

1. `proxy.ts` (Next 16's renamed `middleware.ts`, now on the Node runtime) reads the host and
   **rewrites** `jan-en-els.guestnote.be/story` → `/_sites/jan-en-els/story`.
2. The page is `app/_sites/[tenant]/[[...slug]]/page.tsx`. The tenant is now a route param, so
   it is part of the cache key and `use cache` works per tenant with no header reads.
3. Publish calls `revalidateTag('wedding:' + id, 'max')` — Next 16 made the `cacheLife`
   profile argument **required**.

### Two CloudFront traps

**Trap 1 — the cache key must include the host.** Otherwise tenant A's HTML gets served to
tenant B. That is a silent, catastrophic cross-tenant leak. Include `x-forwarded-host` in the
cache key policy.

**Trap 2 — CloudFront invalidations are path-only.** You cannot invalidate one tenant's pages
on a shared distribution. Invalidating `/*` on every publish nukes every tenant's cache — fine
at 10 tenants, unacceptable at 100. So avoid needing invalidation:

- HTML gets `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`
- OpenNext's S3 incremental cache is the authoritative long-lived cache; CloudFront is a
  60-second shock absorber
- Publish → `revalidateTag` → regenerate → visible within 60 s. Tell the user "live in about
  a minute"
- `/_next/static/*` and image derivatives keep `max-age=31536000, immutable` — content-hashed,
  never need invalidating

**Also:** CloudFront rewrites `Host` when forwarding to a custom origin, and a Lambda Function
URL rejects a mismatched Host. Use the managed origin request policy
`AllViewerExceptHostHeader` plus a CloudFront Function that copies the viewer `Host` into
`x-forwarded-host`. `proxy.ts` reads `x-forwarded-host` first, falling back to `host` for
local dev.

---

## 2. Hosting — why OpenNext

Four options were compared. Summary of why the other three lost:

| Option | Verdict |
|---|---|
| **OpenNext on Lambda + CloudFront + S3, via CDK** | **Chosen.** Correct on-demand revalidation, full CloudFront control, €0 idle, no wall at 100 tenants |
| AWS Amplify Hosting | **Rejected.** **5 domains per app, 50 subdomains per domain and the 50 is not adjustable** — a permanent wall for a product whose Studio tier is sold on white-label domains. Also: AWS docs still say Next.js support goes "up through 15" |
| `next start` on ECS Fargate / App Runner | **Rejected.** ~$27/mo floor (Fargate + ALB) at zero traffic, and Next's default ISR cache is on **local disk** — with >1 task, `revalidateTag` on task A doesn't reach task B and they serve divergent content |
| Lambda Web Adapter running `next start` | **Contingency only.** Same broken-ISR-across-instances problem, and here it's guaranteed to bite. Keep as an escape hatch if OpenNext ever breaks on a Next release — accept a dumber time-based cache and be back online in a day |

**Cold start:** ~600 ms–1.5 s on ARM64. Mitigations that work: ARM64/Graviton, 1536 MB memory
(more CPU → shorter duration, often *cheaper* per request), and OpenNext's built-in warmer
function on a 5-minute EventBridge rule. **Lambda SnapStart does not support Node.js** — don't
plan around it. With ISR, cold starts are off the guest read path entirely; they only affect
the dashboard, which the warmer covers.

**If the OpenNext plumbing eats more than one weekend**, switch wholesale to **SST v3**
(`sst.aws.Nextjs`), which wraps OpenNext and gives preview stages nearly free. Different IaC
paradigm, so it's an either/or, not a mix. Decide once in M1 and don't revisit.

---

## 3. Multi-tenant domains

### Certificates

Request **one ACM certificate in `us-east-1`** with SANs `guestnote.be` **and**
`*.guestnote.be`. The wildcard covers exactly one label — `jan-en-els.guestnote.be` ✓,
`pro.guestnote.be` ✓, but **not the apex**, hence the second SAN. (Same trap as the existing
`*.se-parti.be` cert.)

CloudFront's alternate-domain-name quota is **100 per distribution**, and a wildcard entry
counts as **one**. So `*.guestnote.be` gives unlimited subdomain tenants on a single
distribution, forever, with zero per-tenant infrastructure.

### Host → tenant resolution

```
proxy.ts (Node runtime)
  host = x-forwarded-host ?? host, lowercased, port stripped
  ├─ apex / www.        → rewrite /(marketing)/...
  ├─ pro.guestnote.be   → rewrite /pro/...      + Cache-Control: private, no-store
  ├─ *.guestnote.be     → slug = first label    → rewrite /_sites/<slug>/...
  └─ anything else      → custom domain branch  → 404 until v2
```

The first three branches are **pure string work — zero I/O**. That is why subdomains-first is
so attractive: there is nothing to look up, nothing to cache, nothing to go stale.

### Why custom domains are deferred

Custom domains break every property above: each is another alternate domain name, each add is
a 5–15 minute distribution deployment, and you hit the quota around 100 customers. Onboarding
cannot be a CloudFormation change.

The right tool when the time comes is **CloudFront SaaS Manager** — a template distribution
plus per-customer *distribution tenants*, ~2,000 certificates per distribution instead of 100
alternate domain names, and **ACM issues HTTP-validated certs automatically**, which removes
the worst part of custom-domain onboarding (no `_acme-challenge` TXT record for the customer
to paste). Pricing: first 10 tenants free, 11–200 flat $20/mo. Tenants are created at runtime
via SDK, not IaC, so thin CDK L2 coverage doesn't matter.

But **defer it**, because:

- `<couple>.guestnote.be` delivers ~95% of the perceived value. Couples care that the URL is
  theirs and pretty, not that it's second-level.
- It is a permanent **support burden on other people's DNS**. Your customers are at Combell,
  one.com, Hostnet and Wix. You will debug CNAME flattening, apex ALIAS records, conflicting
  MX entries and TTL propagation for people who don't know what a nameserver is. Worst
  hours-per-euro on the roadmap for a solo dev.
- It's a natural paywall for the Studio tier. Build it when a paying customer asks.

**Design for it now at zero cost:** the `wedding_domains` table exists from day one, and host
resolution goes through one function with a `custom` branch that currently returns 404.
Retrofitting later means a migration plus a rewrite of every canonical-URL and email-link
generator.

---

## 4. Data layer

### Why Neon

The domain is genuinely relational — org → wedding → events → households → guests →
per-event RSVPs → seating → assignments — and the planner dashboard is a *query-shaped*
application. Every new filter a planner asks for is one line of SQL, versus a new GSI and a
backfill in DynamoDB.

DynamoDB was seriously considered and is more viable than the usual objections suggest: a
whole wedding is ~200 KB, so `Query` on `PK = WEDDING#<id>` returns the entire dataset and you
filter in JavaScript. That neutralises the "no joins" argument. What it does not neutralise is
that **DynamoDB asks you to know your access patterns before you write the schema, and the
planner calls exist precisely to find out what those are.**

Among Postgres hosts, Neon wins on one specific property: **it connects over HTTPS.** That
deletes the VPC, the NAT Gateway ($37.96/mo), RDS Proxy ($22/mo), the Lambda
connection-exhaustion problem, and the MigrationRunner-Lambda workaround needed to reach a
private-subnet database from CI. Migrations run straight from GitHub Actions. Database
branching gives near-free per-PR preview environments.

Free tier: 0.5 GiB storage, 100 CU-hours/month, scale-to-zero, on AWS eu-central-1. A hundred
weddings is ~20 MB. Past the free tier it's usage-based with no monthly floor.

**Cost of this choice:** Neon's parent is US-incorporated, so it goes on the sub-processor list
alongside AWS and Mollie, with a DPA and SCCs. If that becomes a real objection in a planner
or venue sales conversation, **Aiven** (Finnish, EU jurisdiction, also has a free tier) is the
drop-in swap, or RDS at ~$54/mo all-in.

> ⚠️ **Sharp edge.** Neon's HTTP driver runs each statement as its own implicit transaction,
> which breaks the transaction-scoped `set_config()` that RLS depends on. Use the **HTTP
> driver for cached reads** and the **WebSocket/pooled driver inside `withTenant()`**. Keep
> both behind one module (`packages/db/client.ts`) so switching provider stays a one-file
> change.

### ORM: Drizzle, not Prisma

- Prisma's Rust query engine is a ~15–20 MB binary that inflates the Lambda bundle and adds
  cold-start time on the one function whose cold start matters.
- Migrations are plain readable `.sql` files — which matters concretely, because you need
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` in them, and Prisma's
  model-first engine handles that awkwardly.
- `drizzle-zod` regenerates input validation from the tables — a direct evolution of the trick
  already in `se-parti-rsvp/lambda/src/lib/validation.ts`.
- You will drop to raw SQL for seating and reporting. Drizzle makes that a non-event.

### Schema

Every tenant-scoped table carries **both** `org_id` and `wedding_id`, denormalised onto
children on purpose: it makes every RLS policy a single-column check with no joins, and every
index a composite starting with the tenant column.

```
-- Identity, billing, tenancy
organizations       id, slug, name, type('planner'|'venue'|'couple_direct'), plan,
                    brand jsonb {logo_url, colors, from_name, reply_to},
                    mollie_customer_id, subscription_status, created_at, deleted_at
org_members         PK(org_id, user_id), role('owner'|'admin'|'member'), invited_by, created_at
users / sessions /
  accounts / verifications          -- owned by Better Auth
invitations_org     id, org_id, email, role, token_hash, expires_at, accepted_at

weddings            id, org_id, slug UNIQUE, status('draft'|'live'|'archived'),
                    template_id, locale_default, locales text[],
                    couple_display_name, couple_names text[2], wedding_date, timezone,
                    theme jsonb, published_at, published_version int,
                    retention_delete_after date, created_at, deleted_at
wedding_members     PK(wedding_id, user_id), role('couple'|'editor')
wedding_domains     id, wedding_id, domain UNIQUE, kind('subdomain'|'custom'),
                    cf_tenant_id, cert_status, verified_at, is_primary

-- Content (this replaces shared/src/weddings/*.ts entirely)
site_pages          id, wedding_id, key, sort, visible
site_blocks         id, wedding_id, page_id, type, sort, props jsonb,
                    audience('all'|'day'|'evening'|group_tag)
media_assets        id, wedding_id, s3_key, kind, width, height, blurhash, bytes, created_at

-- Events & guests
locations           id, wedding_id, name, address, lat, lng, map_url
events              id, wedding_id, key, name_i18n jsonb, starts_at, ends_at,
                    location_id, capacity, rsvp_deadline, sort
guest_groups        id, wedding_id, label, language, address jsonb, notes, created_at
                    -- the household: the unit that receives ONE invitation
guests              id, wedding_id, group_id, first_name, last_name, email, phone,
                    language, is_child, age_band, plus_one_of, email_status,
                    notes, created_at, updated_at, deleted_at
group_event_invites PK(group_id, event_id), wedding_id, invited bool
rsvps               id, wedding_id, guest_id, event_id, status('pending'|'yes'|'no'),
                    responded_at, responded_by_guest_id, source('link'|'lookup'|'admin')
                    UNIQUE(guest_id, event_id)
questions           id, wedding_id, event_id NULL, key, type('boolean'|'text'|'select'|'number'),
                    label_i18n jsonb, options jsonb, required, sort,
                    scope('guest'|'group'), is_dietary bool
rsvp_answers        id, wedding_id, guest_id, question_id, value jsonb
                    UNIQUE(guest_id, question_id)

-- Seating (T3 feature, schema reserved now)
seating_tables      id, wedding_id, event_id, name, shape, seats, x, y
seat_assignments    id, wedding_id, table_id, guest_id, seat_no  UNIQUE(event_id, guest_id)

-- Comms & ops
guest_invitations   id, wedding_id, group_id, token_hash UNIQUE, token_version,
                    channel, sent_at, first_opened_at, open_count, distinct_ips,
                    revoked_at, expires_at
email_log           id, wedding_id, guest_id, to_email, template, locale,
                    provider_message_id, status, idempotency_key UNIQUE,
                    sent_at, bounced_at, complained_at
jobs                id, wedding_id, kind, run_at, payload jsonb, attempts, status
audit_log           id, org_id, wedding_id, actor_user_id, action, target, diff jsonb, at
payments            id, org_id, wedding_id, mollie_id, kind, amount_cents, status, at
```

Note there is **no `allergies` column**. See §7.

### Tenant isolation — belt and braces

**Layer 1 — a repository layer that cannot be called without a tenant context.**

`packages/db` exports **no raw handle**. It exports `withTenant(ctx, fn)`, which opens a
transaction, sets the GUCs, and hands the callback a `TenantDb` whose every method has the
tenant predicate pre-applied. The unscoped handle exists as
`unsafeDbForMigrationsAndAdminOnly` — deliberately ugly so it's visible in every diff — and an
ESLint `no-restricted-imports` rule bans it outside `packages/db/**` and `infra/migrations/**`.

Guest-facing code uses a **separate, deliberately tiny** `guestRepo` exposing ~6 operations
(`getHouseholdByToken`, `getSiteForGroup`, `submitRsvp`, …). It has **no listing method at
all**, so there is no code path by which a guest token can enumerate a guest list.

**Layer 2 — Postgres RLS, the backstop for the bug you didn't foresee.**

```sql
-- app connects as app_user: NOT the table owner, no BYPASSRLS
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON guests
  USING (
    org_id = current_setting('app.org_id', true)::uuid
    AND (
      current_setting('app.wedding_id', true) IS NULL
      OR wedding_id = current_setting('app.wedding_id', true)::uuid
    )
  );
```

`withTenant` issues `SELECT set_config('app.org_id', $1, true)` as the **first statement inside
the transaction**. The `true` makes it transaction-local — non-negotiable with pooled
connections, or one request's tenant leaks into the next. The dashboard sets only `app.org_id`
(cross-wedding reads within the org); a guest request sets both, derived from the *verified
token*, never from user input.

**Test it (F6).** A `vitest` suite that, for each tenant table, asserts a query under tenant
A's GUCs returns zero of tenant B's rows. ~50 lines, runs in CI, and it is the highest-value
test in the repo.

---

## 5. Auth

There are **three** authentication problems and they should not share a mechanism.

### Guests — no accounts, ever

- One invitation token per **household** (`guest_groups`), not per guest. The household is the
  unit that receives an invitation.
- **Opaque 128-bit random, base62-encoded (~22 chars)**, stored **SHA-256 hashed** in
  `guest_invitations.token_hash`. URL: `https://jan-en-els.guestnote.be/rsvp/K3n8Qp…`
- **Explicitly not a JWT.** The deciding argument is **revocation**: a JWT is valid until it
  expires and cannot be un-sent, whereas a DB-backed token is revoked with one `UPDATE`,
  rotatable ("regenerate link"), and *countable* — you can show the couple "opened 9 times from
  4 devices", which is both a security signal and a nice dashboard feature. The "stateless is
  cheaper" argument doesn't apply when every use is followed by a database write anyway.
- **On first visit**, issue a short-lived cookie `__Host-gn_guest` (HttpOnly, Secure,
  SameSite=Lax, 30 days) carrying an HMAC-signed `{ weddingId, groupId, invitationId, v }`. The
  raw token then disappears from every subsequent URL — keeping it out of referrer headers,
  WhatsApp link previews and analytics.
- **Expiry:** token valid until `wedding_date + 30 days`. **Revocation:** `revoked_at` plus
  `token_version`; bumping the version invalidates every cookie already issued.

**Link sharing is the accepted threat model, not a bug.** A wedding invite link *will* be
forwarded into the family WhatsApp group. So the token grants only what a household member
should legitimately see: their own household's guests and RSVPs, and their group's visible site
content. **Never a listing endpoint. Never the full guest list. Never seating.** Plus a WAF
rate rule (100 req / 5 min per IP on `/rsvp/*`) and open-count surfaced to the couple.

**Optional per-wedding second factor:** "confirm the surname on your invitation" before the
token unlocks. Costs nothing, uses knowledge the household already has, and is exactly what the
more private couples will ask for. Ship as an opt-in toggle.

**Name-lookup fallback (G5)** is an enumeration oracle by construction. Keep it — it genuinely
reduces support load — but: exact first + last name only, no "did you mean", return only the
matching household, hard WAF limits (5/min, 20/hour per IP), and opt-out per wedding.

### Couples and planners — Better Auth

| | Clerk | Cognito | **Better Auth** |
|---|---|---|---|
| Fixed cost | **€0** to 100 MROs; $25/mo to drop Clerk branding | ~free at this scale | **€0** |
| Orgs / roles / seats / invitations | Excellent | **None** — you build it, 2–3 weekends | Organization plugin |
| EU residency | US by default; EU tier/price unconfirmed | clean | **your own Postgres** |
| Maturity | Very mature | Mature, ugly | 1.6.x — core stable, you own patching |

> ⚠️ **Corrected 2026-08-12.** This table previously claimed Clerk costs `$25/mo + $100/mo B2B
> add-on` from day one. That was wrong — Organizations are included on Free, and the add-on is
> only triggered past 100 MROs. **Cost is not why Clerk lost.** The full comparison, the checked
> Clerk numbers and the org/role model now live in **`07-auth-and-tenancy.md`**, which supersedes
> this section.

Better Auth wins on three things that survive cost being neutral: the wedding-level authz layer
is custom under any vendor, so vendor org features cover only ~30% of the model; keeping users in
the same Postgres makes every permission check one SQL query inside the transaction that sets
`app.org_id`, rather than a call across an API that RLS cannot join to; and white-label branding
plus auth email ride the SES pipeline §6 already requires. EU residency is free rather than an
Enterprise conversation — there is no identity sub-processor to put on the DPA at all.

**Hedge:** keep auth behind a thin `packages/core/auth` interface exposing only `getSession()`,
`requireOrgMember(orgId, minRole)` and the invitation flow. Swapping to Clerk later becomes a
bounded one-weekend job.

### Roles

- `org_members`: `owner` (billing) / `admin` (all weddings) / `member` (assigned weddings only)
- `wedding_members`: `couple` / `editor` — a couple attaches to one wedding, not to the org
- **A direct couple gets their own org** of type `couple_direct`. One code path for everything,
  and "a planner takes over this couple's wedding" becomes one `weddings.org_id` update.

---

## 6. Supporting services

### Email — SES with react-email

SES at 60k emails/month costs ~$6; Resend is roughly 4× that and gates EU residency behind Pro.
But use **`react-email`** regardless — typed React templates, local preview via `email dev`,
version-controlled beside the app, i18n through the same `next-intl` catalogues — rendered to
HTML and handed to SES v2 `SendEmail`.

**White-label, staged:**
- **v1 — friendly-From.** `From: "Studio Wit — via Guestnote" <noreply@guestnote.be>` with
  `Reply-To:` the planner's address. Zero per-tenant SES setup, deliverability rides on a
  reputation you control, captures ~90% of the perceived white-labelling.
- **v2 — true white-label** (`rsvp@studiowit.be`, Studio tier). Per-customer verified SES
  identity, DKIM CNAMEs shown in the dashboard, a scheduled poller calling `GetEmailIdentity`
  until `SUCCESS`. SES allows 10,000 verified identities per account.

**Bounce/complaint handling is mandatory, not optional.** SES configuration set → SNS → SQS →
Lambda writing `email_log.bounced_at` and flipping `guests.email_status`. One tenant importing
a stale CSV can torch your account's sending reputation and take down email for *every*
customer. Give each tenant its own configuration set so reputation is attributable, and enforce
a per-tenant sending cap. Get SES production access before you need it — approval takes a day.

### Images

User-uploaded photos are the one place this architecture can get expensive.

- **Upload:** S3 **presigned POST** (not PUT — POST lets the policy enforce
  `content-length-range` and content type) straight from the browser. Never proxy through Lambda.
- **Do NOT use `next/image` + the OpenNext image function for user content.** It re-optimises
  on demand per size per format, is cold-start-prone (`sharp`), and `/_next/image?url=…&w=…` is
  an unbounded compute surface an attacker can hammer with 30 widths × 3 formats.
- **Optimise once, at upload.** S3 `ObjectCreated` → Lambda (ARM64, 1536 MB, `sharp`) → a fixed
  ladder (400/800/1600/2400 px, AVIF + WebP) into a `derived/` prefix, plus a blurhash into
  `media_assets`. Serve via `<img srcset>` or a custom loader — reuse the pattern in
  `se-parti-website/src/lib/imageLoader.ts`. Cost becomes deterministic, everything is
  `immutable`-cacheable forever.

### Background jobs — three shapes, three tools

- **Scheduled sends** ("14 days before the deadline") → **EventBridge Scheduler** one-shots
  created when the deadline is set: `at(2027-05-01T09:00:00)`, `ActionAfterCompletion: DELETE`,
  target SQS. Built for millions of one-time schedules at $1.00/million. **Do not** cron-scan
  the table every minute.
- **Fan-out** (150 emails in one batch) → **SQS** + Lambda with `batchSize: 10`, reserved
  concurrency capped below the SES send rate, plus a DLQ. **Idempotency key
  `(wedding_id, guest_id, template, scheduled_for)` with a unique index on `email_log`** — the
  single most important reliability detail here. Double-sending a wedding invitation is a
  support incident and an apology.
- **Nightly maintenance** (retention purge, SES identity polling) → one EventBridge cron rule.
- **Step Functions:** only for the custom-domain onboarding saga in v2, where waits span hours.

### Payments — Mollie

On a €149 one-off paid by **Bancontact**: Mollie **€0.39 flat** vs Stripe **1.4% + €0.25 =
€2.34**. iDEAL is €0.29–0.32 at both. Those two methods will be 70%+ of Benelux couple
checkouts. Mollie Subscriptions also handles **SEPA direct debit**, which is what a Belgian SME
wants for a €49/mo invoice. Use Mollie for both until billing gets genuinely complex.

Mollie webhooks send **only an id** — `/api/webhooks/mollie` must re-fetch the payment before
acting, and be idempotent on `mollie_id`.

### Observability & secrets

- **Sentry** with **EU ingest** (`ingest.de.sentry.io`). Tag every event with `weddingId` and
  `orgId` — you will want "which wedding is broken" in one click.
- **CloudWatch Logs with `retention: 30 days` on every log group.** The default is Never
  Expire, a slow-growing bill for logs you'll never read.
- **CloudWatch EMF** for five numbers: `rsvp_submitted`, `email_sent`, `email_bounced`,
  `site_published`, `checkout_completed`. One dashboard. Skip a metrics vendor entirely.
- **AWS Budgets alarms at €25 / €50 / €100 on day one.** Cheapest insurance in the stack.
- **External uptime check** (free tier) against `pro.guestnote.be/api/health` and one live
  tenant site. External is the point — CloudWatch can't tell you CloudFront is down.
- **SSM Parameter Store `SecureString`** for secrets — standard parameters are free, whereas
  Secrets Manager is $0.40/secret/month (~$12/mo across two environments for nothing).

---

## 7. Two product decisions with legal weight

**Don't collect free-text "allergies".** Under GDPR Art. 9 that is arguably special-category
health data, which raises the bar substantially — explicit consent, DPIA pressure, stricter
breach obligations. Instead collect **dietary preferences** as a closed enum
(`vegetarian | vegan | gluten_free | lactose_free | halal | other`) plus an optional
"anything else we should know" the guest volunteers. Flag both `is_dietary` so the retention job
can purge exactly those rows first. A five-minute product decision that removes a category of
legal risk permanently.

**Two-stage retention**, nightly EventBridge → Lambda:

- `weddings.retention_delete_after = wedding_date + 6 months` (org-configurable, max 24)
- **Stage 1 (at the date):** null `guests.email/phone`, delete dietary `rsvp_answers`, null
  `guest_groups.address`, delete `email_log` rows, revoke all invitations. **Keep aggregate
  counts** so the planner retains their own business records.
- **Stage 2 (+24 months):** hard-delete the wedding cascade and the `media/<wedding_id>/` prefix.

You are the **processor**; the couple/planner is the **controller**. Ship a DPA template and a
sub-processor list (AWS, Neon, Mollie, Sentry) **before** the first paying planner, not after.
Data portability = the CSV export planners want anyway — pleasant alignment.

---

## 8. Repo and deploy

```
guestnote/
  apps/web/                    # ONE Next.js 16 app
    proxy.ts                   # Host → tenant rewrite
    app/
      (marketing)/             # apex host
      _sites/[tenant]/         # guest wedding sites (rewrite target)
      pro/                     # planner dashboard + couple editor
      api/                     # rsvp, webhooks, uploads, health
  packages/
    db/                        # drizzle schema, migrations/*.sql, RLS, withTenant(), repositories
    core/                      # rsvp rules, guest import, retention, seating
    email/                     # react-email templates + SES client + i18n
    templates/                 # the 5–6 site templates
    ui/                        # shadcn/ui ported from se-parti-rsvp
    config/                    # zod schemas for block props, theme, dynamic questions
  infra/                       # CDK app
  .github/workflows/
```

**npm workspaces** — same as today. Don't introduce pnpm + Turborepo until build times hurt.

**One Next app, not three:** tenant resolution is one `proxy.ts`, the template components are
shared between the editor preview and the live site, and three apps means three distributions
and three pipelines for one developer.

**CDK, two stacks.** `FoundationStack` (S3 buckets, SES config sets, SQS + DLQs, EventBridge,
SSM, WAF) changes rarely; `AppStack` (OpenNext functions, CloudFront, Route53) changes every
deploy. Separated so an app deploy can never touch stateful resources. Runtime
**`NODEJS_24_X`, ARM64** — carry forward the hygiene already in
`emma-joren/infrastructure/lib/stack.ts` (Origin Access Control, SES IAM scoped to the identity
ARN rather than `*`).

**Environments: `dev` and `prod` only.** A solo dev at 8 h/week will not maintain three, and an
unused staging environment rots and then lies to you. Add staging when you have paying planners
and can't afford a bad Friday.

**CI/CD** — GitHub Actions + OIDC, reusing the `GitHubActionsDeployRole` pattern:
- `pr.yml`: typecheck · lint · `vitest run` (including F6) · `drizzle-kit check` · Playwright smoke
- `deploy-prod.yml` on push to `main`: build → migrate → deploy. Use `main` rather than the
  current `v*.*.*` tag trigger; tagging every deploy is friction a solo dev eventually skips.
- Cache `~/.npm` and `.next/cache` — the latter materially cuts build times.

**Migration discipline:** migrations run *before* the new code deploys, so there is always a
window where old code runs against a new schema. Adopt **expand → deploy → contract** now,
while it's cheap: never drop or rename a column in the same PR that stops using it.

**Preview environments:** Neon's database branching makes per-PR *data* free, but per-PR
OpenNext + CloudFront still takes 15+ minutes and real money for an audience of one. Use local
dev plus a `workflow_dispatch` push to the shared `dev` deployment. **Rollback is
`git revert` + redeploy** — at this scale that is genuinely correct.

---

## 9. Build order

| # | Milestone | Effort | Gate |
|---|---|---|---|
| **M0** | Register domains, Route 53 zone, ACM cert (`guestnote.be` + `*.guestnote.be`) in **us-east-1**, scoped deploy role, budget alarms | ½ wknd | |
| **M1** | **Skeleton proving the hard parts** — Next 16 + OpenNext + CDK behind CloudFront. Prove: two hardcoded tenants render differently · ISR caches per host · `revalidateTag` busts one and not the other · `x-forwarded-host` arrives intact | 2 | **Build no features until this is green** |
| **M2** | Neon + Drizzle schema + RLS + `withTenant` + F6 isolation suite + migrations in CI. Seed from the two existing `se-parti-rsvp` weddings | 1–2 | |
| **M3** | Better Auth: orgs, magic link, invitations. `pro.guestnote.be` login → org switcher → wedding list | 1–2 | |
| **M4** | Guest site rendered from the database. One template from `site_blocks`, theme from `weddings.theme` (port `contrast.ts`), NL/EN via `next-intl`, publish → `revalidateTag` | 2 | **Config stops being code** |
| **M5** | RSVP: invitation tokens, guest cookie, per-event, dynamic questions, confirmation email | 2 | Revenue-critical path |
| **M6** | Planner dashboard: guest table, CSV import/export, households, invite sending, counts per event | 2–3 | **The B2B product** |
| **M7** | Couple editor: text/photos/colours/sections, draft+publish, media upload + `sharp` pipeline | 2–3 | |
| **M8** | Self-serve onboarding, slug uniqueness + reserved words | 1–2 | **← the day-90 goal** |
| **M9** | Mollie checkout + subscriptions, feature gating on `organizations.plan` | 1–2 | |
| **M10** | Reminders, bounce pipeline, retention job, DPA + privacy policy | 1 | |

---

## 10. Prior art to carry forward

| File | What to do with it |
|---|---|
| `se-parti-rsvp/lambda/src/lib/validation.ts` | **Port near-verbatim.** Builds a Zod schema dynamically from tenant config — the single most valuable file in the old repo. Source questions from the `questions` table instead of a TS file |
| `se-parti-rsvp/shared/src/weddingConfig.ts` | Becomes the `weddings` + `questions` + `site_blocks` tables. The AWS-resource fields all disappear, which is the whole point |
| `se-parti-rsvp/frontend/src/lib/contrast.ts` | Move to `packages/ui` unchanged. *More* valuable when tenants pick palettes through a UI with no human review |
| `se-parti-rsvp/frontend/src/components/dashboard/DataTable.tsx` + `components/ui/*` | The seed of `packages/ui` |
| `emma-joren/infrastructure/lib/stack.ts` | The infra hygiene to inherit: `NODEJS_24_X`, Origin Access Control, scoped SES IAM |
| `se-parti-website/src/lib/imageLoader.ts` | The custom-loader pattern for pre-derived images |
| `se-parti-rsvp/.github/workflows/deploy.yml` | Keep the OIDC pattern; the per-wedding deploy matrix is exactly what disappears |

**Don't migrate the existing weddings** until Guestnote renders them *better* than the current
stacks. Don't couple a rebuild to a migration — let the old per-wedding stacks run until
they're strictly worse.

---

## 11. Flagged uncertainties — verify before committing

1. **`@opennextjs/aws` v4.x against Next 16 Cache Components** and the new required
   `revalidateTag(tag, profile)` signature. The published compatibility matrix is stale.
   **M1 exists to find this out in a weekend rather than three months in.** Also watch the
   official AWS adapter built on the stable Adapter API (Next 16.2) — it may become the better
   target inside the build window.
2. **Neon + RLS via the WebSocket driver** — confirm `set_config(..., true)` survives their
   pooler as expected. Test in M2, not M6.
3. **CloudFront SaaS Manager** per-tenant invalidation — if
   `CreateInvalidationForDistributionTenant` exists, the 60-second TTL compromise in §1 can be
   replaced with precise invalidation. Only relevant once custom domains land.
4. **SES tenant management** (per-tenant reputation isolation) availability in `eu-central-1`.
   Built for exactly this shape; worth adopting if present.
