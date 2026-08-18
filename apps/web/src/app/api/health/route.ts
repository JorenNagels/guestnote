import { schema, withUser } from '@guestnote/db'
import { count, sql } from 'drizzle-orm'
import { getDb } from '../../../lib/db.ts'

/**
 * Health check, and rather more than a liveness probe.
 *
 * research/05-architecture.md section 9's M1a asks for "`/api/health` doing a real
 * `withTenant` round-trip". Taken literally that needs a `Principal`, which needs an
 * `orgId` -- and baking a seeded fixture's UUID into a public, externally-monitored
 * endpoint is a bad trade. So this uses `withUser` with the nil UUID instead, which is
 * fixture-free and asserts strictly more:
 *
 *  1. the pool connects and a transaction opens;
 *  2. `set_config(..., true)` executes as the first statement in that transaction;
 *  3. **the connected role cannot bypass RLS** -- which docs/adr/0001 calls "the real
 *     trap... not the pooler". `neon_superuser` includes BYPASSRLS and is granted
 *     automatically to any role created through the Neon Console, CLI or API; the ADR
 *     measured `neondb_owner` with `rolbypassrls = true`. Connect as that and every
 *     policy is bypassed *silently*, with no error and no failing test;
 *  4. the `own_memberships` policy really filters: under a nil `app.user_id`,
 *     `org_members` must return zero rows.
 *
 * So this upgrades the uptime check from "is the process alive" to "is RLS still armed in
 * production", which is a genuinely useful thing to be paged about, and it leaks nothing
 * tenant-specific.
 *
 * **Note for M1a:** research/06-hosting-costs.md's 2026-08-17 caveat says OpenNext's
 * 5-minute warmer "defeats scale-to-zero if the health check touches the database". This
 * route touches the database on purpose, so the warmer must NOT point at it. Give the
 * warmer a separate, static route.
 */

/** Reachable only on the app host: proxy.ts 404s /api/* on the apex. */
export const dynamic = 'force-dynamic'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * The role `packages/db/migrations/0002_grants.sql` grants to, created with `CREATE ROLE`
 * in SQL rather than through the Neon Console -- which is the only way it avoids the
 * automatic `neon_superuser` membership that carries BYPASSRLS.
 */
const EXPECTED_ROLE = 'app_user'

type RoleRow = { current_user: string; rolbypassrls: boolean; rolsuper: boolean }

export async function GET(): Promise<Response> {
  try {
    const checks = await withUser(getDb(), NIL_UUID, async (tx) => {
      // `pg_roles` is not in the Drizzle schema, so this one is raw. The cast is needed
      // because `TenantDb` is deliberately the driver-agnostic `PgTransaction`, whose
      // result HKT is unresolved -- that abstraction is what lets the isolation suite run
      // against local Postgres while production runs on Neon (packages/db/src/client.ts).
      const roles = (await tx.execute(sql`
        select current_user, rolbypassrls, rolsuper
        from pg_roles
        where rolname = current_user
      `)) as unknown as { rows: RoleRow[] }

      // The query builder rather than raw SQL, so this genuinely goes through the same
      // schema definition the policies were written against.
      const memberships = await tx.select({ n: count() }).from(schema.orgMembers)

      return { role: roles.rows[0], memberships: memberships[0]?.n }
    })

    const role = checks.role
    if (!role) {
      return json({ ok: false, error: 'could not read the connected role' }, 503)
    }

    // Zero because `own_memberships` filters on app.user_id, which withUser set to the
    // nil UUID. A non-zero count here means the policy is not being applied at all.
    const ownMemberships = checks.memberships ?? -1

    const db = {
      connected: true,
      role: role.current_user,
      bypassRls: role.rolbypassrls,
      isSuperuser: role.rolsuper,
      ownMemberships,
    }

    const armed =
      role.current_user === EXPECTED_ROLE &&
      role.rolbypassrls === false &&
      role.rolsuper === false &&
      ownMemberships === 0

    return json({ ok: armed, db }, armed ? 200 : 503)
  } catch (error) {
    // The message can name a missing env var or an unreachable host, both of which are
    // useful and neither of which is a secret. A stack trace is not returned.
    return json({ ok: false, error: error instanceof Error ? error.message : 'unknown' }, 503)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}
