# What Guestnote costs to host on AWS

Written 2026-08-11. Answers the question: *we currently pay essentially nothing for S3 +
Lambda static sites — what does moving to server-rendered Next.js on AWS actually cost?*

All AWS figures below were pulled from the **AWS Pricing API for `eu-central-1`** on
2026-08-11, not from memory or blog posts. Third-party prices are list prices and should be
treated as ±10%.

> ⚠️ **Note 2026-08-17: this models the wrong traffic profile for what is being built first.**
> Everything below is 100 weddings of *guest* traffic — many readers, one absorbable spike per
> wedding, CloudFront doing the work. The planner dashboard (`09-planner-app.md`) is the opposite
> shape: few users, no spike to absorb, but **per-request Lambda and per-request Neon compute**
> because it is `private, no-store` by design.
>
> Nothing below is wrong; it is computed for the other half of the product. The number to watch
> during PH0–PH3 is **Neon's 100 CU-hours/month with scale-to-zero**, not CloudFront GB — and
> especially so once OpenNext's warmer function starts poking the app every five minutes, which
> defeats scale-to-zero if the health check touches the database. Re-model when the guest sites
> land at PH4.

---

## The short answer

**Server-side rendering does not cost you the free ride.**

At 100 live weddings you'd pay AWS roughly **€6–8/month**, almost all of it SES email, while
billing €5,000–10,000/month. The free tiers that make the current setup free are the
**permanent** ones — CloudFront's 1 TB, Lambda's 1M requests, DynamoDB's 25 GB — not the
12-month ones, which lapsed on account `438465163166` years ago.

The expensive decisions in this architecture are not compute. They are **the database
topology** (§4) and **a designer** (§6).

---

## 1. SSR vs ISR is not a cost decision at this scale

I went looking for a cost argument that would justify ISR over per-request SSR. There isn't
one, and it's worth stating plainly rather than pretending otherwise.

At 100 live weddings ≈ 300,000 page views/month:

| | Per-request SSR | ISR + tag revalidation |
|---|---|---|
| Lambda invocations/mo | ~300,000 | ~2,000 |
| Lambda GB-seconds/mo (1536 MB, ~300 ms) | ~135,000 | ~1,000 |
| **Lambda free tier** | **1M requests + 400,000 GB-s, permanent** | same |
| **Cost** | **€0** | **€0** |

Full per-request SSR fits inside the permanent free tier with room to spare. The crossover
where compute starts costing real money is somewhere past **a million page views a month** —
years away, and by then the revenue dwarfs the bill.

**So choose ISR on its merits, not its price:** p99 TTFB of ~20 ms instead of ~2 s, and the
guest sites keep serving when the database is down. See `05-architecture.md` §1.

---

## 2. Line by line, at 100 weddings

Assumptions: 100 live weddings, ~200 guests each, ~300k page views/month, ~60k emails/month,
~20 MB of database, a few GB of images.

| Service | Free allowance | Usage at 100 weddings | Cost |
|---|---|---|---|
| **CloudFront** | 1 TB out + 10M requests/mo, **permanent, every account** | ~20 GB, ~2M requests | **€0** |
| **Lambda** (server, image, revalidation, warmer) | 1M req + 400k GB-s/mo, **permanent** | ~5k invocations with ISR | **€0** |
| **S3** | — | assets + ISR cache + media | ~€0.10 |
| **DynamoDB** (OpenNext tag cache) | 25 GB + 25 RCU/WCU, **always free** | tiny | **€0** |
| **SQS** (revalidation queue) | 1M requests/mo | tiny | **€0** |
| **Neon Postgres** | 0.5 GiB + 100 CU-hours/mo | ~20 MB | **€0** |
| **Better Auth** | — | self-hosted in your own Postgres | **€0** |
| **SES** | $0.10 per 1,000 emails | ~60k emails/mo | **~€5.50** |
| **Route 53** | — | 1 hosted zone + queries | €0.45 |
| **ACM** | free | wildcard cert | €0 |
| **SSM Parameter Store** | standard parameters free | ~15 secrets | €0 |
| **EventBridge Scheduler** | $1.00 per million | ~1,000 schedules | ~€0 |
| **Sentry** | free tier | | €0 |
| | | **Total** | **~€6** |

---

## 3. Today vs Guestnote

| Stage | Today (one CDK stack per wedding) | Guestnote (one shared stack) |
|---|---|---|
| Idle / 0 tenants | ~€0.50 | **~€0.50** |
| 10 weddings | ~€0.50 | **~€1** |
| 100 weddings | *architecturally impossible* | **~€6–8** |
| 500 weddings | — | ~€30 (mostly SES) |

The current setup isn't cheap because it's static — it's cheap because the traffic is tiny.
That property survives the move to SSR intact. What does *not* survive is the current
architecture: at 100 weddings you'd have 100 CloudFormation stacks, 100 CloudFront
distributions and 100 DynamoDB tables, and the binding constraint would be CloudFormation
limits and deploy time, not money.

---

## 4. The €15/mo that was really €54.57

The first database cost quoted in this project was "RDS at about €15/mo". That number was
wrong by 3.5×, in a way worth recording so it isn't repeated:

| Component | eu-central-1 price | Monthly |
|---|---|---|
| RDS PostgreSQL `db.t4g.micro`, Single-AZ | $0.019/hr | $13.87 |
| 20 GB gp3 storage, Single-AZ | $0.137/GB-mo | $2.74 |
| **NAT Gateway** | $0.052/hr + $0.052/GB | **$37.96** |
| | **Real all-in** | **$54.57** |

**The NAT Gateway is 2.7× the database it exists to reach.** RDS lives in a VPC; to reach it,
your Lambda must join that VPC; joining the VPC costs the Lambda its internet access, which it
still needs for Mollie, Sentry and auth callbacks; restoring that access needs a NAT.

Ways out, in descending cost:

| Approach | Monthly | Trade |
|---|---|---|
| RDS + managed NAT Gateway | **$54.57** | — |
| RDS + `fck-nat` on a `t4g.nano` ($0.0048/hr) | **$20.11** | You own an EC2 instance and its patching; single point of failure |
| Aurora Serverless v2 + **Data API** (HTTPS, no VPC) | **$51.10** | ACU floor of 0.5 at $0.14/ACU-hr |
| Aurora Serverless v2, **min 0 ACU** + Data API | ~**$0** idle | ~15 s cold resume — a guest clicking their RSVP link at 22:00 waits 15 seconds |
| Aurora DSQL | **$0** (100k DPU + 1 GiB free, permanent) | No foreign keys, no triggers, OCC retry logic on every write |
| **Neon Postgres** | **$0** | US-parent sub-processor on the DPA |

**Chosen: Neon.** It connects over HTTPS, which deletes the VPC, the NAT Gateway, RDS Proxy
($0.015/vCPU-hr with a 2-vCPU floor ≈ $22/mo) and the connection-exhaustion problem in one
decision — and with them a weekend of CDK plumbing and the MigrationRunner-Lambda workaround
for reaching a private-subnet database from CI.

**The biggest cost lever in this architecture is not the database. It's whether the database
forces you into a VPC.**

### Reference prices (eu-central-1, 2026-08-11)

| Item | Price |
|---|---|
| RDS PostgreSQL `db.t4g.micro` Single-AZ | $0.019/hr = $13.87/mo |
| RDS **MySQL** `db.t4g.micro` Single-AZ | $0.019/hr = $13.87/mo — **identical** |
| RDS gp3 storage, Single-AZ | $0.137/GB-mo |
| RDS gp3 storage, Multi-AZ | $0.274/GB-mo |
| Aurora Serverless v2 (Postgres or MySQL), Standard | $0.14/ACU-hr |
| Aurora Serverless v2, I/O-Optimized | $0.19/ACU-hr |
| NAT Gateway | $0.052/hr + $0.052/GB |
| `t4g.nano` EC2 | $0.0048/hr = $3.50/mo |

> **MySQL and PostgreSQL cost exactly the same on both RDS and Aurora.** There is no cost
> argument between them. Postgres wins on merit: Row Level Security (no MySQL equivalent, and
> it's the tenant-isolation backstop), indexable JSONB, arrays, partial indexes, built-in
> full-text search — and every serverless escape hatch (Neon, Supabase, Aurora DSQL, Aurora
> Serverless) speaks Postgres.

---

## 5. Postgres hosting options compared

The connection API matters more than the price, because it determines whether you need a VPC:

| Family | How you connect | Consequence |
|---|---|---|
| **TCP only** | standard `postgres://` | VPC + NAT (~$38/mo); connection exhaustion is real — `t4g.micro` gives ~112 connections |
| **TCP + pooler** | PgBouncer / Supavisor / RDS Proxy | Fixes exhaustion. Still VPC. RDS Proxy ≈ $22/mo |
| **HTTP query API** | `fetch()` to HTTPS | **No VPC, no NAT, no pooling, no connection limits** |

⚠️ Most HTTP drivers run each statement as its own implicit transaction, which breaks the
transaction-scoped `set_config()` that Postgres RLS needs. Neon supports HTTP *and*
WebSocket/pooled TCP, so you use HTTP for cached reads and WebSocket inside `withTenant()`.
Prisma Postgres is HTTP-only and would not support this pattern.

| Provider | Free tier | Cheapest paid | Connection | EU | Entity |
|---|---|---|---|---|---|
| **Neon** ✅ *chosen* | 0.5 GiB, 100 CU-hrs/mo, scale-to-zero | usage-based, **no floor** | HTTP + WS + pooled TCP | eu-central-1 | 🇺🇸 parent |
| **Aiven** | 2 vCPU / 1 GiB | ~$19/mo | TCP (public TLS) | ✓ | 🇫🇮 **EU** |
| **Nile** | 1 GiB, 50M query tokens, never pauses | $15/mo | HTTP + TCP | ✓ | 🇺🇸 |
| Supabase | 500 MB — **pauses after 7 days idle** | $25/mo | TCP + Supavisor + PostgREST | ✓ | 🇺🇸 |
| Prisma Postgres | 100k ops, 500 MB | $10/mo | **HTTP only** | ✓ | 🇺🇸 |
| PlanetScale Postgres | none | $5/mo | TCP + pooler | ✓ | 🇺🇸 |
| Scaleway | none | €11/mo | TCP | Paris/Amsterdam | 🇫🇷 **EU** |
| Hetzner + self-managed | none | €3.79/mo | TCP | ✓ | 🇩🇪 **EU** |
| AWS RDS | none (account too old) | $54.57 all-in | TCP | ✓ | 🇺🇸 |
| Aurora DSQL | 100k DPU + 1 GiB, **permanent** | $0 | TCP + IAM | ✓ | 🇺🇸 |

**If the sub-processor question ever becomes a real objection in a planner or venue sales
conversation, `Aiven` is the drop-in swap** — Finnish company, EU jurisdiction end to end,
also has a free tier, still no VPC. Because it's plain Postgres behind Drizzle and a single
`packages/db/client.ts`, switching is a connection-string change.

---

## 6. What actually costs money

| Item | Cost | Note |
|---|---|---|
| **A designer for 5–6 templates** | **€2,000–5,000** | This market buys on looks. The highest-ROI euro available, and the one thing engineering can't substitute for. **Do not DIY this** |
| Domains — `guestnote.be`, `withguestnote.com`, defensive | ~€60/yr | |
| `guestnote.com` from the squatter, later | €1,000–15,000 | Only if revenue justifies it |
| **Your time** | ~8–10 h/week | The real constraint on everything |

Hosting is a rounding error against any of these. Do not optimise it further; optimise for the
hours instead.

---

## 7. Guardrails

- **AWS Budgets alarms at €25 / €50 / €100 on day one.** Cheapest insurance in the stack.
- **`retention: 30 days` on every CloudWatch log group.** The default is Never Expire — a
  slow-growing bill for logs nobody reads.
- **Per-tenant SES sending caps.** One tenant importing a stale CSV can torch your account's
  sending reputation and take email down for every customer.
- **Don't use `next/image` on user-uploaded content.** `/_next/image?url=…&w=…` is an unbounded
  compute surface an attacker can hammer with 30 widths × 3 formats. Pre-derive at upload
  instead — see `05-architecture.md` §6.
- **Re-run the Pricing API queries before quoting any of this externally.** Prices move:

```bash
aws pricing get-products --service-code AmazonRDS --region us-east-1 --profile se-parti \
  --filters "Type=TERM_MATCH,Field=instanceType,Value=db.t4g.micro" \
            "Type=TERM_MATCH,Field=regionCode,Value=eu-central-1" \
            "Type=TERM_MATCH,Field=deploymentOption,Value=Single-AZ"
```
