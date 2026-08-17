import { getTableName, isTable } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schemaModule from '../src/schema/index.ts'
import {
  SELF_SCOPED_TABLES,
  TENANT_SCOPED_TABLES,
  UNSCOPED_TABLES,
  USER_SCOPED_TABLES,
  VISIBILITY_SCOPED_TABLES,
} from '../src/schema/index.ts'
import { connect, type Harness, migrationFilesOnDisk, migrationSql } from './harness.ts'

/**
 * The test that keeps every other test in this directory honest.
 *
 * research/09-planner-app.md item P5 asks for the isolation suite to be "extended to
 * tasks, budget, vendors". A list somebody has to remember to extend is a list that
 * eventually is not extended -- at 22:00 on a Sunday, by the person who added the
 * table. This makes it mechanical: add a table and CI goes red until it has been
 * classified, has its tenant key, has RLS enabled AND forced, and has a policy.
 *
 * research/09-planner-app.md's own schema sketches shipped `tasks` and `budget_lines`
 * WITHOUT `org_id`, contradicting research/05-architecture.md section 4's both-keys
 * rule. That is exactly the class of omission this catches, and the reason it exists.
 */

let h: Harness

beforeAll(async () => {
  h = connect()
})
afterAll(async () => {
  await h?.end()
})

/** Every table actually declared in the Drizzle schema. */
const declaredTables: string[] = Object.values(schemaModule)
  .filter((v) => isTable(v))
  .map((t) => getTableName(t))
  .sort()

const classified = [
  ...TENANT_SCOPED_TABLES,
  ...SELF_SCOPED_TABLES,
  ...USER_SCOPED_TABLES,
  ...UNSCOPED_TABLES,
] as readonly string[]

const rlsTables = [
  ...TENANT_SCOPED_TABLES,
  ...SELF_SCOPED_TABLES,
  ...USER_SCOPED_TABLES,
] as readonly string[]

async function catalog(query: string, values: unknown[] = []) {
  const c = await h.pool.connect()
  try {
    return (await c.query(query, values)).rows
  } finally {
    c.release()
  }
}

describe('every table is classified exactly once', () => {
  it('the schema declares the tables we think it does', () => {
    expect(declaredTables.length).toBeGreaterThan(0)
  })

  it.each(declaredTables)('%s appears in exactly one bucket', (table) => {
    const hits = classified.filter((t) => t === table).length
    expect(
      hits,
      `${table} is in ${hits} buckets. Add it to exactly one of TENANT_SCOPED_TABLES, ` +
        'SELF_SCOPED_TABLES, USER_SCOPED_TABLES or UNSCOPED_TABLES in src/schema/index.ts, ' +
        'and give it a policy in a new migration if it holds tenant data.',
    ).toBe(1)
  })

  it('no bucket names a table that does not exist', () => {
    const ghosts = classified.filter((t) => !declaredTables.includes(t))
    expect(ghosts, `classified but not declared: ${ghosts.join(', ')}`).toEqual([])
  })
})

describe('tenant-scoped tables carry their tenant keys', () => {
  it.each(TENANT_SCOPED_TABLES)('%s has org_id and wedding_id', async (table) => {
    const rows = await catalog(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1`,
      [table],
    )
    const cols = rows.map((r) => r.column_name as string)
    // research/05-architecture.md section 4: both keys, denormalised on purpose, so
    // every policy is a single-column check with no joins.
    expect(cols, `${table} is missing org_id`).toContain('org_id')
    expect(cols, `${table} is missing wedding_id`).toContain('wedding_id')
  })

  it.each(SELF_SCOPED_TABLES)('%s has org_id (its own id is the wedding scope)', async (table) => {
    const rows = await catalog(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1`,
      [table],
    )
    const cols = rows.map((r) => r.column_name as string)
    if (table !== 'organizations') expect(cols).toContain('org_id')
    expect(cols).toContain('id')
  })
})

describe('RLS is enabled AND forced', () => {
  /**
   * ENABLE alone is not enough: a table's OWNER is exempt from its own policies, and on
   * managed Postgres the application often connects as the owner. FORCE removes that
   * exemption. Checking both, per table, because getting one right and not the other is
   * the silent failure.
   */
  it.each(rlsTables)('%s', async (table) => {
    const rows = await catalog(
      `select relrowsecurity, relforcerowsecurity
         from pg_class where oid = $1::regclass`,
      [table],
    )
    const r = rows[0] as { relrowsecurity: boolean; relforcerowsecurity: boolean }
    expect(r?.relrowsecurity, `${table}: RLS is not ENABLED`).toBe(true)
    expect(r?.relforcerowsecurity, `${table}: RLS is not FORCED, so the owner bypasses it`).toBe(
      true,
    )
  })

  it.each(rlsTables)('%s has at least one policy', async (table) => {
    const rows = await catalog(`select policyname from pg_policies where tablename = $1`, [table])
    expect(
      rows.length,
      `${table} has RLS on but no policy, so it returns nothing to anyone`,
    ).toBeGreaterThan(0)
  })

  it('policies apply to writes too, not only reads', async () => {
    // A policy with USING but no WITH CHECK lets a tenant INSERT rows into another
    // tenant, which is a quieter breach than reading them and much harder to notice.
    const rows = await catalog(
      `select tablename, policyname from pg_policies
        where tablename = any($1) and with_check is null and cmd = 'ALL'`,
      [rlsTables as unknown as string[]],
    )
    expect(
      rows.map((r) => `${r.tablename}.${r.policyname}`),
      'these policies have no WITH CHECK, so writes are unscoped',
    ).toEqual([])
  })

  it('the WITH CHECK actually references the tenant key, not just any expression', async () => {
    /**
     * `with check (true)` is not null, so the previous test passes on it while writes
     * are completely unscoped. That gap was real: weakening WITH CHECK to `true` left
     * this whole suite green until this assertion existed.
     *
     * So check what the predicate says, not merely that it exists.
     */
    const expectedKey = (t: string) =>
      (USER_SCOPED_TABLES as readonly string[]).includes(t) ? 'app.user_id' : 'app.org_id'

    const offenders: string[] = []
    for (const table of rlsTables) {
      const rows = await catalog(
        `select policyname, with_check from pg_policies where tablename = $1`,
        [table],
      )
      for (const r of rows) {
        const text = String(r.with_check ?? '')
        if (!text.includes(expectedKey(table))) {
          offenders.push(`${table}.${String(r.policyname)} -> WITH CHECK (${text || 'null'})`)
        }
      }
    }
    expect(
      offenders,
      'these WITH CHECK predicates do not reference their tenant key, so a tenant can ' +
        'write rows into another tenant:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  it('the USING predicate references the tenant key too', async () => {
    const expectedKey = (t: string) =>
      (USER_SCOPED_TABLES as readonly string[]).includes(t) ? 'app.user_id' : 'app.org_id'

    const offenders: string[] = []
    for (const table of rlsTables) {
      const rows = await catalog(`select policyname, qual from pg_policies where tablename = $1`, [
        table,
      ])
      for (const r of rows) {
        const text = String(r.qual ?? '')
        if (!text.includes(expectedKey(table))) {
          offenders.push(`${table}.${String(r.policyname)} -> USING (${text || 'null'})`)
        }
      }
    }
    expect(
      offenders,
      `these USING predicates do not scope by tenant:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})

describe('the visibility dimension is wired where it is needed', () => {
  it.each(VISIBILITY_SCOPED_TABLES)('%s has a visibility column', async (table) => {
    const rows = await catalog(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name=$1 and column_name='visibility'`,
      [table],
    )
    expect(rows).toHaveLength(1)
  })

  it.each(VISIBILITY_SCOPED_TABLES)('%s policy tests app.wedding_role', async (table) => {
    // Without this clause the column is enforced only in application code, with no
    // backstop -- for exactly the rows research/09-planner-app.md section b identifies
    // as most damaging to leak.
    const rows = await catalog(`select qual, with_check from pg_policies where tablename = $1`, [
      table,
    ])
    const text = rows.map((r) => `${r.qual ?? ''} ${r.with_check ?? ''}`).join(' ')
    expect(text, `${table} policy does not reference app.wedding_role`).toContain(
      'app.wedding_role',
    )
  })

  it('a table with a visibility column is declared visibility-scoped', async () => {
    const rows = await catalog(
      `select table_name from information_schema.columns
        where table_schema='public' and column_name='visibility'`,
    )
    const withColumn = rows.map((r) => r.table_name as string).sort()
    expect(
      withColumn,
      'a table gained a `visibility` column without being added to VISIBILITY_SCOPED_TABLES, ' +
        'so its policy almost certainly does not enforce it',
    ).toEqual([...VISIBILITY_SCOPED_TABLES].sort())
  })
})

describe('migrations are consistent', () => {
  it('every .sql file on disk is registered in the journal', () => {
    const journalTags = migrationSql()
      .map((m) => `${m.tag}.sql`)
      .sort()
    expect(migrationFilesOnDisk()).toEqual(journalTags)
  })

  it('the RLS migration has not been silently emptied', () => {
    const rls = migrationSql().find((m) => m.tag.endsWith('_rls'))
    expect(rls, 'no *_rls migration found').toBeTruthy()
    expect(rls?.sql).toMatch(/force\s+row\s+level\s+security/i)
    expect(rls?.sql).toMatch(/create\s+policy/i)
  })
})
