---
name: db-migration
description: Write and apply a database migration in this repo without hitting the traps that fail silently. Use when adding, changing or dropping a table or column, when adding an RLS policy or a grant, or when asked to migrate the schema. Covers drizzle-kit generate, the hand-written RLS and grants files, the tenancy classification the coverage test requires, and why npm run db:migrate is the wrong way to apply anything here.
user-invocable: true
argument-hint: "[what the migration should do]"
---

# Writing a migration in Guestnote

`packages/db/src/schema/*.ts` is the authoritative schema. `research/` explains the reasoning
and is deliberately not kept in sync column by column — where they disagree, the schema wins.

Read `packages/db/README.md` before starting. Everything below is a summary of traps it
records, each of which was measured.

## The three that fail silently

Know these before you write a line, because none of them produces an error:

1. **`npm run db:migrate` does not work here and never has.** `drizzle-kit migrate` keeps a
   journal in `drizzle.__drizzle_migrations`, and this database has never had one — every
   migration so far was applied by running the `.sql` files directly. So `migrate` starts from
   zero, tries to replay `0000`, hits `relation "users" already exists`, and fails with the
   error hidden behind its spinner, which looks like a hang rather than a conflict.
   **`drizzle-kit generate` is still the right way to write one.** Only `migrate` is banned.
2. **A migration applied over the pooled endpoint is a bad time.** DDL through a
   transaction-mode pooler; use the direct/unpooled endpoint. `drizzle.config.ts` already
   points at `DATABASE_URL_UNPOOLED` for this reason.
3. **An unclassified table turns CI red on purpose, and an unforced RLS table does not.**
   `ENABLE ROW LEVEL SECURITY` exempts the table owner; only `FORCE` binds it. A table with
   `ENABLE` alone looks protected and is not.

## Steps

### 1. Edit the schema

Add or change the table in `packages/db/src/schema/*.ts`. Follow what is there:

- primary keys are `uuid`, generated in the application via `newId()` — **not**
  `gen_random_uuid()` and **not** `text`. Every policy casts
  `current_setting('app.org_id', true)::uuid`, so the type is not negotiable.
- a tenant-scoped table carries `org_id`, and `wedding_id` where a wedding scope exists.
  `wedding_id` may be nullable — see the note in `audit.ts` for how the policy handles that.
- reuse the shared column helpers in `schema/_shared.ts` rather than re-declaring timestamps.

### 2. Classify it

In `packages/db/src/schema/index.ts`, add the table to **exactly one** of:

| Bucket | Meaning |
|---|---|
| `TENANT_SCOPED_TABLES` | carries `org_id` + `wedding_id`, gets the standard tenant policy |
| `SELF_SCOPED_TABLES` | its own primary key *is* the scope (`organizations`, `weddings`) |
| `USER_SCOPED_TABLES` | read *before* the tenant is known, so scoped on `app.user_id` |
| `UNSCOPED_TABLES` | genuinely not tenant-owned, and needs a stated reason |
| `VISIBILITY_SCOPED_TABLES` | additionally tests `app.wedding_role` (add *as well as* the above) |

`packages/db/test/schema-coverage.test.ts` fails if a table is unclassified, and — for the three
*scoped* buckets only — if it is missing a tenant key, `FORCE ROW LEVEL SECURITY`, or a policy.
`UNSCOPED_TABLES` is exempt from those three by design. That is the mechanism that makes extending the
suite mechanical instead of something to remember — do not weaken it to make a table fit.

A new `UNSCOPED_TABLES` entry needs a reason of the same *kind* as the existing ones: the row
is read before a principal exists (a session by token, a passkey by credential id), so a
policy would break authentication outright. Its mitigation is structural rather than a policy,
and the structure is *named per table*: nothing outside `packages/core/auth` touches the five
auth tables, `apps/web/src/lib/mailer.ts` is the only writer of `mail_deliveries`, and Better
Auth's limiter is the only writer of `rate_limits`. See the comment on `UNSCOPED_TABLES` in
`schema/index.ts`, and the enumeration in `apps/web/src/lib/db.ts`.

### 3. Generate the DDL

```bash
npm run db:generate     # drizzle-kit generate, into packages/db/migrations/
```

Read the generated SQL before doing anything else. Drizzle will happily emit a destructive
statement for a rename it read as a drop plus an add.

### 4. Write the policy and the grants by hand

The generated file is structure only. RLS and grants are hand-written and live in their own
files by convention — `0001_rls.sql` and `0002_grants.sql` — so policies need no role to exist
at the time they are created. Follow their shape:

- `alter table … enable row level security;` **and** `alter table … force row level security;`
- every policy predicate reads its GUC as
  `nullif(current_setting('app.org_id', true), '')::uuid`, so an unset GUC yields NULL, the
  comparison yields NULL, and the row is filtered. **The schema fails closed: no GUCs means
  no rows.**
- the predicate must actually name the tenant key. `with check (true)` passes a
  "does a WITH CHECK exist" test and permits everything.
- for a `FOR ALL` policy, Postgres applies `USING` to the NEW row on `UPDATE` as well as the
  existing one. So a rule you only want enforced on write still belongs in `USING`, and INSERT
  tests exercise `WITH CHECK` while UPDATE tests exercise `USING` — different mechanisms,
  separate tests.
- grants go to `app_user` and nothing else.

### 5. Extend the isolation suite

`packages/db/test/` — and read the assertions already there before adding yours:

- every cross-tenant assertion must also assert the fixture actually put rows in the table.
  **An empty table isolates perfectly.**
- cover both read and write. The write-side `describe` block was once dropped in a refactor and
  the suite stayed green.
- the fixture is seeded by a privileged role on purpose. If seeding went through RLS, a policy
  that permitted too much would produce a fixture consistent with the broken policy and the
  test would pass.

### 6. Apply it

**Locally first**, with the container loop from `packages/db/README.md`, then against Neon as
the owner over the **direct** endpoint, statement by statement inside a single transaction so
a failure rolls the whole file back:

```bash
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 --single-transaction \
  -f packages/db/migrations/000N_your_migration.sql
```

`ON_ERROR_STOP=1` alone stops at the first error but leaves earlier statements applied;
`--single-transaction` is what makes a half-applied schema impossible.

### 7. Verify both tiers

```bash
npm run check
npm run test:db                                        # tier 1, local container
set -a; . ./.env.local; set +a
REQUIRE_NEON_TIER=1 npm run test:db                    # tier 2, the pooler
```

Both must pass. Note the version skew: the local container is `postgres:17-alpine`, Neon is on
18.4. Nothing depends on the difference today; the container should move to 18.

### 8. Record it

Update `packages/db/README.md` with the new passing count and the date. If the migration
settled a question that `research/` had left open, or contradicted something a doc asserts, add
a dated correction note there — do not silently edit the old claim away. If the decision was
measured against something running, it may deserve an ADR: use the `adr` skill.

## On Neon, never create a role through the Console, CLI or API

`neon_superuser` includes **`BYPASSRLS`** and is granted automatically to every role created
that way. A Console-created `app_user` bypasses every policy — silently, with no error, no
failing query, nothing in the logs, and an isolation suite that passes because the fixtures
line up rather than because the policies work.

```sql
CREATE ROLE app_user WITH LOGIN PASSWORD '...';   -- SQL only, so no neon_superuser membership
```

`pooling.test.ts` asserts `rolbypassrls = false` on whatever role it connected as. If that
test fails on Neon, this is why.
