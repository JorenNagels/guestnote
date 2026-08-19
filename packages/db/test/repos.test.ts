import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getOrg, listWeddings, type Memberships, resolveMemberships } from '../src/repos/index.ts'
import { asNobody, asPrincipal, connect, F, type Harness, reseed } from './harness.ts'

/**
 * The repository layer against a real Postgres, with the real policies.
 *
 * `src/repos/memberships.test.ts` covers the pure decisions offline and exhaustively.
 * This file covers the half that cannot be faked: that `withUser` really can read
 * `org_members` before any tenant is known, that `withUser` genuinely cannot read tenant
 * tables while doing it, and that each principal shape returns the rows it should when
 * the real policies are the thing filtering.
 *
 * What it is NOT is a second isolation suite. These assertions are made through the
 * repository, so they pass when the repository is right -- and several of them would
 * still pass if a policy were wrong, because the repository filters too. Whether the
 * POLICIES hold on their own is isolation.test.ts's job, and it answers it by setting
 * GUCs by hand into shapes no correct caller can produce. Each case below says which of
 * the two it is actually testing where that is not obvious.
 *
 * The suite runs on the local tier by default; nothing here is pooler-specific.
 */

let h: Harness

/**
 * A staff MEMBER assigned to one wedding. The shared fixture has owners and a couple but
 * no member, and the member is the one principal whose reads cost one transaction per
 * wedding -- `assignedStaff` must pin `app.wedding_id`, and a pinned GUC returns exactly
 * the row it names.
 *
 * Note how these rows are written: through `app_user` with only `app.user_id` set, which
 * is all the `own_memberships` policies' `with check (user_id = app.user_id)` requires.
 * No privileged role and no `unsafeDbForMigrationsAndAdminOnly` -- so this fixture also
 * demonstrates that adding yourself to an org is expressible inside the policies.
 */
const MEMBER = 'eeeeeeee-0000-0000-0000-0000000000e1'

beforeAll(async () => {
  h = connect()
  await reseed()

  await asNobody(h, `insert into users (id, email) values ($1, 'member@a.test')`, [MEMBER])
  await asPrincipal(
    h,
    { userId: MEMBER },
    `insert into org_members (org_id, user_id, role) values ($1, $2, 'member')`,
    [F.orgA, MEMBER],
  )
  await asPrincipal(
    h,
    { userId: MEMBER },
    `insert into wedding_members (wedding_id, user_id, role) values ($1, $2, 'editor')`,
    [F.weddingA1, MEMBER],
  )
})

afterAll(async () => {
  await h.end()
})

const namesOf = (rows: { coupleDisplayName: string }[]) =>
  rows.map((r) => r.coupleDisplayName).sort()

describe('resolveMemberships', () => {
  it('reads an owner as org staff with no wedding rows', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect(m).toEqual({
      userId: F.staffA,
      orgs: [{ orgId: F.orgA, role: 'owner' }],
      weddings: [],
    })
  })

  it('reads a couple as a wedding member with no org rows', async () => {
    const m = await resolveMemberships(h.db, F.coupleA1)
    expect(m.orgs).toEqual([])
    expect(m.weddings).toEqual([{ weddingId: F.weddingA1, role: 'couple' }])
  })

  it('reads an assigned member as both', async () => {
    const m = await resolveMemberships(h.db, MEMBER)
    expect(m.orgs).toEqual([{ orgId: F.orgA, role: 'member' }])
    expect(m.weddings).toEqual([{ weddingId: F.weddingA1, role: 'editor' }])
  })

  /**
   * `withUser` sets `app.org_id` and `app.wedding_id` to the empty string on purpose, so
   * a membership lookup cannot double as a tenant read. Without that, the one query that
   * necessarily runs before authorization would be the one query with no tenant scope.
   */
  it('cannot read tenant tables, only memberships', async () => {
    const rows = await asPrincipal(
      h,
      { userId: F.staffA },
      'select count(*)::int as n from weddings',
    )
    expect(Number((rows[0] as { n: number }).n)).toBe(0)
  })

  it('returns nothing at all for a user with no memberships', async () => {
    const m = await resolveMemberships(h.db, '00000000-0000-0000-0000-000000000000')
    expect(m.orgs).toEqual([])
    expect(m.weddings).toEqual([])
  })
})

describe('listWeddings', () => {
  let staffA: Memberships
  let staffB: Memberships
  let coupleA1: Memberships
  let member: Memberships

  beforeAll(async () => {
    staffA = await resolveMemberships(h.db, F.staffA)
    staffB = await resolveMemberships(h.db, F.staffB)
    coupleA1 = await resolveMemberships(h.db, F.coupleA1)
    member = await resolveMemberships(h.db, MEMBER)
  })

  it('gives an owner every wedding in their org, and none from the other', async () => {
    const rows = await listWeddings(h.db, staffA, F.orgA)
    expect(namesOf(rows)).toEqual(['A One', 'A Two'])
  })

  it('orders by wedding date', async () => {
    const rows = await listWeddings(h.db, staffA, F.orgA)
    expect(rows.map((r) => r.weddingDate)).toEqual(['2027-07-31', '2027-08-14'])
  })

  /**
   * The cross-ORG leak. `staffA` asking for org B is not a query that returns nothing
   * because the policy filtered it -- it never reaches the database at all, because
   * `principalForOrg` finds no membership row and refuses to build a principal.
   */
  it('gives an owner nothing from an org they are not staff at', async () => {
    expect(await listWeddings(h.db, staffA, F.orgB)).toEqual([])
    expect(await listWeddings(h.db, staffB, F.orgA)).toEqual([])
  })

  /**
   * The cross-WEDDING case: the couple's `app.org_id` is the PLANNER's org, identical to
   * what staffA sets, so nothing about the org GUC distinguishes the two.
   *
   * Be precise about what this proves, though. Three things independently keep A Two out
   * of this list -- the loop over `m.weddings`, the `eq(weddings.id, ...)` clause, and
   * the pinned `app.wedding_id` -- and removing the middle one was tried: all 14
   * assertions here still passed. So this is an assertion about the REPOSITORY, not about
   * the policy. That the pin is what saves you when the application is wrong is
   * isolation.test.ts's `coupleA1Unpinned` case, which sets the GUCs by hand precisely
   * because no correct caller can produce that shape.
   */
  it('gives a couple their own wedding and not the other one in the same org', async () => {
    const rows = await listWeddings(h.db, coupleA1, F.orgA)
    expect(namesOf(rows)).toEqual(['A One'])
  })

  /** Same property for an assigned staff member, whose reads take the per-wedding path. */
  it('gives a member only the weddings they are assigned to', async () => {
    const rows = await listWeddings(h.db, member, F.orgA)
    expect(namesOf(rows)).toEqual(['A One'])
  })

  it('gives a couple nothing when asked for an org they have no wedding in', async () => {
    expect(await listWeddings(h.db, coupleA1, F.orgB)).toEqual([])
  })
})

describe('getOrg', () => {
  it('reads the organisation for org-wide staff', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect(await getOrg(h.db, m, F.orgA)).toEqual({
      id: F.orgA,
      name: 'Studio A',
      slug: 'org-a',
    })
  })

  /**
   * A couple has no org-wide standing, so the org row is not theirs to read -- the name
   * of the planning agency is not part of the couple's own record. When the couple portal
   * arrives it will need its own, narrower answer to "whose tool is this", and returning
   * null here is what forces that decision to be made rather than inherited.
   */
  it('returns null for a couple', async () => {
    const m = await resolveMemberships(h.db, F.coupleA1)
    expect(await getOrg(h.db, m, F.orgA)).toBeNull()
  })

  it('returns null for an org the user is not staff at', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect(await getOrg(h.db, m, F.orgB)).toBeNull()
  })
})
