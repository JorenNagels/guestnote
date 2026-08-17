import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Principal } from '../src/tenant.ts'
import { withTenant } from '../src/tenant.ts'
import { AS, CAN_TEST_POOLER, connect, F, type Harness, reseed, TEST_URL } from './harness.ts'

/**
 * Everything RLS depends on that is NOT about policy text.
 *
 * research/05-architecture.md section 11.2 flags this as a top uncertainty, and it is
 * the assertion that validates the entire Neon choice: if a transaction-local GUC can
 * survive COMMIT on a connection that is then handed to the next request, then one
 * request's tenant leaks into the next and no policy in 0001_rls.sql helps.
 *
 * All of these run on the local tier too, because the general Postgres behaviour is
 * worth locking down. But passing locally is NOT sufficient -- see the notice test at
 * the bottom. Neon's pooler is PgBouncer in transaction mode, which is a different
 * animal from a plain connection pool, and only the real endpoint can answer for it.
 */

let h: Harness

beforeAll(async () => {
  // max: 2 on purpose. With a pool large enough to hand every caller its own
  // connection, the interleaving test below would pass while proving nothing.
  h = connect(2)
  await reseed()
})
afterAll(async () => {
  await h?.end()
})

const staffAPrincipal: Principal = {
  kind: 'orgStaff',
  userId: F.staffA,
  orgId: F.orgA,
  role: 'owner',
}
const staffBPrincipal: Principal = {
  kind: 'orgStaff',
  userId: F.staffB,
  orgId: F.orgB,
  role: 'owner',
}

describe('5. the connected role cannot bypass RLS', () => {
  /**
   * The commonest real-world RLS mistake, and it is silent: run the app as the role
   * that owns the tables, or as one with BYPASSRLS, and every policy becomes
   * decorative. No error, no failing query, no log line.
   *
   * FORCE ROW LEVEL SECURITY in 0001 handles the owner case. It does nothing about
   * BYPASSRLS or superuser, which is why this asserts on the role the tests actually
   * connected as rather than trusting that 0002_grants.sql was run.
   */
  it('is not a superuser and does not have BYPASSRLS', async () => {
    const c = await h.pool.connect()
    try {
      const { rows } = await c.query(
        `select current_user as who, rolsuper, rolbypassrls
           from pg_roles where rolname = current_user`,
      )
      const r = rows[0] as { who: string; rolsuper: boolean; rolbypassrls: boolean }
      expect(r.rolsuper, `${r.who} is a superuser, so RLS never applies`).toBe(false)
      expect(r.rolbypassrls, `${r.who} has BYPASSRLS, so RLS never applies`).toBe(false)
    } finally {
      c.release()
    }
  })

  it('owns none of the tables it queries', async () => {
    // Ownership alone would be survivable thanks to FORCE, but a role that owns a table
    // can also ALTER TABLE ... DISABLE ROW LEVEL SECURITY, which is not survivable.
    const c = await h.pool.connect()
    try {
      const { rows } = await c.query(
        `select count(*)::int as n
           from pg_class c
           join pg_roles r on r.oid = c.relowner
          where r.rolname = current_user and c.relkind = 'r'`,
      )
      expect(Number((rows[0] as { n: number }).n)).toBe(0)
    } finally {
      c.release()
    }
  })

  it('cannot turn RLS off', async () => {
    const c = await h.pool.connect()
    try {
      await expect(c.query('alter table tasks disable row level security')).rejects.toThrow()
    } finally {
      c.release()
    }
  })
})

describe('3. GUCs do not survive COMMIT', () => {
  /**
   * THE assertion that validates the Neon choice.
   *
   * withTenant sets every GUC with `is_local = true`. Without that third argument the
   * setting persists for the whole session, and on a pooled connection "the session"
   * outlives the request -- so the next caller to be handed that connection inherits
   * the previous tenant. This checks the value is gone afterwards, on the same pool.
   */
  it('a GUC set inside withTenant is unset on the same pool afterwards', async () => {
    await withTenant(h.db, staffAPrincipal, async (tx) => {
      const inside = await tx.execute(
        sql`select nullif(current_setting('app.org_id', true), '') as v`,
      )
      const rows = (inside as unknown as { rows: { v: string | null }[] }).rows
      expect(rows[0]?.v).toBe(F.orgA)
    })

    // Drain the pool a few times so we are very likely to be handed the same physical
    // connection the transaction above used.
    for (let i = 0; i < 6; i++) {
      const c = await h.pool.connect()
      try {
        const { rows } = await c.query(
          `select nullif(current_setting('app.org_id', true), '') as v,
                  nullif(current_setting('app.wedding_role', true), '') as r`,
        )
        const r = rows[0] as { v: string | null; r: string | null }
        expect(
          r.v,
          'app.org_id survived COMMIT -- one request would inherit the previous tenant',
        ).toBeNull()
        expect(r.r, 'app.wedding_role survived COMMIT').toBeNull()
      } finally {
        c.release()
      }
    }
  })

  it('a fresh connection reads no rows, confirming the GUCs really are gone', async () => {
    // Stronger than reading current_setting: this is the behaviour that matters.
    const c = await h.pool.connect()
    try {
      const { rows } = await c.query('select count(*)::int as n from weddings')
      expect(Number((rows[0] as { n: number }).n)).toBe(0)
    } finally {
      c.release()
    }
  })
})

describe('4. interleaved tenants on a shared pool', () => {
  /**
   * Sequential calls prove nothing here: they pass even when pooling is completely
   * broken, because there is never a second tenant in flight to leak from. Twenty
   * concurrent calls alternating between two organisations against a pool capped at 2
   * forces the connections to be recycled between tenants, which is the actual
   * production condition.
   */
  it('20 concurrent calls alternating A/B each see only their own tenant', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_unused, i) => {
        const isA = i % 2 === 0
        const principal = isA ? staffAPrincipal : staffBPrincipal
        return withTenant(h.db, principal, async (tx) => {
          const res = await tx.execute(
            sql`select count(*)::int as n,
                       count(*) filter (where org_id = ${isA ? F.orgB : F.orgA})::int as foreign_rows
                  from weddings`,
          )
          const row = (res as unknown as { rows: { n: number; foreign_rows: number }[] }).rows[0]
          return { i, isA, n: Number(row?.n), foreign: Number(row?.foreign_rows) }
        })
      }),
    )

    for (const r of results) {
      expect(r.foreign, `call ${r.i} (${r.isA ? 'A' : 'B'}) saw rows from the other tenant`).toBe(0)
      // Org A has two weddings, org B has one. A wrong-but-nonzero count would mean the
      // GUCs came from the other tenant's transaction.
      expect(r.n, `call ${r.i} (${r.isA ? 'A' : 'B'}) saw the wrong row count`).toBe(r.isA ? 2 : 1)
    }
    // And nothing silently returned empty, which would also "pass" a foreign-rows check.
    expect(results.filter((r) => r.n === 0)).toHaveLength(0)
  })

  it('a couple and a planner interleaved do not see each other visibility', async () => {
    const couple: Principal = {
      kind: 'weddingMember',
      userId: F.coupleA1,
      orgId: F.orgA,
      weddingId: F.weddingA1,
      role: 'couple',
    }
    const staff: Principal = {
      kind: 'assignedStaff',
      userId: F.staffA,
      orgId: F.orgA,
      weddingId: F.weddingA1,
      role: 'member',
    }
    const counts = await Promise.all(
      Array.from({ length: 20 }, (_unused, i) =>
        withTenant(h.db, i % 2 === 0 ? couple : staff, async (tx) => {
          const res = await tx.execute(sql`select count(*)::int as n from tasks`)
          return {
            isCouple: i % 2 === 0,
            n: Number((res as unknown as { rows: { n: number }[] }).rows[0]?.n),
          }
        }),
      ),
    )
    for (const c of counts) {
      // The couple must see exactly the one shared task; staff both.
      expect(c.n, c.isCouple ? 'a couple saw an internal task' : 'staff lost a task').toBe(
        c.isCouple ? 1 : 2,
      )
    }
  })
})

describe('which tier actually ran', () => {
  /**
   * A suite that reports green for assertions it never executed is worse than no suite.
   * Everything above passes against a plain local Postgres, and that is genuinely
   * useful -- but Neon's pooler is PgBouncer in transaction mode, and the whole point
   * of assertion 3 is how IT behaves. So this test states plainly which tier ran.
   *
   * It does not fail on the local tier -- that would make the fast offline loop
   * impossible. CI is where TEST_DATABASE_URL points at Neon, and where the assertion
   * below has teeth.
   */
  it('reports the tier, and requires the Neon tier when CI demands it', () => {
    const tier = CAN_TEST_POOLER ? 'neon (pooled)' : 'local postgres'
    console.info(`\n  [pooling] tier: ${tier}  ->  ${TEST_URL.replace(/:[^:@]*@/, ':***@')}`)
    if (process.env.REQUIRE_NEON_TIER === '1') {
      expect(
        CAN_TEST_POOLER,
        'REQUIRE_NEON_TIER=1 but TEST_DATABASE_URL is not a Neon pooled host, so the ' +
          'pooler assertions did not actually exercise a pooler.',
      ).toBe(true)
    }
    expect(AS.staffA.orgId).toBe(F.orgA)
  })
})
