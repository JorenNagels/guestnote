# `@guestnote/db`

Schema, migrations, tenant isolation. **This package is the gate**: no feature work until
`npm run test:db` exits 0.

`src/schema/*.ts` is the **authoritative schema**. `research/05-architecture.md` §4,
`07-auth-and-tenancy.md` §4 and `09-planner-app.md` §b–§c are the reasoning behind it and
are not kept in sync column by column.

## Running the tests

Two tiers, and **both** must pass.

```bash
# Tier 1 -- local Postgres. Fast, offline, proves the policy LOGIC.
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

```bash
# Tier 2 -- Neon. Proves the POOLER: that a transaction-local GUC does not survive
# COMMIT on a recycled connection. Nothing else can answer that question.
# The values live in .env.local (gitignored); TEST_DATABASE_URL must be the app_user
# POOLED url and SEED_DATABASE_URL the owner's DIRECT url.
set -a; . ./.env.local; set +a
REQUIRE_NEON_TIER=1 npm run test:db
```

**Result, 2026-08-20: 142 passed** against `-pooler` on PostgreSQL **18.4**, and 142 on the
local container — both with `0005_org_read_for_members` applied, which made `organizations`
the first table here to carry two policies. That the OR of two permissive policies composes
the same way through the transaction-mode pooler as it does on the container is now measured
rather than assumed, and it is not a rhetorical question: the composition is exactly what
went wrong on the way to this number (see below).

Earlier runs, all real but none of them the run immediately before this one: 101 on both
tiers on 2026-08-19, 99 earlier that day before `mail_deliveries` and `rate_limits` joined
the coverage check, 94 on 2026-08-17 before Better Auth's four tables did. The suite grew to
115 between the 101 and this change without the figure here being updated, which is the
ordinary way a count in a README rots — it is only ever touched when someone runs the suite
*and* remembers. This settles `research/05-architecture.md` §11.2 — see
`docs/adr/0001-rls-through-neon-pooler.md`.

`0004_wakeful_sunspot.sql` added the two mail tables. Both are `UNSCOPED_TABLES` and carry no
RLS, on the same grounds as the auth tables: a sign-in code is requested by someone who is by
definition not signed in, so there is no `app.user_id` to scope by. `0002_grants.sql`'s
`alter default privileges` covered them with no extra grant work — verified, not assumed.

`0005_org_read_for_members.sql` (hand-written, like `0001` and `0002`) adds a **second
policy** to `organizations` — the first table here to carry two — so a `member`, who has no
org-wide principal at all, can read the name of the organisation they work for. `FOR SELECT`
only, and **guarded to apply only where `app.org_id` is unset.**

That guard is the whole safety argument and it is there because the version without it was
wrong. `withTenant` sets `app.user_id` as well as `app.org_id`, so a policy on the user axis
is live in *every* transaction; Postgres ORs permissive policies; and `getOrg` had no `id`
predicate of its own because `tenant_isolation` had always been the filter. The effective
predicate quietly became `id = app.org_id OR you are a member of it`, and a user who is staff
at two organisations got both rows back from a transaction pinned to one — with `rows[0]`
being the wrong one. Measured 2026-08-20; caught in review, before it was committed.

Three things about it were measured rather than assumed, and all three are in the migration's
header: which half of the `EXISTS` is load-bearing (the `org_id` correlation, not the
`user_id` comparison, which is redundant with `org_members`' own policy), why no assertion in
`repos.test.ts` can prove the policy at all (`listOrgsForUser` joins `org_members`, so it
returns the right answer even when the policy is wrong), and the guard above.
`isolation.test.ts` §7 holds the policy up and §8 holds the guard up.

`0006_planner_tables.sql` (drizzle-kit generated) and `0007_planner_rls.sql` (hand-written) are
spec 0003's data: ten tables for the planner app, plus four columns on `weddings`. Read the
header of `0007` before changing any of it. Four things it settles that are easy to lose:

- **A `couple` reads none of it.** Every policy carries a positive role list, `in ('owner',
  'admin', 'member')`, because a couple's GUCs are identical to a planner's and the tenant keys
  cannot tell them apart. `editor` is out too. Unset or unknown roles read nothing.
- **A new tenancy bucket, `ORG_SCOPED_TABLES`** (`vendors`, `task_templates`,
  `template_items`): `org_id` and no `wedding_id`. `schema-coverage.test.ts` asserts the
  absence, so a table that grows a wedding key has to move buckets.
- **`vendor_links` is owner and admin only, reads included.** It is the table only; the `link`
  principal and its lookup function are slice S10's.
- **`weddings.notes` is couple-readable** the day a couple reaches `weddings` at all, because
  that policy is unchanged. Nothing can reach it today. The couple-portal spec must answer it.

`test/planner-isolation.test.ts` covers all ten tables: couple, editor, member and cross-org, read
and write, plus the CHECKs and foreign keys. **328 passed on the local tier, 2026-09-21**; the
Neon tier was not run for this change. The mutation sweep (nine policy mutations, run by hand
with `alter policy`) failed the suite on eight. The survivor is the `visibility = 'shared' or
...` clause on `files` and `template_items`, which cannot be isolated while the role clause
beside it admits only roles that see internal rows; the note is beside the assertion.

**`scripts/local-db.sh <dbname>`** creates one database per caller in the `gn-pg` container
(starting the container if needed), drops it if it exists, and applies every migration. One
database each, because `test:db` truncates its fixture tables.

## Applying a migration

**Use the loop above, not `npm run db:migrate`.**

`drizzle-kit migrate` keeps its own journal in a `drizzle.__drizzle_migrations` table, and
this database has never had one: every migration so far was applied by running the `.sql`
files directly, which is what the loop does. So `drizzle-kit migrate` starts from zero,
tries to replay `0000`, hits `relation "users" already exists`, and fails — with the error
hidden behind its spinner, which is how it looks like a hang rather than a conflict.

`drizzle-kit generate` is still the right way to *write* a migration; only `migrate` is the
wrong way to apply one here. Migration `0003` was applied against Neon as `neondb_owner`,
statement by statement inside a single transaction, so a failure rolls the whole file back
rather than leaving a half-applied schema — which is the one thing the `ON_ERROR_STOP=1`
loop above does not give you.

Baselining the journal so `drizzle-kit migrate` works is a reasonable thing to do later.
It is not free: the hashes have to match the files exactly or the next run reports drift.

Note the version skew: the local container is `postgres:17-alpine`, Neon is on 18.4. Both
tiers pass, so nothing depends on the difference today, but the container should move to 18
so they stop diverging.

`REQUIRE_NEON_TIER=1` makes the suite **fail** if it is not actually pointed at a pooled
Neon host. Without it the pooler tests still run, but against a plain pool — which is a
weaker claim, and `pooling.test.ts` prints which tier it ran.

### ⚠️ The dev app and the test suite share one database

`APP_DATABASE_URL`, `TEST_DATABASE_URL` and `SEED_DATABASE_URL` in `.env.local` all point at
the same Neon project and the same `neondb`. So **`npm run test:db` truncates the data
`npm run dev` is serving** — `reseed()` opens with `truncate ... cascade` over every fixture table (twenty-one since 0006),
by design, because the fixture has to be ground truth.

Noticed 2026-08-21 while running the dev server to look at the dashboard: the three
organisations in it were `Studio A`, `Studio B` and `Atelier Zero`, which are
`test/harness.ts`'s fixtures and not anything a human created.

Left alone on purpose for now. Nothing is deployed, and the fixtures are currently the only
data there is to lose, so the cost is a lost demo rather than lost work. The two ways out,
when it starts to matter: point `TEST_DATABASE_URL` and `SEED_DATABASE_URL` at a throwaway
Neon branch — they are instant and cheap, and it keeps the pooler in the test path, which is
the whole reason tier 2 exists — or point `APP_DATABASE_URL` at the local container, which
costs the dev app its pooler coverage and puts it on PG 17 against Neon's 18.4.

The rejected third option is worth naming so it is not re-proposed: making `reseed()`
narrower, so it deletes only its own fixture rows. That would leave the suite passing against
a database with unknown extra rows in it, and several assertions here are exact counts —
`org A and org B see disjoint, non-empty wedding sets` is `toBe(2)` and `toBe(1)`. A fixture
that is not the whole contents of the database is not ground truth.

### Two roles, and why the seed one is privileged

`TEST_DATABASE_URL` is `app_user`. `SEED_DATABASE_URL` is the project owner on Neon, or a
superuser locally. They must not be the same role.

**The fixture has to be ground truth, independent of the mechanism under test.** If seeding
went through RLS, a policy bug that permitted *too much* would produce a fixture consistent
with the broken policy, and these tests would pass. The seed also writes rows for two
different tenants in one pass, which no single tenant context may legitimately do — that
*is* the fixture.

`app_user` could not seed anyway: no `TRUNCATE` privilege, and its `WITH CHECK` forbids
another tenant's rows.

**It is `BYPASSRLS` doing the work, not ownership.** Measured on PG 17 with a role that
owned the table but had neither superuser nor `BYPASSRLS`:

| role state | rows visible, no GUCs |
|---|---|
| owner, RLS `ENABLED` only | 2 — the owner exemption |
| owner, RLS **`FORCED`** | **0** — `FORCE` binds the owner |
| owner, `FORCED`, + `BYPASSRLS` | 2 — `BYPASSRLS` overrides `FORCE` |

So a plain owner would see nothing and the seed would fail. On Neon it works because
`neondb_owner` has `BYPASSRLS` via `neon_superuser`; locally because `postgres` is a
superuser.

Both directions are guarded. Point `TEST_DATABASE_URL` at the privileged role and
`rolbypassrls = false` fails. Point `SEED_DATABASE_URL` at `app_user` and `reseed()` throws
with an explanation **before** its first `INSERT` — which matters, because a seed that fails
inside `beforeAll` makes vitest report skipped tests rather than failures. Measured before
that fix: 47 passed, 48 skipped, zero failures, and the test written to explain the problem
was itself skipped.

### ⚠️ On Neon, create `app_user` with SQL — never via the Console, CLI or API

Neon's `neon_superuser` role includes **`BYPASSRLS`** (for projects created after
2023-08-15), and it is **granted automatically to every role created through the Console,
CLI or API**. Roles created with plain `CREATE ROLE` in SQL do *not* get it.

So a console-created `app_user` bypasses every policy in `0001_rls.sql` — silently. No
error, no failing query, nothing in the logs, and an isolation suite that passes because
the fixtures line up rather than because the policies work.

```sql
-- correct: SQL, so no neon_superuser membership
CREATE ROLE app_user WITH LOGIN PASSWORD '...';
```

`pooling.test.ts` asserts `rolbypassrls = false` on whatever role it connected as, which
is what catches this. If that test fails on Neon, this is why.

## The four GUCs

Set transaction-locally by `withTenant()`, always as the first statements in the
transaction. `is_local = true` is not optional: without it a setting outlives `COMMIT` on
a pooled connection and one request's tenant leaks into the next.

| GUC | Meaning |
|---|---|
| `app.user_id` | The authenticated user. Scopes `org_members` / `wedding_members`, and `SELECT` on `organizations` via 0005's `org_read_for_members`. |
| `app.org_id` | The tenant. **Data scoping, never a permission.** |
| `app.wedding_id` | **Mandatory** for any principal with no `org_members` row. |
| `app.wedding_role` | Decides `visibility = 'internal'` rows. |

Every policy reads them via `nullif(current_setting(name, true), '')`, so an unset GUC
yields NULL, `org_id = NULL` yields NULL, and the row is filtered. **The schema fails
closed: no GUCs means no rows.**

### Why `set_config(..., true)` and not `SET`

Neon's pooled endpoint is **PgBouncer in transaction mode**, and its documented limits say
plainly that `SET` / `RESET` are unsupported and that session variables do not persist
across transactions.

That is not a problem for this design — it is the reason for it. `set_config(name, value,
true)` is *transaction-local*, and a transaction-mode pooler holds one connection for the
duration of a transaction, so the setting lives exactly as long as the statements that need
it and is gone when the connection is recycled. A session-level `SET` would be both
unsupported *and* a cross-tenant leak.

`pooling.test.ts` is what turns that reasoning into a fact, which is why it has to run
against a real pooled Neon host and not only a local pool.

Also unsupported on the pooled endpoint, none of which this schema uses: temporary tables,
`LISTEN`/`NOTIFY`, advisory locks, `WITH HOLD` cursors, and SQL-level `PREPARE`.
**Migrations must therefore run over the direct (unpooled) endpoint** — `drizzle.config.ts`
uses `DATABASE_URL_UNPOOLED` for exactly this reason.

### `app.wedding_role` is an addition, not part of the original design

`research/05-architecture.md` §4's policy was one-dimensional. But §3 of
`07-auth-and-tenancy.md` requires a couple's session to set `app.org_id` to *the planner's*
org — so a couple's GUCs and a planner's are **identical**, and `tasks.visibility` had no
RLS backstop at all. The third GUC is that backstop. See the correction note in §4.

## Layout

```
src/schema/       the authoritative schema, plus the tenancy classification
src/tenant.ts     Principal union + withTenant/withUser
src/client.ts     the one file a provider swap touches
src/unsafe.ts     the unscoped handle, banned outside this package
migrations/
  0000_*.sql      generated by drizzle-kit
  0001_rls.sql    hand-written: enable + force, policies, visibility triggers
  0002_grants.sql app_user grants; separate so policies need no role to exist
  0006_planner_tables.sql  generated; spec 0003's ten tables and four `weddings` columns
  0007_planner_rls.sql     hand-written: enable + force, policies, grants for those ten
```

`src/schema/index.ts` classifies every table into exactly one of
`TENANT_SCOPED_TABLES` / `SELF_SCOPED_TABLES` / `USER_SCOPED_TABLES` /
`UNSCOPED_TABLES`. `test/schema-coverage.test.ts` fails CI if a table is unclassified,
missing a tenant key, missing `FORCE ROW LEVEL SECURITY`, or missing a policy — so
extending the suite is mechanical rather than something to remember.

A policy may be excused from naming its tenant key only by being listed in that file's
`USER_SCOPED_POLICY_EXCEPTIONS`, which is a one-line diff a reviewer sees. There is exactly
one entry. A second assertion fails if an exception names no live policy, because an
exception matching nothing pre-authorises whatever is later created under that name.

## Things learned by breaking it on purpose

Recorded because each one was a test that passed for the wrong reason, or nearly was.

- **A missing `describe` block is silent.** The `write-side isolation` tests were dropped
  in a refactor and the suite stayed green. Now `schema-coverage` also inspects the policy
  predicates themselves, so the *absence* of write coverage is detectable.
- **`with check (true)` is not `null`.** Checking merely that a `WITH CHECK` exists passes
  on a policy that permits everything. The assertion now requires the predicate to
  mention its tenant key.
- **For a `FOR ALL` policy, Postgres applies `USING` to the NEW row on `UPDATE`**, not
  only to the existing one. Verified on PG 17: with `using (true) with check (true)` a
  forbidden visibility flip succeeds; with the clause in `USING` alone it is rejected even
  though `WITH CHECK` is `true`. So the INSERT tests cover `WITH CHECK` and the UPDATE
  tests cover `USING` — different mechanisms.
- **An empty table isolates perfectly.** Every cross-tenant assertion also asserts the
  fixture actually put rows in that table.
- **The trap is real, and demonstrated rather than assumed.** A couple principal without
  `app.wedding_id` reads *both* of the organisation's weddings. `isolation.test.ts` asserts
  that leak exists, which is what makes `withTenant`'s guard load-bearing instead of
  decorative. The `app.wedding_role` clause does limit the blast radius — internal tasks
  stay hidden — but leaking a sibling couple's task list is still a breach.
