import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool as NeonPool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres'
import { Pool as NodePool } from 'pg'
import type { Db } from '../src/client.ts'
import * as schema from '../src/schema/index.ts'

/**
 * Two tiers, and the difference is stated rather than implied.
 *
 *   TEST_DATABASE_URL unset, or a non-Neon host
 *     -> node-postgres against a local Postgres. Fast, offline, and sufficient for
 *        every assertion about POLICY LOGIC, which is ordinary Postgres behaviour.
 *
 *   TEST_DATABASE_URL a Neon POOLED host (`-pooler`)
 *     -> the real driver. Required for the assertions about POOLER behaviour: whether
 *        a transaction-local GUC survives COMMIT on a connection that is then handed
 *        to the next caller. Nothing but Neon can answer that.
 *
 * Both tiers must pass before the gate is green. pooling.test.ts skips its
 * pooler-specific cases on the local tier and says so out loud -- a suite that
 * silently reports green for assertions it never ran is worse than no suite at all.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = join(HERE, '..', 'migrations')

/** The application role: `app_user`. Not an owner, NOBYPASSRLS. */
export const TEST_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://app_user:verify@localhost:55433/guestnote'

/**
 * A privileged role, used ONLY to seed.
 *
 * It has to be a different role. 0001 sets FORCE ROW LEVEL SECURITY, so even the
 * table owner is subject to the policies -- and a seed that had to satisfy them could
 * not create the cross-tenant rows this suite exists to detect. If these two URLs
 * ever point at the same role, every assertion here becomes vacuous, which is why
 * pooling.test.ts asserts the test role is neither owner nor BYPASSRLS.
 */
export const SEED_URL =
  process.env.SEED_DATABASE_URL ?? 'postgres://postgres:verify@localhost:55433/guestnote'

export const IS_NEON = /\.neon\.tech|\.neon\.build/.test(TEST_URL)
export const CAN_TEST_POOLER = IS_NEON

type Rows = Record<string, unknown>[]
type Client = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Rows }>
  release: () => void
}
type PoolLike = { connect: () => Promise<Client>; end: () => Promise<void> }

function makePool(url: string, max: number): PoolLike {
  const config = { connectionString: url, max }
  return (IS_NEON && url === TEST_URL
    ? new NeonPool(config)
    : new NodePool(config)) as unknown as PoolLike
}

export type Harness = {
  pool: PoolLike
  /**
   * A drizzle handle over the SAME pool, typed as the production `Db`. This is what
   * lets pooling.test.ts exercise the real `withTenant` rather than a reimplementation
   * of it -- the assertion is about the function that ships, not about a test double
   * that happens to issue similar SQL.
   */
  db: Db
  end: () => Promise<void>
  url: string
}

/**
 * @param max Pool size. The pooling tests pin this to 2 on purpose, so interleaved
 *            transactions are forced to share connections. A pool large enough to
 *            give every caller its own connection would pass while proving nothing.
 */
export function connect(max = 2): Harness {
  const pool = makePool(TEST_URL, max)
  const db = (IS_NEON
    ? drizzleNeon(pool as never, { schema })
    : drizzleNode(pool as never, { schema })) as unknown as Db
  return { pool, db, end: () => pool.end(), url: TEST_URL }
}

// ------------------------------------------------------------- GUC helpers ----

export type Gucs = {
  userId?: string
  orgId?: string
  weddingId?: string
  weddingRole?: string
}

/**
 * Runs statements inside one transaction on ONE checked-out connection, with the four
 * GUCs set exactly as given -- including deliberately WRONG combinations that
 * `withTenant` would refuse to produce.
 *
 * Bypassing `withTenant` is the point. The suite has to be able to show what the
 * POLICIES do when the application layer is wrong; otherwise it only demonstrates
 * that correct input yields correct output, which is the least interesting property.
 * with-tenant.test.ts covers the guard separately.
 *
 * One checked-out client matters: issuing `set_config` and the query as two pool
 * calls could put them on different connections, and the GUCs would apply to nothing
 * -- a test that passes for the wrong reason.
 */
export async function asPrincipal(
  h: Harness,
  gucs: Gucs,
  sqlText: string,
  values: unknown[] = [],
): Promise<Rows> {
  const client = await h.pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `select set_config('app.user_id', $1, true),
              set_config('app.org_id', $2, true),
              set_config('app.wedding_id', $3, true),
              set_config('app.wedding_role', $4, true)`,
      [gucs.userId ?? '', gucs.orgId ?? '', gucs.weddingId ?? '', gucs.weddingRole ?? ''],
    )
    const res = await client.query(sqlText, values)
    await client.query('commit')
    return res.rows
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Same, but with NO GUCs set at all -- the fail-closed case. */
export async function asNobody(h: Harness, sqlText: string, values: unknown[] = []): Promise<Rows> {
  const client = await h.pool.connect()
  try {
    const res = await client.query(sqlText, values)
    return res.rows
  } finally {
    client.release()
  }
}

export async function countOf(h: Harness, gucs: Gucs, table: string): Promise<number> {
  const rows = await asPrincipal(h, gucs, `select count(*)::int as n from "${table}"`)
  return Number((rows[0] as { n: number }).n)
}

// ------------------------------------------------------------- migrations ----

export function migrationSql(): { tag: string; sql: string }[] {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string }[] }
  return journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((e) => ({ tag: e.tag, sql: readFileSync(join(MIGRATIONS_DIR, `${e.tag}.sql`), 'utf8') }))
}

export function migrationFilesOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

// ---------------------------------------------------------------- fixtures ----

/**
 * Two organisations, and org A holds TWO weddings, so the two distinct leaks have
 * distinct shapes:
 *
 *   cross-ORG      org A must never see org B's rows.
 *   cross-WEDDING  the couple on wedding A1 must never see wedding A2 -- same org,
 *                  same `app.org_id`. This is the failure mode
 *                  research/07-auth-and-tenancy.md section 3 describes, and a
 *                  single-wedding fixture cannot detect it at all.
 */
export const F = {
  orgA: 'aaaaaaaa-0000-0000-0000-00000000000a',
  orgB: 'bbbbbbbb-0000-0000-0000-00000000000b',
  weddingA1: 'a1111111-0000-0000-0000-0000000000a1',
  weddingA2: 'a2222222-0000-0000-0000-0000000000a2',
  weddingB1: 'b1111111-0000-0000-0000-0000000000b1',
  coupleA1: 'cccccccc-0000-0000-0000-0000000000c1',
  staffA: 'dddddddd-0000-0000-0000-0000000000d1',
  staffB: 'dddddddd-0000-0000-0000-0000000000d2',
  taskA1Shared: '11111111-0000-0000-0000-000000000001',
  taskA1Internal: '11111111-0000-0000-0000-000000000002',
  taskA2Shared: '22222222-0000-0000-0000-000000000001',
  taskB1Shared: '33333333-0000-0000-0000-000000000001',
} as const

/** Principals the tests reuse, as GUC bundles. */
export const AS = {
  /** Org A owner, no wedding pin: sees every wedding in org A. */
  staffA: { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' } as Gucs,
  staffB: { userId: F.staffB, orgId: F.orgB, weddingRole: 'owner' } as Gucs,
  /** Org A owner, pinned to wedding A1. */
  staffAOnA1: {
    userId: F.staffA,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingRole: 'owner',
  } as Gucs,
  /** The couple on A1, correctly scoped. */
  coupleA1: {
    userId: F.coupleA1,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingRole: 'couple',
  } as Gucs,
  /**
   * The couple WITHOUT app.wedding_id -- the exact shape research/07-auth-and-tenancy.md
   * section 3 warns about. withTenant() refuses to construct this; the suite sets it
   * by hand to demonstrate what the policies alone do, and therefore why the guard
   * has to exist.
   */
  coupleA1Unpinned: { userId: F.coupleA1, orgId: F.orgA, weddingRole: 'couple' } as Gucs,
} as const

export async function reseed(): Promise<void> {
  const pool = new NodePool({ connectionString: SEED_URL, max: 1 })
  try {
    await pool.query(`truncate table
      task_comments, tasks, audit_log, invitations, wedding_domains,
      wedding_members, org_members, weddings, organizations, users cascade`)
    await pool.query(
      `insert into users (id, email) values ($1,'couple@a1.test'), ($2,'staff@a.test'), ($3,'staff@b.test')`,
      [F.coupleA1, F.staffA, F.staffB],
    )
    await pool.query(
      `insert into organizations (id, slug, name, type) values
         ($1,'org-a','Studio A','planner'), ($2,'org-b','Studio B','planner')`,
      [F.orgA, F.orgB],
    )
    await pool.query(
      `insert into weddings (id, org_id, slug, couple_display_name, wedding_date) values
         ($1,$4,'a-one','A One','2027-07-31'),
         ($2,$4,'a-two','A Two','2027-08-14'),
         ($3,$5,'b-one','B One','2027-09-04')`,
      [F.weddingA1, F.weddingA2, F.weddingB1, F.orgA, F.orgB],
    )
    await pool.query(
      `insert into wedding_members (wedding_id, user_id, role) values ($1,$2,'couple')`,
      [F.weddingA1, F.coupleA1],
    )
    await pool.query(
      `insert into org_members (org_id, user_id, role) values ($1,$2,'owner'), ($3,$4,'owner')`,
      [F.orgA, F.staffA, F.orgB, F.staffB],
    )
    await pool.query(
      `insert into tasks (id, org_id, wedding_id, title, visibility) values
         ($1,$5,$7,'Book the DJ','shared'),
         ($2,$5,$7,'Chase the late invoice','internal'),
         ($3,$5,$8,'Wedding two task','shared'),
         ($4,$6,$9,'Other tenant task','shared')`,
      [
        F.taskA1Shared,
        F.taskA1Internal,
        F.taskA2Shared,
        F.taskB1Shared,
        F.orgA,
        F.orgB,
        F.weddingA1,
        F.weddingA2,
        F.weddingB1,
      ],
    )
    await pool.query(
      `insert into wedding_domains (id, org_id, wedding_id, domain) values
         (gen_random_uuid(), $1, $2, 'a-one.guestnote.be'),
         (gen_random_uuid(), $3, $4, 'b-one.guestnote.be')`,
      [F.orgA, F.weddingA1, F.orgB, F.weddingB1],
    )
    await pool.query(
      `insert into invitations (id, org_id, wedding_id, email, role, token_hash, expires_at) values
         (gen_random_uuid(), $1, null, 'newstaff@a.test', 'member', 'hash-staff-a',   now() + interval '7 days'),
         (gen_random_uuid(), $1, $2,   'partner@a1.test', 'couple', 'hash-couple-a1', now() + interval '7 days'),
         (gen_random_uuid(), $3, null, 'newstaff@b.test', 'member', 'hash-staff-b',   now() + interval '7 days')`,
      [F.orgA, F.weddingA1, F.orgB],
    )
    await pool.query(
      `insert into audit_log (id, org_id, wedding_id, action) values
         (gen_random_uuid(), $1, null, 'org.created'),
         (gen_random_uuid(), $1, $2,   'wedding.created'),
         (gen_random_uuid(), $3, null, 'org.created')`,
      [F.orgA, F.weddingA1, F.orgB],
    )
    await pool.query(
      `insert into task_comments (id, org_id, wedding_id, task_id, body) values
         (gen_random_uuid(), $1, $2, $3, 'Which DJ did you mean?'),
         (gen_random_uuid(), $1, $2, $4, 'Third reminder sent.')`,
      [F.orgA, F.weddingA1, F.taskA1Shared, F.taskA1Internal],
    )
  } finally {
    await pool.end()
  }
}
