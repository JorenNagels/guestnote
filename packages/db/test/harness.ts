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
  /**
   * Third org, and its values disagree with each other ON PURPOSE. `Atelier Zero` sorts
   * FIRST by name, LAST by id, and is inserted LAST -- so an assertion on
   * `listOrgsForUser`'s order can only pass if the `order by name` is really there.
   * With only Studio A and Studio B, name order, id order and heap order all coincide
   * and any ordering assertion is vacuous.
   */
  orgC: 'ffffffff-0000-0000-0000-00000000000f',
  weddingA1: 'a1111111-0000-0000-0000-0000000000a1',
  weddingA2: 'a2222222-0000-0000-0000-0000000000a2',
  weddingB1: 'b1111111-0000-0000-0000-0000000000b1',
  coupleA1: 'cccccccc-0000-0000-0000-0000000000c1',
  staffA: 'dddddddd-0000-0000-0000-0000000000d1',
  staffB: 'dddddddd-0000-0000-0000-0000000000d2',
  /**
   * A staff MEMBER of org A, assigned to wedding A1 only. Lived in `repos.test.ts` as a
   * local fixture until 2026-08-20 and moved here for two reasons: `isolation.test.ts`
   * needs to exercise `organizations`' member-read policy as an actual member rather than
   * as an owner, and a local fixture inserted after `reseed()` silently reports the whole
   * FILE as skipped if its INSERT ever collides with a row `reseed()` starts writing.
   *
   * The one principal whose reads cost a transaction per wedding -- `assignedStaff` pins
   * `app.wedding_id`, and a pinned GUC returns exactly the row it names.
   */
  memberA: 'eeeeeeee-0000-0000-0000-0000000000e1',
  /**
   * Staff at TWO organisations: `admin` of org A, `owner` of org C.
   *
   * This shape did not exist in the fixture until 2026-08-20, and its absence hid a real
   * cross-tenant bug for the length of one review: migration 0005's policy keys on
   * `org_members`, so a user with exactly one membership can never demonstrate what the
   * OR of two permissive policies does. `landingOrgId` ranks owner above admin, so this
   * user lands in org C while org A is the older row -- which is what made the then-extant
   * `getOrg`'s missing `id` predicate return the WRONG organisation rather than merely an
   * extra one. That function is gone; the fixture shape it exposed is what stays useful.
   */
  staffDual: 'dddddddd-0000-0000-0000-0000000000d3',
  taskA1Shared: '11111111-0000-0000-0000-000000000001',
  taskA1Internal: '11111111-0000-0000-0000-000000000002',
  taskA2Shared: '22222222-0000-0000-0000-000000000001',
  taskB1Shared: '33333333-0000-0000-0000-000000000001',
  // ---- spec 0003 planner tables (migration 0006). One digit-run prefix per table so a
  // failing assertion names its table from the id alone; the last group is the row.
  eventA1: '44444444-0000-0000-0000-0000000000a1',
  eventA2: '44444444-0000-0000-0000-0000000000a2',
  eventB1: '44444444-0000-0000-0000-0000000000b1',
  vendorA: '55555555-0000-0000-0000-0000000000a1',
  /** A second org-A vendor, linked to no wedding, so a test can add it to one without a clash. */
  vendorA2: '55555555-0000-0000-0000-0000000000a2',
  vendorB: '55555555-0000-0000-0000-0000000000b1',
  wedVendorA1: '66666666-0000-0000-0000-0000000000a1',
  wedVendorA2: '66666666-0000-0000-0000-0000000000a2',
  wedVendorB1: '66666666-0000-0000-0000-0000000000b1',
  budgetLineA1: '77777777-0000-0000-0000-0000000000a1',
  budgetLineA2: '77777777-0000-0000-0000-0000000000a2',
  budgetLineB1: '77777777-0000-0000-0000-0000000000b1',
  paymentA1: '88888888-0000-0000-0000-0000000000a1',
  paymentA2: '88888888-0000-0000-0000-0000000000a2',
  paymentB1: '88888888-0000-0000-0000-0000000000b1',
  runItemA1: '99999999-0000-0000-0000-0000000000a1',
  runItemA2: '99999999-0000-0000-0000-0000000000a2',
  runItemB1: '99999999-0000-0000-0000-0000000000b1',
  fileA1Shared: '12121212-0000-0000-0000-0000000000a1',
  fileA1Internal: '12121212-0000-0000-0000-0000000000a2',
  fileA2Shared: '12121212-0000-0000-0000-0000000000a3',
  fileB1Shared: '12121212-0000-0000-0000-0000000000b1',
  linkA1: '13131313-0000-0000-0000-0000000000a1',
  linkA2: '13131313-0000-0000-0000-0000000000a2',
  linkB1: '13131313-0000-0000-0000-0000000000b1',
  templateA: '14141414-0000-0000-0000-0000000000a1',
  templateB: '14141414-0000-0000-0000-0000000000b1',
  itemAShared: '15151515-0000-0000-0000-0000000000a1',
  itemAInternal: '15151515-0000-0000-0000-0000000000a2',
  itemBShared: '15151515-0000-0000-0000-0000000000b1',
} as const

/** Principals the tests reuse, as GUC bundles. */
export const AS = {
  /** Org A owner, no wedding pin: sees every wedding in org A. */
  staffA: { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' } as Gucs,
  staffB: { userId: F.staffB, orgId: F.orgB, weddingRole: 'owner' } as Gucs,
  /**
   * The dual-membership user, in the shape `withTenant` builds for org C -- which is
   * where `landingOrgId` sends them, owner outranking admin.
   *
   * The point of this bundle is that `app.user_id` is set, exactly as `withTenant` sets
   * it. That is what makes a user-axis policy on `organizations` live inside a tenant
   * transaction, and it is the combination no assertion covered before 2026-08-20.
   */
  staffDualOnC: { userId: F.staffDual, orgId: F.orgC, weddingRole: 'owner' } as Gucs,
  /** Org A owner, pinned to wedding A1. */
  staffAOnA1: {
    userId: F.staffA,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingRole: 'owner',
  } as Gucs,
  /**
   * An assigned staff `member`, pinned to A1 -- the shape `withTenant` builds for
   * `assignedStaff`. The principal the planner-app tables must let in for A1 and keep out of
   * A2, and (for `vendor_links`) keep out entirely.
   */
  memberOnA1: {
    userId: F.memberA,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingRole: 'member',
  } as Gucs,
  /** An org-wide `admin` of org A: `staffDual` is admin of A and owner of C. */
  adminA: { userId: F.staffDual, orgId: F.orgA, weddingRole: 'admin' } as Gucs,
  /**
   * An outside collaborator pinned to A1 (`weddingMember` with role `editor`). Spec 0003
   * gives `editor` none of the planner screens "in this build", and the policies enforce it.
   */
  editorOnA1: {
    userId: F.memberA,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingRole: 'editor',
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

/**
 * What the seed role actually is, and whether it can bypass RLS.
 *
 * `bypassesRls` is true for a superuser OR a role with BYPASSRLS. Both are needed cases:
 * locally the seed role is a superuser, on Neon it is `neondb_owner`, which gets BYPASSRLS
 * through `neon_superuser`. Ownership alone is NOT sufficient -- `0001_rls.sql` sets FORCE
 * ROW LEVEL SECURITY, which binds the owner to its own policies.
 */
let seedRoleCache: Promise<{ role: string; bypassesRls: boolean }> | undefined

export function seedRoleInfo(): Promise<{ role: string; bypassesRls: boolean }> {
  seedRoleCache ??= (async () => {
    const pool = new NodePool({ connectionString: SEED_URL, max: 1 })
    try {
      const { rows } = await pool.query(
        `select current_user as role, (rolsuper or rolbypassrls) as bypasses_rls
           from pg_roles where rolname = current_user`,
      )
      const r = rows[0] as { role: string; bypasses_rls: boolean }
      return { role: r.role, bypassesRls: r.bypasses_rls }
    } finally {
      await pool.end()
    }
  })()
  return seedRoleCache
}

/**
 * Checked at the top of `reseed()` rather than only in a test.
 *
 * A misconfigured seed role makes the INSERTs fail inside `beforeAll`, and vitest reports
 * that as dozens of SKIPPED tests -- which reads like "nothing to run here" rather than
 * "your fixture role is wrong". Worse, a test asserting the role is correct is itself
 * skipped, so the assertion designed to explain the failure never executes. Verified: with
 * SEED_DATABASE_URL pointed at app_user, the suite reported 47 passed / 48 skipped and
 * zero failures.
 *
 * So the check has to happen before the first INSERT, and it has to throw with the
 * explanation attached.
 */
async function assertSeedRoleUsable(): Promise<void> {
  const seed = await seedRoleInfo()
  if (!seed.bypassesRls) {
    throw new Error(
      `SEED_DATABASE_URL connects as '${seed.role}', which cannot bypass RLS.\n` +
        'The fixture deliberately contains rows for two different tenants, which no single\n' +
        'tenant context may create -- and it must be ground truth, independent of the\n' +
        'policies under test. Ownership alone is NOT enough: 0001_rls.sql sets FORCE ROW\n' +
        'LEVEL SECURITY, which binds even the table owner to its own policies.\n' +
        '  On Neon:  use the project owner (neondb_owner), which has BYPASSRLS via\n' +
        '            neon_superuser.\n' +
        '  Locally:  use a superuser (postgres).\n' +
        'It must NOT be the same role as TEST_DATABASE_URL, or every assertion in this\n' +
        'suite becomes vacuous.',
    )
  }
}

/**
 * One statement through the SEED role, for setting up a state `app_user` cannot reach.
 *
 * Soft delete is the case that needed it: `update organizations set deleted_at = now()`
 * is a write, and every write to a tenant table is refused unless the GUCs say otherwise
 * -- which is the property `isolation.test.ts` asserts and must keep asserting. So a test
 * that wants a soft-deleted row has to write it from outside the mechanism under test,
 * exactly as `reseed()` does and for the same reason: the fixture has to be ground truth,
 * independent of what it is being used to check.
 *
 * Always pair it with `reseed()` in a `finally`. This writes real rows to the shared
 * fixture, and the `db` project runs serially precisely because that state is shared.
 */
export async function seedExec(sqlText: string, values: unknown[] = []): Promise<void> {
  await assertSeedRoleUsable()
  const pool = new NodePool({ connectionString: SEED_URL, max: 1 })
  try {
    await pool.query(sqlText, values)
  } finally {
    await pool.end()
  }
}

/**
 * Spec 0003's ten tables. Every one has rows for org A (both weddings, where wedding-scoped)
 * AND org B, and the shapes are chosen so each policy clause has something to exclude:
 * `files` and `template_items` have an `internal` row, `vendor_links` has rows on both A
 * weddings, the org-scoped tables have a row in a second org.
 *
 * Written through the seed role, as everything in `reseed()` is: the fixture has to be ground
 * truth, independent of the policies it is used to check.
 */
async function seedPlannerTables(pool: NodePool): Promise<void> {
  await pool.query(
    `insert into wedding_events (id, org_id, wedding_id, label, starts_on, starts_at) values
       ($1,$4,$6,'Ceremony','2027-07-31','15:30'),
       ($2,$4,$7,'Party','2027-08-14','19:00'),
       ($3,$5,$8,'Ceremony','2027-09-04','14:00')`,
    [F.eventA1, F.eventA2, F.eventB1, F.orgA, F.orgB, F.weddingA1, F.weddingA2, F.weddingB1],
  )
  await pool.query(
    `insert into vendors (id, org_id, name, category) values
       ($1,$4,'Traiteur A','Catering'), ($2,$5,'Traiteur B','Catering'),
       ($3,$4,'Bloemen A','Flowers')`,
    [F.vendorA, F.vendorB, F.vendorA2, F.orgA, F.orgB],
  )
  await pool.query(
    `insert into wedding_vendors (id, org_id, wedding_id, vendor_id, status) values
       ($1,$4,$6,$8,'booked'), ($2,$4,$7,$8,'quoted'), ($3,$5,$9,$10,'booked')`,
    [
      F.wedVendorA1,
      F.wedVendorA2,
      F.wedVendorB1,
      F.orgA,
      F.orgB,
      F.weddingA1,
      F.weddingA2,
      F.vendorA,
      F.weddingB1,
      F.vendorB,
    ],
  )
  await pool.query(
    `insert into budget_lines (id, org_id, wedding_id, category, label, estimate_cents) values
       ($1,$4,$6,'Catering','Dinner',1176000),
       ($2,$4,$7,'Catering','Dinner',900000),
       ($3,$5,$8,'Catering','Dinner',500000)`,
    [
      F.budgetLineA1,
      F.budgetLineA2,
      F.budgetLineB1,
      F.orgA,
      F.orgB,
      F.weddingA1,
      F.weddingA2,
      F.weddingB1,
    ],
  )
  await pool.query(
    `insert into payments (id, org_id, wedding_id, budget_line_id, due_on, amount_cents) values
       ($1,$7,$9,$4,'2027-07-24',504000),
       ($2,$7,$10,$5,'2027-08-07',400000),
       ($3,$8,$11,$6,'2027-08-28',200000)`,
    [
      F.paymentA1,
      F.paymentA2,
      F.paymentB1,
      F.budgetLineA1,
      F.budgetLineA2,
      F.budgetLineB1,
      F.orgA,
      F.orgB,
      F.weddingA1,
      F.weddingA2,
      F.weddingB1,
    ],
  )
  await pool.query(
    `insert into run_sheet_items (id, org_id, wedding_id, event_id, starts_at, duration_min, title) values
       ($1,$7,$9,$4,'15:30',40,'Ceremony'),
       ($2,$7,$10,$5,'21:00',10,'First dance'),
       ($3,$8,$11,$6,'14:00',30,'Ceremony')`,
    [
      F.runItemA1,
      F.runItemA2,
      F.runItemB1,
      F.eventA1,
      F.eventA2,
      F.eventB1,
      F.orgA,
      F.orgB,
      F.weddingA1,
      F.weddingA2,
      F.weddingB1,
    ],
  )
  await pool.query(
    `insert into files (id, org_id, wedding_id, kind, name, storage_key, size_bytes, mime, visibility) values
       ($1,$5,$7,'file','Venue contract.pdf','a/a1/contract',412000,'application/pdf','shared'),
       ($2,$5,$7,'file','Rentals quote comparison.xlsx','a/a1/quotes',62000,'application/vnd.ms-excel','internal'),
       ($3,$5,$8,'image','Chapel aisle.jpg','a/a2/aisle',900000,'image/jpeg','shared'),
       ($4,$6,$9,'file','Contract.pdf','b/b1/contract',100000,'application/pdf','shared')`,
    [
      F.fileA1Shared,
      F.fileA1Internal,
      F.fileA2Shared,
      F.fileB1Shared,
      F.orgA,
      F.orgB,
      F.weddingA1,
      F.weddingA2,
      F.weddingB1,
    ],
  )
  await pool.query(
    `insert into vendor_links (id, org_id, wedding_id, wedding_vendor_id, token_hash, expires_at) values
       ($1,$7,$9,$4,'hash-link-a1', now() + interval '7 days'),
       ($2,$7,$10,$5,'hash-link-a2', now() + interval '7 days'),
       ($3,$8,$11,$6,'hash-link-b1', now() + interval '7 days')`,
    [
      F.linkA1,
      F.linkA2,
      F.linkB1,
      F.wedVendorA1,
      F.wedVendorA2,
      F.wedVendorB1,
      F.orgA,
      F.orgB,
      F.weddingA1,
      F.weddingA2,
      F.weddingB1,
    ],
  )
  await pool.query(
    `insert into task_templates (id, org_id, name) values
       ($1,$3,'Full planning'), ($2,$4,'Day-of coordination')`,
    [F.templateA, F.templateB, F.orgA, F.orgB],
  )
  await pool.query(
    `insert into template_items (id, org_id, template_id, title, due_offset_days, visibility) values
       ($1,$4,$5,'Sign the venue contract',-300,'shared'),
       ($2,$4,$5,'Agree the planning fee schedule',-240,'internal'),
       ($3,$6,$7,'Confirm arrival times',-7,'shared')`,
    [F.itemAShared, F.itemAInternal, F.itemBShared, F.orgA, F.templateA, F.orgB, F.templateB],
  )
}

export async function reseed(): Promise<void> {
  await assertSeedRoleUsable()
  const pool = new NodePool({ connectionString: SEED_URL, max: 1 })
  try {
    await pool.query(`truncate table
      vendor_links, run_sheet_items, payments, budget_lines, files, wedding_events,
      wedding_vendors, vendors, template_items, task_templates,
      task_comments, tasks, audit_log, invitations, wedding_domains,
      wedding_members, org_members, weddings, organizations, users cascade`)
    await pool.query(
      `insert into users (id, email) values
         ($1,'couple@a1.test'), ($2,'staff@a.test'), ($3,'staff@b.test'),
         ($4,'member@a.test'), ($5,'dual@a.test')`,
      [F.coupleA1, F.staffA, F.staffB, F.memberA, F.staffDual],
    )
    // org-c is inserted LAST and its name sorts FIRST -- see the note on F.orgC.
    await pool.query(
      `insert into organizations (id, slug, name, type) values
         ($1,'org-a','Studio A','planner'), ($2,'org-b','Studio B','planner'),
         ($3,'org-c','Atelier Zero','planner')`,
      [F.orgA, F.orgB, F.orgC],
    )
    await pool.query(
      `insert into weddings (id, org_id, slug, couple_display_name, wedding_date) values
         ($1,$4,'a-one','A One','2027-07-31'),
         ($2,$4,'a-two','A Two','2027-08-14'),
         ($3,$5,'b-one','B One','2027-09-04')`,
      [F.weddingA1, F.weddingA2, F.weddingB1, F.orgA, F.orgB],
    )
    await pool.query(
      `insert into wedding_members (wedding_id, user_id, role) values
         ($1,$2,'couple'), ($1,$3,'editor')`,
      [F.weddingA1, F.coupleA1, F.memberA],
    )
    await pool.query(
      `insert into org_members (org_id, user_id, role) values
         ($1,$2,'owner'), ($3,$4,'owner'),
         ($1,$5,'member'),
         ($1,$6,'admin'), ($7,$6,'owner')`,
      [F.orgA, F.staffA, F.orgB, F.staffB, F.memberA, F.staffDual, F.orgC],
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
    await seedPlannerTables(pool)
  } finally {
    await pool.end()
  }
}
