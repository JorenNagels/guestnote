import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createStaffInvite,
  listPendingInvites,
  listTeam,
  type Memberships,
  resolveMemberships,
  revokeStaffInvite,
} from '../src/repos/index.ts'
import { connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * Slice S6 (spec 0003): staff invitations and the team list, through the repo against the
 * real policies.
 *
 * The team LIST is asserted for what today's policies allow, which is the caller's own row
 * (`own_memberships`); `team/SPEC.md` "Blocked" says why, and the assertion below names the
 * day it should be tightened. Everything about invitations is asserted at full strength,
 * because `invitations` has an org-wide `tenant_isolation` policy and nothing here needs a
 * new one.
 */

let h: Harness
let owner: Memberships
let admin: Memberships
let member: Memberships
let otherOrgOwner: Memberships

const IN_A_WEEK = () => new Date(Date.now() + 7 * 24 * 3600 * 1000)

beforeAll(async () => {
  h = connect()
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  admin = await resolveMemberships(h.db, F.staffDual)
  member = await resolveMemberships(h.db, F.memberA)
  otherOrgOwner = await resolveMemberships(h.db, F.staffB)
})

afterAll(async () => {
  await h.end()
})

describe('listPendingInvites', () => {
  it('gives an owner the staff invitations of their org only, never the couple one or the other org', async () => {
    const rows = await listPendingInvites(h.db, owner, F.orgA)
    expect(rows?.map((r) => r.email)).toEqual(['newstaff@a.test'])
  })

  it('gives an admin the same list', async () => {
    const rows = await listPendingInvites(h.db, admin, F.orgA)
    expect(rows?.map((r) => r.email)).toEqual(['newstaff@a.test'])
  })

  it('returns null for a member, and for an org the caller is not in, without a query', async () => {
    expect(await listPendingInvites(h.db, member, F.orgA)).toBeNull()
    expect(await listPendingInvites(h.db, owner, F.orgB)).toBeNull()
  })
})

describe('createStaffInvite', () => {
  it('writes a staff row that the list then shows, expiry and inviter included', async () => {
    const expiresAt = IN_A_WEEK()
    const out = await createStaffInvite(h.db, owner, F.orgA, {
      email: 'fresh@a.test',
      role: 'admin',
      tokenHash: 'a'.repeat(64),
      expiresAt,
    })
    expect(out.kind).toBe('created')

    const rows = await listPendingInvites(h.db, owner, F.orgA)
    const fresh = rows?.find((r) => r.email === 'fresh@a.test')
    expect(fresh).toMatchObject({ role: 'admin' })
    expect(fresh?.expiresAt.getTime()).toBe(expiresAt.getTime())
  })

  it('refuses a live duplicate, case-insensitively', async () => {
    const out = await createStaffInvite(h.db, owner, F.orgA, {
      email: 'newstaff@a.test',
      role: 'member',
      tokenHash: 'b'.repeat(64),
      expiresAt: IN_A_WEEK(),
    })
    expect(out).toEqual({ kind: 'duplicate' })
  })

  it('allows a new invite once the earlier one for the same address has expired', async () => {
    await seedExec(
      `insert into invitations (id, org_id, wedding_id, email, role, token_hash, expires_at)
       values (gen_random_uuid(), $1, null, 'lapsed@a.test', 'member', 'hash-lapsed', now() - interval '1 day')`,
      [F.orgA],
    )
    const out = await createStaffInvite(h.db, owner, F.orgA, {
      email: 'lapsed@a.test',
      role: 'member',
      tokenHash: 'c'.repeat(64),
      expiresAt: IN_A_WEEK(),
    })
    expect(out.kind).toBe('created')
  })

  it('refuses an address that is already a member of the org, as far as the caller can see', async () => {
    // The owner reads their OWN org_members row today (see the header), so the address
    // that can be tested here is the owner's own. Widens to every member with the org-wide
    // SELECT policy; this assertion stays true.
    const rows = await listTeam(h.db, owner, F.orgA)
    const own = rows?.[0]?.email
    expect(own).toBeTruthy()
    const out = await createStaffInvite(h.db, owner, F.orgA, {
      email: (own as string).toLowerCase(),
      role: 'member',
      tokenHash: 'd'.repeat(64),
      expiresAt: IN_A_WEEK(),
    })
    expect(out).toEqual({ kind: 'alreadyMember' })
  })

  it('refuses a member and a foreign org before writing', async () => {
    const input = {
      email: 'x@a.test',
      role: 'member' as const,
      tokenHash: 'e'.repeat(64),
      expiresAt: IN_A_WEEK(),
    }
    expect(await createStaffInvite(h.db, member, F.orgA, input)).toEqual({ kind: 'forbidden' })
    expect(await createStaffInvite(h.db, otherOrgOwner, F.orgA, input)).toEqual({
      kind: 'forbidden',
    })
    const rows = await listPendingInvites(h.db, owner, F.orgA)
    expect(rows?.some((r) => r.email === 'x@a.test')).toBe(false)
  })

  it("never lets one org see or block another org's invitation to the same address", async () => {
    const out = await createStaffInvite(h.db, otherOrgOwner, F.orgB, {
      email: 'newstaff@a.test',
      role: 'member',
      tokenHash: 'f'.repeat(64),
      expiresAt: IN_A_WEEK(),
    })
    expect(out.kind).toBe('created')
  })
})

describe('revokeStaffInvite', () => {
  it('deletes a pending staff invitation and reports true, then false the second time', async () => {
    const rows = await listPendingInvites(h.db, owner, F.orgA)
    const target = rows?.find((r) => r.email === 'newstaff@a.test')
    expect(target).toBeDefined()
    expect(await revokeStaffInvite(h.db, owner, F.orgA, target?.id as string)).toBe(true)
    expect(await revokeStaffInvite(h.db, owner, F.orgA, target?.id as string)).toBe(false)
  })

  // Mutation note: deleting `eq(invitations.orgId, orgId)` from `revokeStaffInvite` leaves this
  // green, and cannot be made red -- `tenant_isolation` on `invitations` already filters to
  // the principal's org, so the clause is intent, not the boundary (its comment says so).
  it("cannot revoke another org's invitation, even with its id and an owner principal of its own", async () => {
    const theirs = await listPendingInvites(h.db, otherOrgOwner, F.orgB)
    const id = theirs?.[0]?.id as string
    expect(await revokeStaffInvite(h.db, owner, F.orgA, id)).toBe(false)
    expect(await revokeStaffInvite(h.db, owner, F.orgB, id)).toBe(false)
    expect((await listPendingInvites(h.db, otherOrgOwner, F.orgB))?.some((r) => r.id === id)).toBe(
      true,
    )
  })

  it('refuses a member without deleting anything', async () => {
    const rows = await listPendingInvites(h.db, owner, F.orgA)
    const id = rows?.[0]?.id as string
    expect(await revokeStaffInvite(h.db, member, F.orgA, id)).toBe(false)
    expect((await listPendingInvites(h.db, owner, F.orgA))?.some((r) => r.id === id)).toBe(true)
  })

  it('leaves an accepted invitation alone', async () => {
    await seedExec(
      `insert into invitations (id, org_id, wedding_id, email, role, token_hash, expires_at, accepted_at)
       values ('019a0000-0000-7000-8000-0000000000aa', $1, null, 'done@a.test', 'member', 'hash-done', now() + interval '7 days', now())`,
      [F.orgA],
    )
    expect(
      await revokeStaffInvite(h.db, owner, F.orgA, '019a0000-0000-7000-8000-0000000000aa'),
    ).toBe(false)
  })
})

describe('listTeam', () => {
  it('returns null for a member', async () => {
    expect(await listTeam(h.db, member, F.orgA)).toBeNull()
  })

  it('lists the caller with their role, and never a row from another org', async () => {
    const rows = await listTeam(h.db, owner, F.orgA)
    expect(rows?.map((r) => r.userId)).toContain(F.staffA)
    expect(rows?.every((r) => r.userId !== F.staffB)).toBe(true)
    expect(rows?.find((r) => r.userId === F.staffA)?.role).toBe('owner')
  })
})
