import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AS, asPrincipal, connect, countOf, F, type Gucs, type Harness, reseed } from './harness.ts'

/**
 * Isolation for the ten tables spec 0003 added (migrations 0006 and 0007).
 *
 * `isolation.test.ts` already proves the generic properties over every bucket -- no GUCs
 * means no rows, org A sees none of org B -- because these tables joined the bucket lists.
 * What it cannot say is what is SPECIFIC to them, and that is this file:
 *
 *   1. A `couple` reads none of it, pinned or not, and writes none of it. This is the rule
 *      spec 0003 makes of every new policy, and the tenant keys alone cannot enforce it: a
 *      couple's GUCs match the planner's, so only the role clause tells them apart.
 *   2. A pinned `member` sees their wedding and not its sibling, on the seven wedding-scoped
 *      tables, and sees the whole org's directory on the three org-scoped ones.
 *   3. `vendor_links` is closed to a member, reads included.
 *   4. The CHECKs and foreign keys behave as 0006 says.
 *
 * Every read assertion is paired with a non-vacuity check: an empty table isolates
 * perfectly, so each table's expected counts are stated and the fixture must meet them.
 */

let h: Harness

beforeAll(async () => {
  h = connect()
  await reseed()
})
afterAll(async () => {
  await h?.end()
})
// Every test that WRITES restores the fixture, so file order never matters. Cheap: one
// truncate and a few dozen inserts.
afterEach(async () => {
  await reseed()
})

const RLS_ERROR = /row-level security/i

type Insert = (org: string, wedding: string) => [sql: string, values: unknown[]]

type WeddingTable = {
  table: string
  /** rows org A holds: both weddings, then wedding A1 alone */
  orgA: number
  a1: number
  /** rows org B holds */
  orgB: number
  /** an INSERT that satisfies every CHECK and foreign key, aimed at (org, wedding) */
  insert: Insert
  /** closed to every role but owner and admin */
  ownerAdminOnly?: true
}

const WEDDING_TABLES: WeddingTable[] = [
  {
    table: 'wedding_events',
    orgA: 2,
    a1: 1,
    orgB: 1,
    insert: (org, wedding) => [
      `insert into wedding_events (id, org_id, wedding_id, label, starts_on)
         values (gen_random_uuid(), $1, $2, 'Brunch', '2027-08-01')`,
      [org, wedding],
    ],
  },
  {
    table: 'budget_lines',
    orgA: 2,
    a1: 1,
    orgB: 1,
    insert: (org, wedding) => [
      `insert into budget_lines (id, org_id, wedding_id, category, label, estimate_cents)
         values (gen_random_uuid(), $1, $2, 'Flowers', 'Bouquet', 25000)`,
      [org, wedding],
    ],
  },
  {
    table: 'payments',
    orgA: 2,
    a1: 1,
    orgB: 1,
    insert: (org, wedding) => [
      `insert into payments (id, org_id, wedding_id, budget_line_id, due_on, amount_cents)
         values (gen_random_uuid(), $1, $2, $3, '2027-07-01', 10000)`,
      [org, wedding, F.budgetLineA1],
    ],
  },
  {
    table: 'wedding_vendors',
    orgA: 2,
    a1: 1,
    orgB: 1,
    insert: (org, wedding) => [
      `insert into wedding_vendors (id, org_id, wedding_id, vendor_id)
         values (gen_random_uuid(), $1, $2, $3)`,
      [org, wedding, F.vendorA2],
    ],
  },
  {
    table: 'run_sheet_items',
    orgA: 2,
    a1: 1,
    orgB: 1,
    insert: (org, wedding) => [
      `insert into run_sheet_items (id, org_id, wedding_id, event_id, starts_at, duration_min, title)
         values (gen_random_uuid(), $1, $2, $3, '10:00', 30, 'Setup')`,
      [org, wedding, F.eventA1],
    ],
  },
  {
    table: 'files',
    orgA: 3,
    a1: 2,
    orgB: 1,
    insert: (org, wedding) => [
      `insert into files (id, org_id, wedding_id, name, storage_key, size_bytes, mime)
         values (gen_random_uuid(), $1, $2, 'Menu.pdf', gen_random_uuid()::text, 1000, 'application/pdf')`,
      [org, wedding],
    ],
  },
  {
    table: 'vendor_links',
    orgA: 2,
    a1: 1,
    orgB: 1,
    ownerAdminOnly: true,
    insert: (org, wedding) => [
      `insert into vendor_links (id, org_id, wedding_id, wedding_vendor_id, token_hash, expires_at)
         values (gen_random_uuid(), $1, $2, $3, gen_random_uuid()::text, now() + interval '7 days')`,
      [org, wedding, F.wedVendorA1],
    ],
  },
]

type OrgTable = {
  table: string
  orgA: number
  orgB: number
  insert: (org: string) => [sql: string, values: unknown[]]
}

const ORG_TABLES: OrgTable[] = [
  {
    table: 'vendors',
    orgA: 2,
    orgB: 1,
    insert: (org) => [
      `insert into vendors (id, org_id, name, category)
         values (gen_random_uuid(), $1, 'Studio Ampersand', 'Stationery')`,
      [org],
    ],
  },
  {
    table: 'task_templates',
    orgA: 1,
    orgB: 1,
    insert: (org) => [
      `insert into task_templates (id, org_id, name) values (gen_random_uuid(), $1, 'Partial')`,
      [org],
    ],
  },
  {
    table: 'template_items',
    orgA: 2,
    orgB: 1,
    insert: (org) => [
      `insert into template_items (id, org_id, template_id, title, due_offset_days)
         values (gen_random_uuid(), $1, $2, 'Book the DJ', -200)`,
      [org, F.templateA],
    ],
  },
]

const n = (rows: Record<string, unknown>[]) => Number((rows[0] as { n: number }).n)
const run = (g: Gucs, sqlText: string, values: unknown[] = []) => asPrincipal(h, g, sqlText, values)

describe.each(WEDDING_TABLES)('$table (wedding-scoped)', (spec) => {
  const { table } = spec

  it('the fixture holds the rows the assertions below count on', async () => {
    // Guards every "sees nothing" case in this block: those pass on an empty table.
    expect(await countOf(h, AS.staffA, table)).toBe(spec.orgA)
    expect(await countOf(h, AS.staffB, table)).toBe(spec.orgB)
  })

  it('org-wide owner and admin read every wedding of the org, and none of another', async () => {
    expect(await countOf(h, AS.staffA, table)).toBe(spec.orgA)
    expect(await countOf(h, AS.adminA, table)).toBe(spec.orgA)
    expect(
      n(
        await run(AS.staffA, `select count(*)::int as n from "${table}" where org_id = $1`, [
          F.orgB,
        ]),
      ),
    ).toBe(0)
  })

  it(
    spec.ownerAdminOnly
      ? 'an assigned member reads NOTHING, even on their own wedding'
      : 'an assigned member reads their wedding and not its sibling',
    async () => {
      const own = await countOf(h, AS.memberOnA1, table)
      expect(own).toBe(spec.ownerAdminOnly ? 0 : spec.a1)
      expect(
        n(
          await run(
            AS.memberOnA1,
            `select count(*)::int as n from "${table}" where wedding_id = $1`,
            [F.weddingA2],
          ),
        ),
      ).toBe(0)
    },
  )

  it('a couple reads nothing, correctly pinned or not', async () => {
    expect(await countOf(h, AS.coupleA1, table)).toBe(0)
    // The shape research/07 section 3 warns about: the wedding clause falls through to
    // org-wide, and only the role clause stands between this couple and every wedding.
    expect(await countOf(h, AS.coupleA1Unpinned, table)).toBe(0)
  })

  it('an outside editor reads nothing (spec 0003: no planner screen in this build)', async () => {
    expect(await countOf(h, AS.editorOnA1, table)).toBe(0)
  })

  it('a couple cannot write into their own wedding', async () => {
    const [sqlText, values] = spec.insert(F.orgA, F.weddingA1)
    await expect(run(AS.coupleA1, sqlText, values)).rejects.toThrow(RLS_ERROR)
  })

  it('a couple can neither update nor delete a row, because they cannot see one', async () => {
    // USING filters the target set to empty: no error, no rows touched. Checked with
    // RETURNING because a bare UPDATE reports nothing and would pass on any policy.
    expect(
      await run(
        AS.coupleA1Unpinned,
        `update "${table}" set updated_at = now() where org_id = $1 returning 1`,
        [F.orgA],
      ),
    ).toEqual([])
    expect(
      await run(AS.coupleA1Unpinned, `delete from "${table}" where org_id = $1 returning 1`, [
        F.orgA,
      ]),
    ).toEqual([])
  })

  it('an outside editor cannot write either', async () => {
    const [sqlText, values] = spec.insert(F.orgA, F.weddingA1)
    await expect(run(AS.editorOnA1, sqlText, values)).rejects.toThrow(RLS_ERROR)
  })

  it('org B cannot write a row into org A', async () => {
    const [sqlText, values] = spec.insert(F.orgA, F.weddingA1)
    await expect(run(AS.staffB, sqlText, values)).rejects.toThrow(RLS_ERROR)
  })

  it('org-wide staff can write to either wedding of their own org', async () => {
    // The mirror image: a WITH CHECK that rejected everything would pass every case above.
    for (const wedding of [F.weddingA1, F.weddingA2]) {
      const [sqlText, values] = spec.insert(F.orgA, wedding)
      await run(AS.staffA, `${sqlText} returning id`, values).then((rows) =>
        expect(rows).toHaveLength(1),
      )
      await reseed()
    }
  })

  it(
    spec.ownerAdminOnly
      ? 'an assigned member cannot write, on either wedding'
      : 'an assigned member writes to their wedding and not to its sibling',
    async () => {
      const own = spec.insert(F.orgA, F.weddingA1)
      if (spec.ownerAdminOnly) {
        await expect(run(AS.memberOnA1, own[0], own[1])).rejects.toThrow(RLS_ERROR)
      } else {
        expect(await run(AS.memberOnA1, `${own[0]} returning id`, own[1])).toHaveLength(1)
      }
      await reseed()
      const sibling = spec.insert(F.orgA, F.weddingA2)
      await expect(run(AS.memberOnA1, sibling[0], sibling[1])).rejects.toThrow(RLS_ERROR)
    },
  )
})

describe.each(ORG_TABLES)('$table (org-scoped)', (spec) => {
  const { table } = spec

  it('the fixture holds the rows the assertions below count on', async () => {
    expect(await countOf(h, AS.staffA, table)).toBe(spec.orgA)
    expect(await countOf(h, AS.staffB, table)).toBe(spec.orgB)
  })

  it('org A reads its own rows and none of org B', async () => {
    expect(await countOf(h, AS.staffA, table)).toBe(spec.orgA)
    expect(
      n(
        await run(AS.staffA, `select count(*)::int as n from "${table}" where org_id = $1`, [
          F.orgB,
        ]),
      ),
    ).toBe(0)
  })

  it('an assigned member reads the WHOLE org directory, not one wedding of it', async () => {
    // There is no wedding on the row to narrow by. Spec 0003: "Manage vendors, templates:
    // member read". Pinned here so that changing it is a decision and not an accident.
    expect(await countOf(h, AS.memberOnA1, table)).toBe(spec.orgA)
  })

  it('a couple reads nothing, correctly pinned or not', async () => {
    expect(await countOf(h, AS.coupleA1, table)).toBe(0)
    expect(await countOf(h, AS.coupleA1Unpinned, table)).toBe(0)
  })

  it('an outside editor reads nothing', async () => {
    expect(await countOf(h, AS.editorOnA1, table)).toBe(0)
  })

  it('a couple cannot write, and cannot update or delete what they cannot see', async () => {
    const [sqlText, values] = spec.insert(F.orgA)
    await expect(run(AS.coupleA1, sqlText, values)).rejects.toThrow(RLS_ERROR)
    expect(
      await run(
        AS.coupleA1Unpinned,
        `update "${table}" set updated_at = now() where org_id = $1 returning 1`,
        [F.orgA],
      ),
    ).toEqual([])
    expect(
      await run(AS.coupleA1Unpinned, `delete from "${table}" where org_id = $1 returning 1`, [
        F.orgA,
      ]),
    ).toEqual([])
  })

  it('org B cannot write a row into org A', async () => {
    const [sqlText, values] = spec.insert(F.orgA)
    await expect(run(AS.staffB, sqlText, values)).rejects.toThrow(RLS_ERROR)
  })

  it('org staff can write to their own org', async () => {
    const [sqlText, values] = spec.insert(F.orgA)
    expect(await run(AS.staffA, `${sqlText} returning id`, values)).toHaveLength(1)
  })

  it('an assigned member CAN write here: gating writes by role is the action, not the policy', async () => {
    // A deliberate non-goal of 0007, stated in its header. If this starts failing, the
    // policy has grown a write rule and the header, the spec's permissions table and every
    // Server Function that checks the role need to agree with it.
    const [sqlText, values] = spec.insert(F.orgA)
    expect(await run(AS.memberOnA1, `${sqlText} returning id`, values)).toHaveLength(1)
  })
})

describe('visibility on files and template_items', () => {
  /**
   * Both tables carry `visibility`, so their policy carries a second, `visibility = 'shared'
   * or role in (...)` clause beside the role clause that already keeps a couple out.
   *
   * That second clause CANNOT be isolated from here: every role the first clause admits is
   * also a role that sees internal rows, so deleting the second changes no result. It is
   * there so that adding `couple` to the first list does not expose internal rows as a side
   * effect. The assertions below pin what is observable -- staff see internal rows, a
   * couple sees nothing at all -- and a mutation of the second clause will survive them.
   * schema-coverage.test.ts only requires that `app.wedding_role` appears in the policy.
   */
  it('staff and members see an internal file; a couple sees none of them', async () => {
    const internal = `select count(*)::int as n from files where visibility = 'internal'`
    expect(n(await run(AS.staffA, internal))).toBe(1)
    expect(n(await run(AS.memberOnA1, internal))).toBe(1)
    expect(n(await run(AS.coupleA1, internal))).toBe(0)
    expect(n(await run(AS.coupleA1Unpinned, internal))).toBe(0)
  })

  it('staff and members see an internal template item; a couple sees none', async () => {
    const internal = `select count(*)::int as n from template_items where visibility = 'internal'`
    expect(n(await run(AS.staffA, internal))).toBe(1)
    expect(n(await run(AS.memberOnA1, internal))).toBe(1)
    expect(n(await run(AS.coupleA1Unpinned, internal))).toBe(0)
  })
})

describe('the role clause fails closed', () => {
  it('an unset role reads nothing from any of the ten tables', async () => {
    // Every other GUC correct, the role blank: the clause is `NULL in (...)`, so NULL, so
    // filtered. The direction it is safe to be wrong in.
    const noRole: Gucs = { userId: F.staffA, orgId: F.orgA, weddingRole: '' }
    for (const t of [...WEDDING_TABLES, ...ORG_TABLES]) {
      expect(await countOf(h, noRole, t.table), `${t.table} returned rows with no role`).toBe(0)
    }
  })

  it('an unrecognised role reads nothing either', async () => {
    const bogus: Gucs = { userId: F.staffA, orgId: F.orgA, weddingRole: 'guest' }
    for (const t of [...WEDDING_TABLES, ...ORG_TABLES]) {
      expect(await countOf(h, bogus, t.table), `${t.table} admitted the role 'guest'`).toBe(0)
    }
  })
})

describe('vendor_links is owner and admin only', () => {
  it('an org-wide admin reads and writes it', async () => {
    expect(await countOf(h, AS.adminA, 'vendor_links')).toBe(2)
    const [sqlText, values] = WEDDING_TABLES.find((t) => t.table === 'vendor_links')?.insert(
      F.orgA,
      F.weddingA1,
    ) ?? ['', []]
    expect(await run(AS.adminA, `${sqlText} returning id`, values)).toHaveLength(1)
  })

  it('a member cannot revoke a link: the update finds no row', async () => {
    expect(
      await run(AS.memberOnA1, `update vendor_links set revoked_at = now() returning id`),
    ).toEqual([])
    expect(
      n(
        await run(
          AS.staffA,
          `select count(*)::int as n from vendor_links where revoked_at is not null`,
        ),
      ),
    ).toBe(0)
  })
})

describe('0006 constraints', () => {
  const owner = (sqlText: string, values: unknown[] = []) => run(AS.staffA, sqlText, values)

  it('weddings.color accepts #RRGGBB upper-case and rejects everything else', async () => {
    await owner(`update weddings set color = '#7A6A9B' where id = $1`, [F.weddingA1])
    for (const bad of ['#7a6a9b', '#7A6', '7A6A9B', '#7A6A9BFF', 'teal', '']) {
      await expect(
        owner(`update weddings set color = $1 where id = $2`, [bad, F.weddingA1]),
        `color ${JSON.stringify(bad)} was accepted`,
      ).rejects.toThrow(/weddings_color_check/)
    }
  })

  it('weddings.headcount cannot be negative, and the new columns are nullable', async () => {
    await owner(
      `update weddings set headcount = 140, venue = 'Kasteel', notes = 'x' where id = $1`,
      [F.weddingA1],
    )
    await expect(
      owner(`update weddings set headcount = -1 where id = $1`, [F.weddingA1]),
    ).rejects.toThrow(/weddings_headcount_check/)
    await owner(`update weddings set headcount = null, color = null where id = $1`, [F.weddingA1])
  })

  it.each([
    [
      'wedding_vendors_status_check',
      `update wedding_vendors set status = 'ghosted' where id = $1`,
      F.wedVendorA1,
    ],
    ['files_kind_check', `update files set kind = 'video' where id = $1`, F.fileA1Shared],
    [
      'files_visibility_check',
      `update files set visibility = 'public' where id = $1`,
      F.fileA1Shared,
    ],
    ['files_size_check', `update files set size_bytes = -1 where id = $1`, F.fileA1Shared],
    [
      'budget_lines_estimate_check',
      `update budget_lines set estimate_cents = -1 where id = $1`,
      F.budgetLineA1,
    ],
    [
      'budget_lines_actual_check',
      `update budget_lines set actual_cents = -1 where id = $1`,
      F.budgetLineA1,
    ],
    ['payments_amount_check', `update payments set amount_cents = -1 where id = $1`, F.paymentA1],
    [
      'run_sheet_items_duration_check',
      `update run_sheet_items set duration_min = 0 where id = $1`,
      F.runItemA1,
    ],
    [
      'template_items_visibility_check',
      `update template_items set visibility = 'public' where id = $1`,
      F.itemAShared,
    ],
    [
      'template_items_assignee_role_check',
      `update template_items set assignee_role = 'vendor' where id = $1`,
      F.itemAShared,
    ],
  ])('%s rejects a bad value', async (constraint, sqlText, id) => {
    await expect(owner(sqlText, [id])).rejects.toThrow(new RegExp(constraint))
  })

  it('a vendor cannot be on the same wedding twice, but can be re-added once removed', async () => {
    await expect(
      owner(
        `insert into wedding_vendors (id, org_id, wedding_id, vendor_id)
           values (gen_random_uuid(), $1, $2, $3)`,
        [F.orgA, F.weddingA1, F.vendorA],
      ),
    ).rejects.toThrow(/wedding_vendors_wedding_vendor_key/)
    await owner(`update wedding_vendors set deleted_at = now() where id = $1`, [F.wedVendorA1])
    const again = await owner(
      `insert into wedding_vendors (id, org_id, wedding_id, vendor_id)
         values (gen_random_uuid(), $1, $2, $3) returning id`,
      [F.orgA, F.weddingA1, F.vendorA],
    )
    expect(again).toHaveLength(1)
  })

  it('a token hash is unique across ALL tenants, and a storage key only within one org', async () => {
    // vendor_links.token_hash is how the S10 lookup FINDS a tenant, so a collision across
    // orgs would be ambiguous. files.storage_key is per org: see schema/files.ts.
    await expect(
      owner(`update vendor_links set token_hash = 'hash-link-a2' where id = $1`, [F.linkA1]),
    ).rejects.toThrow(/vendor_links_token_hash_unique/)
    await expect(
      owner(`update files set storage_key = 'a/a1/quotes' where id = $1`, [F.fileA1Shared]),
    ).rejects.toThrow(/files_org_storage_key_key/)
    await run(AS.staffB, `update files set storage_key = 'a/a1/quotes' where id = $1`, [
      F.fileB1Shared,
    ])
  })

  it('deleting a budget line takes its payments; deleting a wedding vendor keeps the lines', async () => {
    await owner(`delete from budget_lines where id = $1`, [F.budgetLineA1])
    expect(await owner(`select 1 from payments where id = $1`, [F.paymentA1])).toEqual([])

    // wedding_vendor_id is `set null`, so a removed vendor does not delete the schedule or
    // the budget row that mentioned them.
    await owner(`update budget_lines set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA2,
      F.budgetLineA2,
    ])
    await owner(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA2,
      F.runItemA2,
    ])
    await owner(`delete from wedding_vendors where id = $1`, [F.wedVendorA2])
    const kept = await owner(
      `select (select count(*) from budget_lines where id = $1 and wedding_vendor_id is null)::int
            + (select count(*) from run_sheet_items where id = $2 and wedding_vendor_id is null)::int as n`,
      [F.budgetLineA2, F.runItemA2],
    )
    expect(n(kept)).toBe(2)
  })

  it('a directory vendor still used by a wedding cannot be hard-deleted', async () => {
    await expect(owner(`delete from vendors where id = $1`, [F.vendorA])).rejects.toThrow(
      /foreign key/i,
    )
  })

  it('deleting a template takes its items; deleting an event takes its run sheet', async () => {
    await owner(`delete from task_templates where id = $1`, [F.templateA])
    expect(await owner(`select 1 from template_items where org_id = $1`, [F.orgA])).toEqual([])
    await owner(`delete from wedding_events where id = $1`, [F.eventA1])
    expect(await owner(`select 1 from run_sheet_items where id = $1`, [F.runItemA1])).toEqual([])
  })
})
