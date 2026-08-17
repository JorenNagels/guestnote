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
TEST_DATABASE_URL='postgres://app_user:...@ep-xxx-pooler.eu-central-1.aws.neon.tech/guestnote' \
SEED_DATABASE_URL='postgres://owner:...@ep-xxx.eu-central-1.aws.neon.tech/guestnote' \
REQUIRE_NEON_TIER=1 npm run test:db
```

`REQUIRE_NEON_TIER=1` makes the suite **fail** if it is not actually pointed at a pooled
Neon host. Without it the pooler tests still run, but against a plain pool — which is a
weaker claim, and `pooling.test.ts` prints which tier it ran.

**Two roles, not one.** `TEST_DATABASE_URL` is `app_user`; `SEED_DATABASE_URL` is
privileged. `0001_rls.sql` sets `FORCE ROW LEVEL SECURITY`, so even the table owner obeys
the policies — and a seed that had to satisfy them could not create the cross-tenant rows
the suite exists to detect. If both point at the same role, every assertion goes vacuous.

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
| `app.user_id` | The authenticated user. Scopes `org_members` / `wedding_members`. |
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
```

`src/schema/index.ts` classifies every table into exactly one of
`TENANT_SCOPED_TABLES` / `SELF_SCOPED_TABLES` / `USER_SCOPED_TABLES` /
`UNSCOPED_TABLES`. `test/schema-coverage.test.ts` fails CI if a table is unclassified,
missing a tenant key, missing `FORCE ROW LEVEL SECURITY`, or missing a policy — so
extending the suite is mechanical rather than something to remember.

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
