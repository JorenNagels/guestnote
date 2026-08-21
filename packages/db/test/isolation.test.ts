import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  SELF_SCOPED_TABLES,
  TENANT_SCOPED_TABLES,
  USER_SCOPED_TABLES,
} from '../src/schema/index.ts'
import { AS, asNobody, asPrincipal, connect, countOf, F, type Harness, reseed } from './harness.ts'

/**
 * The gate. research/05-architecture.md section 4: "~50 lines, runs in CI, and it is
 * the highest-value test in the repo."
 *
 * If this file fails, nothing else matters: the product's entire pitch is holding
 * other people's clients' data, and Guestnote is the GDPR *processor* for it.
 */

let h: Harness

beforeAll(async () => {
  h = connect()
  await reseed()
})
afterAll(async () => {
  await h?.end()
})

const ALL_RLS_TABLES = [
  ...TENANT_SCOPED_TABLES,
  ...SELF_SCOPED_TABLES,
  ...USER_SCOPED_TABLES,
] as const

const n = (rows: Record<string, unknown>[]) => Number((rows[0] as { n: number }).n)

describe('1. fails closed', () => {
  /**
   * The assertion everything else rests on. If a query with no GUCs returns rows then
   * RLS is not actually on, and every other assertion here is passing for the wrong
   * reason -- they would all pass against a database with no policies at all, simply
   * because the fixtures happen to line up.
   */
  it.each(ALL_RLS_TABLES)('%s returns nothing when no GUCs are set', async (table) => {
    expect(n(await asNobody(h, `select count(*)::int as n from "${table}"`))).toBe(0)
  })

  it('a tenant id matching nothing sees nothing, and does not error', async () => {
    // Survives the ::uuid cast and returns empty rather than throwing -- which is why
    // every policy reads its GUC through nullif(..., '').
    const nowhere = '00000000-0000-0000-0000-000000000000'
    expect(await countOf(h, { ...AS.staffA, orgId: nowhere }, 'weddings')).toBe(0)
  })

  /**
   * Pinning down what RLS does NOT do, because assuming otherwise is the mistake.
   *
   * Setting app.org_id to another organisation's id scopes the session TO that
   * organisation. It is not rejected, because at the SQL layer there is nothing to
   * reject: the policy's job is to scope data, and it cannot know whether the value it
   * was handed was legitimately derived.
   *
   * research/07-auth-and-tenancy.md section 3 states this outright -- "app.org_id is a
   * data-scoping mechanism, never a permission. Never infer 'is a member of this org'
   * from the GUC" -- and this test exists so nobody re-derives the opposite from the
   * fact that a big isolation suite passes. The guarantee comes from withTenant only
   * ever receiving a Principal resolved from org_members / wedding_members against the
   * wedding id in the URL. RLS is the second lock, not the first.
   */
  it('a forged org_id scopes to that org: RLS is data scoping, not authorisation', async () => {
    expect(await countOf(h, { ...AS.staffA, orgId: F.orgB }, 'weddings')).toBe(1)
  })

  it('...but a forged org_id cannot help a principal whose wedding pin disagrees', async () => {
    // The two clauses must both hold. This is why app.wedding_id being MANDATORY for a
    // principal with no org_members row is the load-bearing rule: it is what stops a
    // forged or stale org_id from being useful.
    expect(await countOf(h, { ...AS.coupleA1, orgId: F.orgB }, 'weddings')).toBe(0)
  })
})

describe('2. cross-organisation isolation', () => {
  it.each(TENANT_SCOPED_TABLES)('%s: org A sees none of org B', async (table) => {
    const leaked = n(
      await asPrincipal(
        h,
        AS.staffA,
        `select count(*)::int as n from "${table}" where org_id = $1`,
        [F.orgB],
      ),
    )
    expect(leaked, `${table} leaked rows belonging to org B`).toBe(0)

    // Guard against a vacuous pass: an empty table isolates perfectly. The fixture
    // must actually have put rows here, or this assertion proves nothing.
    const visible = await countOf(h, AS.staffA, table)
    expect(visible, `${table} fixture is empty, so the assertion above is vacuous`).toBeGreaterThan(
      0,
    )
  })

  it('org A and org B see disjoint, non-empty wedding sets', async () => {
    expect(await countOf(h, AS.staffA, 'weddings')).toBe(2)
    expect(await countOf(h, AS.staffB, 'weddings')).toBe(1)
  })

  it('a couple cannot reach another org even with that org id in their GUCs', async () => {
    // Because app.org_id is data scoping and NOT a permission, forging it is not a
    // privilege escalation -- but it must also not become one. The couple's
    // wedding_id pins them, so the two clauses disagree and nothing matches.
    expect(await countOf(h, { ...AS.coupleA1, orgId: F.orgB }, 'tasks')).toBe(0)
  })
})

describe('6. the visibility dimension (app.wedding_role)', () => {
  /**
   * The clause research/05-architecture.md section 4 originally lacked. A couple's
   * session sets app.org_id to the PLANNER's org -- it has no choice, or every row is
   * rejected -- so the couple's GUCs and the planner's are identical, and the tenant
   * clauses cannot tell them apart. Without app.wedding_role, `visibility = 'internal'`
   * has no backstop at all.
   */
  it('a couple sees shared tasks and never internal ones', async () => {
    const rows = await asPrincipal(
      h,
      AS.coupleA1,
      'select title, visibility from tasks order by title',
    )
    expect(rows.map((r) => r.visibility)).toEqual(['shared'])
    expect(rows.map((r) => r.title)).toEqual(['Book the DJ'])
  })

  it('staff on the same wedding see both', async () => {
    const rows = await asPrincipal(h, AS.staffAOnA1, 'select visibility from tasks order by title')
    expect(rows.map((r) => r.visibility).sort()).toEqual(['internal', 'shared'])
  })

  it('comments on an internal task are invisible to the couple', async () => {
    // Without the denormalised visibility column this is the wider leak: the task
    // title stays hidden while its entire discussion thread does not.
    expect(await countOf(h, AS.coupleA1, 'task_comments')).toBe(1)
    expect(await countOf(h, AS.staffAOnA1, 'task_comments')).toBe(2)
  })

  it('an unset wedding_role sees shared rows only, failing in the safe direction', async () => {
    expect(await countOf(h, { ...AS.coupleA1, weddingRole: '' }, 'tasks')).toBe(1)
  })

  it('an unrecognised wedding_role gets no internal rows', async () => {
    expect(await countOf(h, { ...AS.coupleA1, weddingRole: 'vendor' }, 'tasks')).toBe(1)
  })
})

describe('7. the membership axis (app.user_id)', () => {
  it("a user resolves their own memberships and nobody else's", async () => {
    expect(
      n(
        await asPrincipal(
          h,
          { userId: F.coupleA1 },
          'select count(*)::int as n from wedding_members',
        ),
      ),
    ).toBe(1)

    const others = n(
      await asPrincipal(
        h,
        { userId: F.coupleA1 },
        'select count(*)::int as n from org_members where user_id = $1',
        [F.staffA],
      ),
    )
    expect(others, "a session resolved another user's org memberships").toBe(0)
  })

  it('the couple has no org_members row -- the whole design in one assertion', async () => {
    // research/07-auth-and-tenancy.md section 4b: "Accepting a wedding invite writes a
    // wedding_members row and no org_members row. That one rule is the whole design."
    expect(
      n(await asPrincipal(h, { userId: F.coupleA1 }, 'select count(*)::int as n from org_members')),
    ).toBe(0)
  })

  it('memberships are invisible without app.user_id', async () => {
    expect(n(await asPrincipal(h, {}, 'select count(*)::int as n from wedding_members'))).toBe(0)
  })

  /**
   * Migration 0005's `org_read_for_members`, tested WITHOUT the repository in the way.
   *
   * These query `organizations` directly, because `listOrgsForUser` inner-joins
   * `org_members` and would produce the right answer even if the policy were wrong. So
   * this block is the only thing holding the policy up, and describe 8 below is the only
   * thing holding its guard up.
   *
   * **Be precise about which mutation each case kills**, because an earlier version of
   * this comment was not. Measured 2026-08-20, local container:
   *
   *   drop `org_members.org_id = organizations.id`  -> staffA reads ['org-a','org-b'].
   *                                                    CAUGHT here, and only here.
   *   drop `org_members.user_id = app.user_id`      -> nothing changes, anywhere. The
   *                                                    subquery reads org_members, and
   *                                                    Postgres applies THAT table's
   *                                                    own_memberships policy inside it,
   *                                                    so app.user_id is already
   *                                                    filtering one level down. Nothing
   *                                                    discriminates that clause and
   *                                                    nothing can: it is redundant by
   *                                                    construction, not undertested.
   */
  it('a user reads the organisations they belong to, and no others', async () => {
    const rows = await asPrincipal(
      h,
      { userId: F.staffA },
      'select slug from organizations order by slug',
    )
    expect(rows.map((r) => r.slug)).toEqual(['org-a'])
  })

  /** The same, as an actual `member` -- the role 0005 exists for, not an owner. */
  it('a member reads their own org name, which no org-wide principal can give them', async () => {
    const rows = await asPrincipal(
      h,
      { userId: F.memberA },
      'select slug from organizations order by slug',
    )
    expect(rows.map((r) => r.slug)).toEqual(['org-a'])
  })

  it('a couple reads no organisation at all, holding no org_members row', async () => {
    expect(
      n(
        await asPrincipal(
          h,
          { userId: F.coupleA1 },
          'select count(*)::int as n from organizations',
        ),
      ),
    ).toBe(0)
  })

  /**
   * The EMPTY-STRING path, which is a different branch from the NULL one section 1 covers
   * and is the one `withUser` actually produces -- it sets every unused GUC to `''`
   * explicitly, so a transaction cannot inherit a value it did not ask for.
   *
   * This is what `nullif(current_setting(...), '')` is for. Without the nullif, `''`
   * reaches the `::uuid` cast and the query raises `invalid input syntax for type uuid`
   * instead of returning nothing -- measured 2026-08-20. Section 1's `asNobody` cases
   * cannot reach this branch: they set no GUC at all, so `current_setting` returns NULL.
   */
  it('an empty-string user id reads nothing, and does not error', async () => {
    expect(n(await asPrincipal(h, {}, 'select count(*)::int as n from organizations'))).toBe(0)
  })

  /**
   * The policy is FOR SELECT, and this is the assertion that says so. Under `app.user_id`
   * alone, `tenant_isolation`'s USING cannot match either -- `app.org_id` is unset -- so
   * nothing grants this write and no row is touched. Widen 0005 to FOR ALL and this fails.
   *
   * `reseed()` afterwards is not optional: if the mutation this test exists to catch ever
   * goes live, the UPDATE succeeds and org A is renamed for every later read in the file.
   * Following the one other test here that writes successfully.
   */
  it('reading an organisation is not a licence to write it', async () => {
    const updated = await asPrincipal(
      h,
      { userId: F.staffA },
      "update organizations set name = 'Renamed By A Member' returning id",
    )
    expect(updated, 'a membership row permitted a write to the organisation').toEqual([])
    await reseed()
  })
})

/**
 * The composed OR -- the shape that actually went wrong.
 *
 * `organizations` is the first table here to carry two permissive policies, and Postgres
 * ORs them. `withTenant` sets `app.user_id` as well as `app.org_id` (src/tenant.ts), so a
 * policy keyed on the user axis is live inside every tenant transaction unless something
 * stops it -- and 0005 as first written had nothing that did. The effective predicate
 * became `id = app.org_id OR you are a member of it`, and `getOrg`, which carried no `id`
 * clause of its own because tenant_isolation had always been the filter, began returning
 * one row per organisation the user belonged to.
 *
 * It survived to a review because no fixture user held two `org_members` rows. `F.staffDual`
 * exists so that cannot be the reason twice: admin of org A, owner of org C, which is the
 * minimum shape that can observe an OR at all.
 *
 * A separate describe from section 7 because that section is about the user axis on its
 * own, and this is specifically about the two axes composing.
 */
describe('8. two policies on one table (app.org_id OR app.user_id)', () => {
  /**
   * The regression assertion. Delete the `app.org_id is null` guard from 0005 and this
   * returns both orgs -- measured 2026-08-20, before the guard existed, with `rows[0]`
   * being the wrong organisation entirely rather than merely an extra one.
   */
  it('a tenant transaction sees only its own org, even for a user in several', async () => {
    const rows = await asPrincipal(h, AS.staffDualOnC, 'select slug from organizations')
    expect(
      rows.map((r) => r.slug),
      'the member-read policy leaked into a tenant-scoped read',
    ).toEqual(['org-c'])
  })

  /**
   * Guard against a vacuous pass: the assertion above proves nothing unless this user
   * really does belong to more than one organisation. Under `withUser`'s shape -- no
   * `app.org_id` -- they must see both, in name order.
   */
  it('...and the same user sees both of their orgs when no tenant is pinned', async () => {
    const rows = await asPrincipal(
      h,
      { userId: F.staffDual },
      'select slug from organizations order by name',
    )
    expect(rows.map((r) => r.slug)).toEqual(['org-c', 'org-a'])
  })

  /**
   * A forged `app.org_id` still scopes to exactly that org, and to nothing the user
   * happens to be a member of elsewhere.
   *
   * Note what this does NOT claim. Pinning to org B and getting org B back is correct and
   * is section 1's `a forged org_id scopes to that org` case: `app.org_id` is a
   * data-scoping mechanism and never a permission, so at the SQL layer there is nothing
   * to reject -- the guarantee is that `principalForOrg` never builds such a principal.
   *
   * What is new here, and what the OR could have broken, is the SECOND half: this user is
   * staff at org A and org C, and neither may appear beside org B. Written as an exact
   * `toEqual` rather than a `not.toContain`, so it also fails if the answer becomes empty.
   */
  it('a forged org_id admits that org and none of the user own memberships', async () => {
    const pinned = await asPrincipal(
      h,
      { ...AS.staffDualOnC, orgId: F.orgB },
      'select slug from organizations order by slug',
    )
    expect(
      pinned.map((r) => r.slug),
      'the member-read policy added the user own orgs to a forged tenant read',
    ).toEqual(['org-b'])
  })
})

describe('the trap: a principal without app.wedding_id', () => {
  /**
   * research/07-auth-and-tenancy.md section 3 calls this "the highest-risk path in the
   * model".
   *
   * This test does NOT assert the leak is prevented. At the SQL layer it cannot be:
   * org-wide staff legitimately need exactly these GUCs, so the policy has no way to
   * distinguish "owner, deliberately unpinned" from "couple, accidentally unpinned".
   *
   * It asserts the leak is REAL, which is what makes withTenant's guard load-bearing
   * rather than defensive decoration. If this ever starts finding zero rows, the guard
   * has become untestable and somebody should understand why before trusting it.
   */
  it('demonstrably reads the whole organisation, which is why the guard exists', async () => {
    // Both of org A's weddings, including the one this couple has no membership in.
    expect(await countOf(h, AS.coupleA1Unpinned, 'weddings')).toBe(2)
  })

  /**
   * A better outcome than expected, and worth pinning so it is not lost.
   *
   * Org A holds three tasks. An unpinned couple reads TWO of them, not three: the
   * `app.wedding_role` clause still excludes the internal one even though the wedding
   * clause has fallen through to org-wide.
   *
   * So the third GUC is not only the fix for the visibility gap -- it also limits the
   * blast radius of a missing wedding pin. The two mechanisms are genuinely
   * independent, which is what defence in depth is supposed to mean. It does NOT make
   * the guard optional: leaking a sibling couple's task list is still a breach.
   */
  it('but the visibility clause still holds, limiting the blast radius', async () => {
    expect(await countOf(h, AS.coupleA1Unpinned, 'tasks')).toBe(2)
    expect(await countOf(h, { ...AS.coupleA1Unpinned, weddingRole: 'owner' }, 'tasks')).toBe(3)
  })

  it('correctly pinned, the same couple sees one wedding and one task', async () => {
    expect(await countOf(h, AS.coupleA1, 'weddings')).toBe(1)
    expect(await countOf(h, AS.coupleA1, 'tasks')).toBe(1)
  })
})

describe('nullable wedding_id: couples never see org-level rows', () => {
  /**
   * `invitations` and `audit_log` carry a nullable wedding_id. For an org-level row the
   * comparison `wedding_id = app.wedding_id` yields NULL, so the row is filtered. A
   * couple therefore cannot see staff invitations or org-level audit entries, and it
   * falls out of the policy rather than needing a special case -- but only because the
   * column is NULL rather than a sentinel value, so it is worth pinning down.
   */
  it('a couple sees only their own wedding-scoped invitation', async () => {
    const rows = await asPrincipal(h, AS.coupleA1, 'select email, role from invitations')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.role).toBe('couple')
  })

  it('staff see both the staff invite and the wedding invite', async () => {
    expect(await countOf(h, AS.staffA, 'invitations')).toBe(2)
  })

  it('a couple sees no org-level audit rows', async () => {
    const rows = await asPrincipal(h, AS.coupleA1, 'select action from audit_log')
    expect(rows.map((r) => r.action)).toEqual(['wedding.created'])
  })
})

describe('write-side isolation', () => {
  /**
   * A policy with USING but no WITH CHECK scopes reads and leaves writes wide open,
   * which is a quieter breach than reading and much harder to notice: rows appear in
   * another tenant's data with no error anywhere.
   *
   * This block was absent from an earlier revision of this file and the suite was green
   * regardless -- which is the whole argument for deliberately weakening the policy and
   * watching for red. Weakening `WITH CHECK` to `true` makes the three INSERT cases
   * below fail, as it should.
   *
   * The two UPDATE cases survive that particular sabotage, and the reason is worth
   * recording rather than guessing at. **For a `FOR ALL` policy, PostgreSQL applies the
   * USING expression to the NEW row on UPDATE, not only to the existing one.** Verified
   * directly against Postgres 17: with `using (true) with check (true)` the visibility
   * flip succeeds; with the visibility clause back in USING alone it is rejected, even
   * though WITH CHECK is `true` and with the propagate trigger disabled.
   *
   * So the INSERTs test WITH CHECK and the UPDATEs test USING-against-the-new-row. Both
   * matter; they are simply not the same mechanism, and a comment claiming otherwise
   * would send the next reader hunting in the wrong place.
   */
  it('a couple cannot write a task into a sibling wedding in the same org', async () => {
    await expect(
      asPrincipal(
        h,
        AS.coupleA1,
        `insert into tasks (id, org_id, wedding_id, title)
           values (gen_random_uuid(), $1, $2, 'smuggled')`,
        [F.orgA, F.weddingA2],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a couple cannot write a task into another organisation', async () => {
    await expect(
      asPrincipal(
        h,
        AS.coupleA1,
        `insert into tasks (id, org_id, wedding_id, title)
           values (gen_random_uuid(), $1, $2, 'cross-org')`,
        [F.orgB, F.weddingB1],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a couple cannot create an internal task, so cannot hide one from the planner', async () => {
    await expect(
      asPrincipal(
        h,
        AS.coupleA1,
        `insert into tasks (id, org_id, wedding_id, title, visibility)
           values (gen_random_uuid(), $1, $2, 'sneaky', 'internal')`,
        [F.orgA, F.weddingA1],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a couple cannot flip an existing shared task to internal', async () => {
    await expect(
      asPrincipal(h, AS.coupleA1, `update tasks set visibility = 'internal' where id = $1`, [
        F.taskA1Shared,
      ]),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a couple cannot move their own task into another wedding', async () => {
    await expect(
      asPrincipal(h, AS.coupleA1, `update tasks set wedding_id = $1 where id = $2`, [
        F.weddingA2,
        F.taskA1Shared,
      ]),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a couple CAN write an ordinary shared task to their own wedding', async () => {
    // The mirror image, and it matters: a WITH CHECK that rejected everything would
    // pass every test above while making the product unusable.
    const rows = await asPrincipal(
      h,
      AS.coupleA1,
      `insert into tasks (id, org_id, wedding_id, title)
         values (gen_random_uuid(), $1, $2, 'legitimate') returning id`,
      [F.orgA, F.weddingA1],
    )
    expect(rows).toHaveLength(1)
    await reseed()
  })
})
