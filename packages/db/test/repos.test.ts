import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getWedding,
  listOrgsForUser,
  listWeddings,
  type Memberships,
  resolveMemberships,
} from '../src/repos/index.ts'
import { asPrincipal, connect, F, type Harness, reseed, seedExec } from './harness.ts'

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
 * `F.memberA` -- a staff member of org A assigned to wedding A1.
 *
 * This was a LOCAL fixture until 2026-08-20, inserted here after `reseed()` through
 * `app_user` with only `app.user_id` set, which demonstrated that adding yourself to an
 * org is expressible inside the policies. It moved to `harness.ts` for two reasons worth
 * recording, because the demonstration was genuinely worth something and was given up:
 *
 *   * `isolation.test.ts` needs to read `organizations` as an actual `member`, and a
 *     fixture private to this file left that policy asserted only through an owner.
 *   * A local INSERT after `reseed()` throws inside `beforeAll` the moment it collides
 *     with anything `reseed()` starts writing -- and vitest reports a throwing
 *     `beforeAll` as the whole file SKIPPED, which is the "47 passed / 48 skipped and
 *     zero failures" failure mode `harness.ts` documents at length.
 */
const MEMBER = F.memberA

beforeAll(async () => {
  h = connect()
  await reseed()
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
   * the pinned `app.wedding_id` -- and removing the middle one was tried: every assertion
   * in this file still passed, measured when there were 14 of them and this file has
   * since grown. So this is an assertion about the REPOSITORY, not about
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

/**
 * Verified by mutation, not assumed -- measured 2026-08-21 on the local container.
 *
 * The masking here runs BOTH ways, and the docstring on `listOrgsForUser` states only one
 * direction. It says no assertion in this file can prove the POLICY, because the join
 * answers correctly when the policy is broken. The converse also holds: nothing anywhere
 * can prove the JOIN, because the policy answers correctly when the join is broken.
 * `innerJoin` -> `leftJoin`, dropping the join's `user_id` predicate, and deleting the
 * join outright each left all 142 db assertions green. Under `withUser`,
 * `org_read_for_members` has already narrowed `organizations` to the user's own orgs and
 * `own_memberships` has already narrowed `org_members` to `app.user_id`, so all three
 * return the identical set.
 *
 * Defence in depth where each half completely masks the other. That is a legitimate
 * design and not a coverage gap -- but it means the join is intent and never boundary,
 * which is what the docstring claims and is now measured rather than argued.
 *
 * What these cases DO discriminate: the select list (adding `plan` fails two of them, and
 * that mutation typechecks, so it is plausible code) and the ordering (asc -> desc on name
 * fails one). Those two are the real assertions in this block.
 */
describe('listOrgsForUser', () => {
  /**
   * The assertion migration 0005 exists for -- but say which direction of mutation it
   * kills, because the two are not symmetric. NARROW the policy (or delete it) and this
   * goes red. WIDEN it and this stays green, because the inner join in `listOrgsForUser`
   * re-filters the rows the policy let through. That asymmetry is the whole reason
   * `isolation.test.ts` sections 7 and 8 exist; measured 2026-08-20.
   *
   * `toEqual` on the whole object, not a field: this is the assertion that refuses a
   * widened select list, and so it is what holds "a member reads the name and never the
   * billing" up. Add `plan` to the projection and it goes red.
   */
  it('names the organisation for a member, which no org-wide read can', async () => {
    expect(await listOrgsForUser(h.db, MEMBER)).toEqual([
      { id: F.orgA, name: 'Studio A', slug: 'org-a' },
    ])
  })

  /**
   * A user in TWO orgs gets both, ordered by name.
   *
   * This is the switcher's entire reason for existing and, until 2026-08-20, nothing
   * asserted it -- every other case here returns a single-element array, so `.orderBy()`
   * could be deleted wholesale and stay green.
   *
   * The fixture has to disagree with itself for this to mean anything: `Atelier Zero`
   * (org-c) sorts FIRST by name but LAST by id and is inserted LAST, so `['org-c','org-a']`
   * is reachable only by really ordering on name. With just Studio A and Studio B, name
   * order, id order and heap order coincide and the assertion would be theatre.
   */
  it('gives a user in two orgs both of them, in name order', async () => {
    const rows = await listOrgsForUser(h.db, F.staffDual)
    expect(rows.map((r) => r.slug)).toEqual(['org-c', 'org-a'])
  })

  /**
   * Replaces a `.not.toContain('org-b')` that could not fail: it passed on `[]` just as
   * happily as on the right answer, and the inner join excludes org-b before the policy
   * is even consulted. An exact `toEqual` proves the rows exist AND that the wrong one is
   * absent, which is the repo's own rule about isolation assertions that never assert
   * presence.
   */
  it('names no organisation the member does not belong to', async () => {
    const rows = await listOrgsForUser(h.db, MEMBER)
    expect(rows.map((r) => r.slug)).toEqual(['org-a'])
  })

  it('works for an owner too, so head and switcher need only one query', async () => {
    expect(await listOrgsForUser(h.db, F.staffA)).toEqual([
      { id: F.orgA, name: 'Studio A', slug: 'org-a' },
    ])
  })

  /**
   * The soft-delete filter, which lives in the repository and deliberately not in the
   * policy -- soft delete is not a tenancy concern. Nothing covered it until 2026-08-20;
   * `reseed()` never writes a `deleted_at`, so the clause could be deleted silently.
   *
   * Written through the SEED pool because `app_user` cannot soft-delete an organisation:
   * 0005 is FOR SELECT and `tenant_isolation` needs `app.org_id`, which is the property
   * asserted in isolation.test.ts. `reseed()` at the end puts the row back.
   */
  it('omits a soft-deleted organisation', async () => {
    await seedExec(`update organizations set deleted_at = now() where id = $1`, [F.orgC])
    try {
      expect((await listOrgsForUser(h.db, F.staffDual)).map((r) => r.slug)).toEqual(['org-a'])
    } finally {
      await reseed()
    }
  })

  /**
   * A couple holds a `wedding_members` row and no `org_members` row, which is the whole
   * design. So they get nothing here -- the policy keys on `org_members` alone, and a
   * wedding assignment is deliberately not a licence to name the planning agency.
   */
  it('returns nothing for a couple, who has no org_members row', async () => {
    expect(await listOrgsForUser(h.db, F.coupleA1)).toEqual([])
  })

  it('returns nothing for a user with no memberships at all', async () => {
    expect(await listOrgsForUser(h.db, '00000000-0000-0000-0000-000000000000')).toEqual([])
  })
})

describe('getWedding', () => {
  /**
   * The owner path, and the reason this function is not `listWeddings().find()`. An owner
   * reads one wedding through their ORG-WIDE principal with an `eq` in the query, because
   * `principalForWedding` returns null for them on purpose -- `assertScoped` refuses an
   * `orgStaff` principal carrying a weddingId. Route the owner through the per-wedding
   * path and this test 404s the person who owns the business.
   */
  it('resolves a wedding for an owner, via the org-wide principal', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    const w = await getWedding(h.db, m, F.orgA, F.weddingA1)
    expect(w?.coupleDisplayName).toBe('A One')
  })

  it('resolves the other wedding in the org for an owner too', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect((await getWedding(h.db, m, F.orgA, F.weddingA2))?.coupleDisplayName).toBe('A Two')
  })

  /** The member path: `assignedStaff`, which pins `app.wedding_id`. */
  it('resolves an assigned wedding for a member', async () => {
    const m = await resolveMemberships(h.db, MEMBER)
    expect((await getWedding(h.db, m, F.orgA, F.weddingA1))?.coupleDisplayName).toBe('A One')
  })

  /**
   * Same org, same `app.org_id`, different wedding -- the cross-WEDDING case a
   * single-wedding fixture cannot detect. `null` here becomes a 404 and not a 403: section
   * 3's table ends "neither -> 404 (not 403 -- don't confirm the wedding exists)".
   */
  it('returns null for a wedding in their org that the member is not assigned to', async () => {
    const m = await resolveMemberships(h.db, MEMBER)
    expect(await getWedding(h.db, m, F.orgA, F.weddingA2)).toBeNull()
  })

  /**
   * The cross-ORG case, refused before any SQL runs -- `principalForOrg` finds no
   * membership for org B. A repository assertion, not a policy one, and it is already
   * covered offline in `src/repos/memberships.test.ts`.
   */
  it('returns null for a wedding in another org', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect(await getWedding(h.db, m, F.orgB, F.weddingB1)).toBeNull()
  })

  /**
   * The URL-tampering shape, and the ONLY `getWedding` case where RLS rather than the
   * repository is what refuses: the planner's own org, someone else's wedding id. A
   * principal is built (they really are owner of org A), the query really runs, and
   * `weddings.tenant_isolation`'s `org_id = app.org_id` is the only thing between the
   * caller and B One. Weaken that clause and this is the assertion that goes red --
   * nothing else in this file would notice.
   */
  it('returns null for a foreign wedding id inside the caller own org', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect(await getWedding(h.db, m, F.orgA, F.weddingB1)).toBeNull()
  })

  /** The soft-delete filter, uncovered until 2026-08-20. Seed pool writes, reseed restores. */
  it('returns null for a soft-deleted wedding', async () => {
    await seedExec(`update weddings set deleted_at = now() where id = $1`, [F.weddingA2])
    try {
      const m = await resolveMemberships(h.db, F.staffA)
      expect(await getWedding(h.db, m, F.orgA, F.weddingA2)).toBeNull()
    } finally {
      await reseed()
    }
  })

  it('returns null for a wedding that does not exist, indistinguishably', async () => {
    const m = await resolveMemberships(h.db, F.staffA)
    expect(await getWedding(h.db, m, F.orgA, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('gives a couple their own wedding and not the other one', async () => {
    const m = await resolveMemberships(h.db, F.coupleA1)
    expect((await getWedding(h.db, m, F.orgA, F.weddingA1))?.coupleDisplayName).toBe('A One')
    expect(await getWedding(h.db, m, F.orgA, F.weddingA2)).toBeNull()
  })
})
