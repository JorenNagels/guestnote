import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createVendorLink,
  getVendorLinkView,
  type Memberships,
  resolveMemberships,
  resolveVendorLinkByHash,
  revokeVendorLink,
} from '../src/repos/index.ts'
import {
  asNobody,
  asPrincipal,
  connect,
  F,
  type Harness,
  NOT_FOUND,
  reseed,
  seedExec,
} from './harness.ts'

/**
 * Migration 0008's `resolve_vendor_link`, and `vendor-links.ts`'s three doors onto it (spec
 * 0003, S10). `planner-isolation.test.ts` is where the `link_read` RLS policies stand alone,
 * scoped by hand-set GUCs -- this file is what only the repo and the SQL function can say:
 * status transitions, the parent-read guard on create, and the plain-data mapping.
 *
 * A fresh `reseed()` before every test: several of these write (`createVendorLink` revokes
 * and inserts), and file order must not matter.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let otherOrgOwner: Memberships

beforeAll(async () => {
  h = connect()
})
afterAll(async () => {
  await h.end()
})
beforeEach(async () => {
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
  otherOrgOwner = await resolveMemberships(h.db, F.staffB)
})

const resolveRaw = (tokenHash: string) =>
  asNobody(h, 'select * from resolve_vendor_link($1)', [tokenHash])

const liveLinkCount = (weddingVendorId: string) =>
  asPrincipal(
    h,
    { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' },
    `select count(*)::int as n from vendor_links
       where wedding_vendor_id = $1 and revoked_at is null`,
    [weddingVendorId],
  ).then((rows) => Number((rows[0] as { n: number }).n))

describe('resolve_vendor_link', () => {
  it('describes a live link, including the org name (for "shared with you by")', async () => {
    // F.linkA1 (harness.ts fixture) already points at F.wedVendorA1 with hash 'hash-link-a1'.
    const [row] = await resolveRaw('hash-link-a1')
    expect(row).toMatchObject({
      org_id: F.orgA,
      org_name: 'Studio A',
      wedding_id: F.weddingA1,
      wedding_vendor_id: F.wedVendorA1,
      vendor_name: 'Traiteur A',
      status: 'live',
    })
  })

  it('reports expired from the database clock, ahead of revoked', async () => {
    await seedExec(`update vendor_links set expires_at = now() - interval '1 day'
                       where token_hash = 'hash-link-a1'`)
    expect((await resolveRaw('hash-link-a1'))[0]?.status).toBe('expired')
  })

  it('reports revoked, and revoked beats an expiry still in the future', async () => {
    await seedExec(`update vendor_links set revoked_at = now() where token_hash = 'hash-link-a1'`)
    expect((await resolveRaw('hash-link-a1'))[0]?.status).toBe('revoked')
  })

  it('returns no row for an unknown token hash', async () => {
    expect(await resolveRaw('no-such-hash')).toEqual([])
  })

  it('folds a vendor removed from the wedding into "no row", with no separate revoke', async () => {
    await seedExec(`update wedding_vendors set deleted_at = now() where id = $1`, [F.wedVendorA1])
    expect(await resolveRaw('hash-link-a1')).toEqual([])
  })

  it('returns no row once the wedding has been soft-deleted', async () => {
    await seedExec(`update weddings set deleted_at = now() where id = $1`, [F.weddingA1])
    expect(await resolveRaw('hash-link-a1')).toEqual([])
  })

  it('returns no row once the organisation has been soft-deleted', async () => {
    await seedExec(`update organizations set deleted_at = now() where id = $1`, [F.orgA])
    expect(await resolveRaw('hash-link-a1')).toEqual([])
  })

  it('is the ONLY way to reach the row: the app role reads no vendor_links with no principal', async () => {
    expect((await asNobody(h, 'select count(*)::int as n from vendor_links'))[0]).toMatchObject({
      n: 0,
    })
    expect(await resolveRaw('hash-link-a1')).toHaveLength(1)
  })

  it('is SECURITY DEFINER with a pinned search_path, and not executable by PUBLIC', async () => {
    const [row] = await asNobody(
      h,
      `select prosecdef, array_to_string(proconfig, ',') as config, proacl::text as acl,
              has_function_privilege('app_user', p.oid, 'execute') as app_can
         from pg_proc p where proname = 'resolve_vendor_link'`,
    )
    const c = row as {
      prosecdef: boolean
      config: string | null
      acl: string | null
      app_can: boolean
    }
    expect(c.prosecdef, 'not SECURITY DEFINER').toBe(true)
    expect(c.config, 'search_path is not pinned').toContain('search_path=""')
    expect(c.acl ?? '', 'PUBLIC can execute this').not.toMatch(/(^\{|,)=X\//)
    expect(c.app_can, 'app_user cannot execute this').toBe(true)
  })
})

describe('createVendorLink', () => {
  it('owner creates a link, and it resolves live', async () => {
    const r = await createVendorLink(h.db, owner, F.orgA, F.weddingA1, F.wedVendorA1, {
      tokenHash: 'hash-new-1',
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    })
    expect(r).toMatchObject({ ok: true })
    expect((await resolveRaw('hash-new-1'))[0]?.status).toBe('live')
  })

  it('a member is refused before any write: principalForOrg returns null for member', async () => {
    const r = await createVendorLink(h.db, member, F.orgA, F.weddingA1, F.wedVendorA1, {
      tokenHash: 'hash-should-not-exist',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect(r).toEqual({ ok: false, reason: 'forbidden' })
    expect(await resolveRaw('hash-should-not-exist')).toEqual([])
  })

  it("the parent read refuses another org's wedding_vendors row, even though the FK alone would accept it", async () => {
    // staffB has no org_members row in org A, so principalForOrg(member, F.orgA) is already
    // null for THEM -- the interesting case is org A's own owner naming org B's vendor id.
    const r = await createVendorLink(h.db, owner, F.orgA, F.weddingB1, F.wedVendorB1, {
      tokenHash: 'hash-cross-org',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect(r).toEqual({ ok: false, reason: 'notFound' })
    expect(await resolveRaw('hash-cross-org')).toEqual([])
  })

  it("an owner of a different org cannot create a link for org A's vendor at all", async () => {
    const r = await createVendorLink(h.db, otherOrgOwner, F.orgA, F.weddingA1, F.wedVendorA1, {
      tokenHash: 'hash-not-my-org',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect(r).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('"create" means "replace": the prior live link for this vendor is revoked in the same transaction', async () => {
    // F.linkA1 (hash-link-a1) is already live for F.wedVendorA1 in the base fixture.
    expect(await liveLinkCount(F.wedVendorA1)).toBe(1)

    await createVendorLink(h.db, owner, F.orgA, F.weddingA1, F.wedVendorA1, {
      tokenHash: 'hash-replacement',
      expiresAt: new Date(Date.now() + 86_400_000),
    })

    expect((await resolveRaw('hash-link-a1'))[0]?.status).toBe('revoked')
    expect((await resolveRaw('hash-replacement'))[0]?.status).toBe('live')
    // Exactly one live link for this vendor at a time, never two.
    expect(await liveLinkCount(F.wedVendorA1)).toBe(1)
  })

  it("refuses a vendor row from another wedding of the same org: the route's wedding is enforced", async () => {
    // F.wedVendorA2 belongs to F.weddingA2. Same org, same owner -- only the wedding differs.
    const r = await createVendorLink(h.db, owner, F.orgA, F.weddingA1, F.wedVendorA2, {
      tokenHash: 'hash-wrong-wedding',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect(r).toEqual({ ok: false, reason: 'notFound' })
    expect(await resolveRaw('hash-wrong-wedding')).toEqual([])
    expect((await resolveRaw('hash-link-a2'))[0]?.status).toBe('live')
  })

  it('does not disturb a live link on a DIFFERENT vendor', async () => {
    await createVendorLink(h.db, owner, F.orgA, F.weddingA1, F.wedVendorA1, {
      tokenHash: 'hash-a1-again',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    // F.linkA2 (hash-link-a2) belongs to F.wedVendorA2, a different vendor.
    expect((await resolveRaw('hash-link-a2'))[0]?.status).toBe('live')
  })
})

describe('revokeVendorLink', () => {
  it('owner revokes a live link', async () => {
    const [live] = await asPrincipal(
      h,
      { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' },
      `select id from vendor_links where token_hash = 'hash-link-a1'`,
    )
    const id = (live as { id: string }).id

    expect(await revokeVendorLink(h.db, owner, F.orgA, F.weddingA1, id)).toEqual({
      ok: true,
      value: null,
    })
    expect((await resolveRaw('hash-link-a1'))[0]?.status).toBe('revoked')
  })

  it('revoking an already-revoked link returns false, not true', async () => {
    const [live] = await asPrincipal(
      h,
      { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' },
      `select id from vendor_links where token_hash = 'hash-link-a1'`,
    )
    const id = (live as { id: string }).id

    expect(await revokeVendorLink(h.db, owner, F.orgA, F.weddingA1, id)).toEqual({
      ok: true,
      value: null,
    })
    expect(await revokeVendorLink(h.db, owner, F.orgA, F.weddingA1, id)).toEqual(NOT_FOUND)
  })

  it('a member cannot revoke: refused before any write', async () => {
    const [live] = await asPrincipal(
      h,
      { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' },
      `select id from vendor_links where token_hash = 'hash-link-a1'`,
    )
    const id = (live as { id: string }).id

    expect(await revokeVendorLink(h.db, member, F.orgA, F.weddingA1, id)).toEqual(NOT_FOUND)
    expect((await resolveRaw('hash-link-a1'))[0]?.status).toBe('live')
  })

  it('cannot revoke a link of another wedding of the same org by naming it under this one', async () => {
    const [live] = await asPrincipal(
      h,
      { userId: F.staffA, orgId: F.orgA, weddingRole: 'owner' },
      `select id from vendor_links where token_hash = 'hash-link-a2'`,
    )
    const id = (live as { id: string }).id

    // hash-link-a2 is on F.weddingA2; naming it under F.weddingA1 matches nothing.
    expect(await revokeVendorLink(h.db, owner, F.orgA, F.weddingA1, id)).toEqual(NOT_FOUND)
    expect((await resolveRaw('hash-link-a2'))[0]?.status).toBe('live')
  })

  it("cannot revoke another org's link by naming its id under this org", async () => {
    const [live] = await asPrincipal(
      h,
      { userId: F.staffB, orgId: F.orgB, weddingRole: 'owner' },
      `select id from vendor_links where token_hash = 'hash-link-b1'`,
    )
    const id = (live as { id: string }).id

    expect(await revokeVendorLink(h.db, owner, F.orgA, F.weddingA1, id)).toEqual(NOT_FOUND)
    expect((await resolveRaw('hash-link-b1'))[0]?.status).toBe('live')
  })
})

describe('the repo wrappers, over the same function', () => {
  it('resolveVendorLinkByHash returns camelCase plain data, and null for a miss', async () => {
    expect(await resolveVendorLinkByHash(h.db, 'hash-link-a1')).toMatchObject({
      orgId: F.orgA,
      orgName: 'Studio A',
      weddingId: F.weddingA1,
      weddingVendorId: F.wedVendorA1,
      vendorName: 'Traiteur A',
      status: 'live',
    })
    expect(await resolveVendorLinkByHash(h.db, 'no-such-hash')).toBeNull()
  })
})

describe('getVendorLinkView', () => {
  const principal = {
    kind: 'link' as const,
    orgId: F.orgA,
    weddingId: F.weddingA1,
    weddingVendorId: F.wedVendorA1,
  }

  it("reads only its own vendor's run_sheet_items, ordered, and null notes as no planner note", async () => {
    await seedExec(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA1,
      F.runItemA1,
    ])

    const view = await getVendorLinkView(h.db, principal)
    expect(view.timeline).toHaveLength(1)
    expect(view.timeline[0]).toMatchObject({ title: 'Ceremony', startsAt: '15:30' })
    expect(view.plannerNote).toBeNull()
  })

  it("reads the planner's note from wedding_vendors.notes", async () => {
    await seedExec(`update wedding_vendors set notes = $1 where id = $2`, [
      'Arrive by 14:00, park behind the chapel.',
      F.wedVendorA1,
    ])
    const view = await getVendorLinkView(h.db, principal)
    expect(view.plannerNote).toBe('Arrive by 14:00, park behind the chapel.')
  })

  it('an empty timeline reads as an empty array, not an error', async () => {
    const view = await getVendorLinkView(h.db, principal)
    expect(view.timeline).toEqual([])
  })
})

/**
 * The gap `tenant.ts`'s `link` variant now documents: nothing between a `link` `Principal`
 * and `link_read`'s RLS re-checks `vendor_links.revoked_at` / `expires_at`. Only
 * `resolveVendorLinkByHash` checks it, once, reading `resolve_vendor_link`'s `status` column
 * -- and only because the public route (`apps/web/src/app/pro/(public)/vendor/[token]/page
 * .tsx`) refuses anything but `'live'` before ever constructing a principal. Build the
 * principal directly, the way this same file's `getVendorLinkView` tests already do, and
 * skip that check entirely: RLS itself does not know the link is dead.
 *
 * This does NOT close the gap -- it proves it exists, so a caller that starts caching or
 * reusing a `link` principal across requests (the thing `tenant.ts`'s comment now warns
 * against) gets caught by a red test here instead of by a live vendor link that outlives its
 * own revocation.
 */
describe('a `link` principal built for a dead link still reads under RLS (documents the gap)', () => {
  it('a since-REVOKED link: RLS never re-checks vendor_links.revoked_at', async () => {
    await seedExec(`update vendor_links set revoked_at = now() where wedding_vendor_id = $1`, [
      F.wedVendorA1,
    ])
    await seedExec(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA1,
      F.runItemA1,
    ])

    // resolveVendorLinkByHash -- the ONE place that checks -- now reports it dead...
    expect((await resolveVendorLinkByHash(h.db, 'hash-link-a1'))?.status).toBe('revoked')

    // ...but a `link` principal built directly (as if a caller had kept one from before the
    // revocation, or skipped the status check) reads exactly as it would for a live link.
    const view = await getVendorLinkView(h.db, {
      kind: 'link' as const,
      orgId: F.orgA,
      weddingId: F.weddingA1,
      weddingVendorId: F.wedVendorA1,
    })
    expect(view.timeline).toHaveLength(1)
  })

  it('a since-EXPIRED link: RLS never re-checks vendor_links.expires_at either', async () => {
    await seedExec(
      `update vendor_links set expires_at = now() - interval '1 day' where wedding_vendor_id = $1`,
      [F.wedVendorA1],
    )
    await seedExec(`update run_sheet_items set wedding_vendor_id = $1 where id = $2`, [
      F.wedVendorA1,
      F.runItemA1,
    ])

    expect((await resolveVendorLinkByHash(h.db, 'hash-link-a1'))?.status).toBe('expired')

    const view = await getVendorLinkView(h.db, {
      kind: 'link' as const,
      orgId: F.orgA,
      weddingId: F.weddingA1,
      weddingVendorId: F.wedVendorA1,
    })
    expect(view.timeline).toHaveLength(1)
  })
})
