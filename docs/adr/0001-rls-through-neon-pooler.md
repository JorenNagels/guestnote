# ADR 0001 — RLS through Neon's pooler

**Date:** 2026-08-17 · **Status:** Settled, verified

## The question

`research/05-architecture.md` §11.2 flagged it as a top uncertainty, and it is the
assumption every isolation guarantee in the product rests on:

> Does `set_config('app.org_id', $1, true)` survive Neon's pooler?

If a transaction-local GUC could outlive `COMMIT` on a connection that is then handed to
the next request, one request's tenant would leak into the next and no policy in
`0001_rls.sql` would help. Neon's own documentation adds reason to worry: the pooled
endpoint is **PgBouncer in transaction mode**, and its documented limits state plainly that
`SET` / `RESET` are unsupported and that session variables do not persist across
transactions.

## The answer

**Yes.** Verified against the real pooled endpoint, not reasoned about.

- Project `ep-cold-morning-b23dpr6z`, `eu-central-1`, **PostgreSQL 18.4**
- Connected over the `-pooler` host as `app_user`
- `REQUIRE_NEON_TIER=1 npm run test:db` → **94 passed**

The four assertions that matter:

| Assertion | Result |
|---|---|
| A GUC set inside `withTenant` is unset on the same pool after `COMMIT` (checked over 6 successive checkouts) | gone |
| A fresh checkout reads **0** rows, confirming the GUCs really are absent rather than merely unreadable | 0 rows |
| 20 concurrent `withTenant` calls alternating between two orgs, against a pool capped at `max: 2` | each saw only its own tenant, with correct non-zero counts |
| 20 interleaved couple/planner calls on the same wedding | couple saw 1 task, staff saw 2, every time |

## Why the documented limitation does not apply

It is the reason for the design rather than a problem with it. `set_config(name, value,
true)` is **transaction-local**, and a transaction-mode pooler holds one connection for the
duration of a transaction — so the setting lives exactly as long as the statements that
need it and is gone when the connection is recycled. A session-level `SET` would be both
unsupported *and* a cross-tenant leak. The mechanism Neon documents as unsupported is
precisely the one this schema avoids.

## What would have gone wrong instead

Not the pooler — the **role**. `neon_superuser` includes `BYPASSRLS` and is granted
automatically to every role created through the Neon Console, CLI or API. Measured on this
project:

```
neondb_owner : rolbypassrls = true,  member_of = neon_superuser
app_user     : rolbypassrls = false, member_of = none        (created with SQL)
```

Had the application connected as `neondb_owner`, **every policy would have been bypassed
silently** — no error, no failing query, and a green isolation suite passing because the
fixtures happened to line up. `pooling.test.ts` asserts `rolbypassrls = false` on whatever
role it actually connected as, which is what makes that unrepresentable. That assertion was
written before this was known about Neon, on the general grounds that owner-vs-`BYPASSRLS`
is the classic RLS mistake.

**So: `app_user` must be created with `CREATE ROLE` in SQL. Never through the Console.**

## The fallback that was not needed

Had assertion 3 or 4 failed, `research/05-architecture.md` §4's stop rule applied: re-decide
the database host before writing any application code. In order —

1. A direct (unpooled) connection string inside `withTenant`, re-costing connection count
   and cold starts. One line in `client.ts`, which is why that file is the seam.
2. **Aiven** (Finnish, EU jurisdiction, free tier), already named in §4 as the drop-in swap.
3. RDS at ~$54/mo all-in.

Explicitly rejected and not to be re-proposed: Neon's own RLS feature (`pg_session_jwt`,
the `authenticated` role). It couples RLS to a JWT-issuing IdP, and Better Auth sessions
are opaque DB-backed cookies. There is nothing for it to read.

## Loose ends

- **Verified on 18.4, developed against 17.11.** The local tier runs `postgres:17-alpine`;
  Neon is on 18.4. Both pass, so nothing depends on the difference today — but the local
  container should move to 18 so the two tiers stop diverging.
- **`sslmode=require` is currently stricter than libpq.** `pg-connection-string` warns that
  it presently treats `require` as `verify-full`, and will adopt libpq's weaker semantics in
  `pg` v9. The current behaviour is the safer one; pin `sslmode=verify-full` explicitly
  before upgrading, or the upgrade quietly weakens TLS verification.
- **Rotate the credentials used here.** The `neondb_owner` password was pasted in plaintext
  into a chat transcript during setup, so it must be treated as disclosed:
  `ALTER ROLE neondb_owner WITH PASSWORD '...'` (or reset it in the Neon console), then
  update `.env.local`. `app_user`'s password was generated locally and never displayed, so
  it is fine — but it lives only in `.env.local`, which means that file is currently the
  single copy. Move both into SSM `SecureString` at `/guestnote/prod/*` when the app needs
  them at runtime.
