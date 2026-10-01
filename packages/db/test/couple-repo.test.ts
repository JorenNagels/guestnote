import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addImageComment,
  coupleHome,
  couplePrincipalFor,
  coupleSetTaskDone,
  coupleTasks,
  createCoupleInvite,
  getCoupleAccess,
  getRunSheet,
  getWeddingDetail,
  listImageComments,
  listTeam,
  markCoupleActivitySeen,
  myCoupleWeddings,
  removeCouplePartner,
  renewCoupleInvite,
  resolveInvitationByHash,
  resolveMemberships,
  revokeCoupleInvite,
  setCoupleModules,
  WeddingScope,
} from '../src/index.ts'
import { AS, asPrincipal, connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * Spec 0008, the repo half: what only `repos/couple.ts` can say -- the principal it builds, the
 * refusals it maps, the rows it narrows. What the database refuses on its own is
 * `couple-portal.test.ts`.
 */

let h: Harness
beforeAll(() => {
  h = connect()
})
afterAll(async () => {
  await h.end()
})
beforeEach(async () => {
  await reseed()
})

const scopeFor = async (userId: string, weddingId: string = F.weddingA1) =>
  WeddingScope.of(h.db, await resolveMemberships(h.db, userId), F.orgA, weddingId)
const later = () => new Date(Date.now() + 30 * 86_400_000)

describe('the couple principal', () => {
  it('is built for the couple of this wedding, and for nobody and nothing else', async () => {
    expect(await myCoupleWeddings(h.db, F.coupleA1)).toMatchObject([
      { weddingId: F.weddingA1, orgId: F.orgA, status: 'live', weddingDate: '2027-07-31' },
    ])
    expect(await couplePrincipalFor(h.db, F.coupleA1, F.weddingA1)).toEqual({
      kind: 'weddingMember',
      userId: F.coupleA1,
      orgId: F.orgA,
      weddingId: F.weddingA1,
      role: 'couple',
    })
    expect(await couplePrincipalFor(h.db, F.coupleA1, F.weddingA2)).toBeNull()
    expect(await couplePrincipalFor(h.db, F.memberA, F.weddingA1)).toBeNull()
    expect(await couplePrincipalFor(h.db, F.coupleA1, 'not-a-uuid')).toBeNull()
  })

  it('reads the home and marks a couple-assigned task as ours', async () => {
    const p = await couplePrincipalFor(h.db, F.coupleA1, F.weddingA1)
    if (!p) throw new Error('fixture')
    const home = await coupleHome(h.db, p)
    expect(home).toMatchObject({ studioName: 'Studio A', coupleUserIds: [F.coupleA1] })
    expect(home?.modules).toEqual(['tasks', 'moodboards', 'run_sheet', 'vendors', 'budget'])

    await seedExec(`update tasks set assignee_user_id = $2 where id = $1`, [
      F.taskA1Shared,
      F.coupleA1,
    ])
    const list = await coupleTasks(h.db, p, home?.coupleUserIds ?? [])
    expect(list.map((t) => [t.id, t.ours])).toEqual([[F.taskA1Shared, true]])
    expect((await coupleSetTaskDone(h.db, p, F.taskA1Shared, true)).ok).toBe(true)
  })
})

describe('couple invites from the planner side', () => {
  const invite = async (userId: string, email: string) =>
    createCoupleInvite(await scopeFor(userId), {
      email,
      tokenHash: `h-${email}`,
      expiresAt: later(),
    })

  it('lets the assigned member invite, and refuses staff, partners, duplicates and outsiders', async () => {
    // The fixture's live A1 invite plus its partner fill both slots; free one first.
    await seedExec(`delete from invitations where token_hash = 'hash-couple-a1'`)
    const r = await invite(F.memberA, 'anna@x.test')
    expect(r.ok).toBe(true)
    expect(await invite(F.memberA, 'anna@x.test')).toEqual({ ok: false, reason: 'duplicate' })
    expect(await invite(F.staffA, 'member@a.test')).toEqual({ ok: false, reason: 'alreadyStaff' })
    expect(await invite(F.staffA, 'couple@a1.test')).toEqual({
      ok: false,
      reason: 'alreadyPartner',
    })
    expect(await invite(F.coupleA1, 'x@x.test')).toEqual({ ok: false, reason: 'forbidden' })
    // memberA is not assigned to A2.
    const a2 = await createCoupleInvite(await scopeFor(F.memberA, F.weddingA2), {
      email: 'y@x.test',
      tokenHash: 'h-y',
      expiresAt: later(),
    })
    expect(a2).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('refuses a third partner: one accepted plus one live invite fill the wedding', async () => {
    expect(await invite(F.staffA, 'third@x.test')).toEqual({ ok: false, reason: 'full' })
  })

  it('an expired invite does not block a new one', async () => {
    await seedExec(
      `update invitations set expires_at = now() - interval '1 day' where token_hash = 'hash-couple-a1'`,
    )
    expect((await invite(F.staffA, 'partner@a1.test')).ok).toBe(true)
  })

  it('renew replaces the token, so the old one resolves unknown', async () => {
    const s = await scopeFor(F.staffA)
    const access = await getCoupleAccess(s)
    const old = access?.invites[0]
    expect(old?.email).toBe('partner@a1.test')
    const r = await renewCoupleInvite(s, old?.id ?? '', { tokenHash: 'h-new', expiresAt: later() })
    expect(r).toMatchObject({ ok: true, value: { email: 'partner@a1.test' } })
    expect(await resolveInvitationByHash(h.db, 'hash-couple-a1')).toBeNull()
    expect((await resolveInvitationByHash(h.db, 'h-new'))?.status).toBe('pending')
  })

  it('revoke deletes a pending couple invite and never a staff one', async () => {
    const s = await scopeFor(F.staffA)
    const [staffInvite] = await asPrincipal(
      h,
      AS.staffA,
      `select id from invitations where wedding_id is null`,
    )
    expect(await revokeCoupleInvite(s, String(staffInvite?.id))).toEqual({
      ok: false,
      reason: 'notFound',
    })
    const id = (await getCoupleAccess(s))?.invites[0]?.id ?? ''
    expect(await revokeCoupleInvite(s, id)).toEqual({ ok: true, value: null })
    expect((await getCoupleAccess(s))?.invites).toEqual([])
  })
})

describe('a partner who later joins the studio as staff (spec 0008, tenancy audit)', () => {
  it('is not assigned to their own wedding by their couple row', async () => {
    await seedExec(`insert into org_members (org_id, user_id, role) values ($1, $2, 'member')`, [
      F.orgA,
      F.coupleA1,
    ])
    const scope = await scopeFor(F.coupleA1)
    expect(scope.principal).toBeNull()
    expect(await getWeddingDetail(scope)).toBeNull()

    // The team list and the run-sheet owners filter to `editor` rows the same way.
    const team = await listTeam(h.db, await resolveMemberships(h.db, F.staffA), F.orgA)
    expect(team?.find((m) => m.userId === F.coupleA1)?.weddings).toEqual([])
    const sheet = await getRunSheet(await scopeFor(F.staffA))
    expect(sheet?.owners.map((o) => o.id)).not.toContain(F.coupleA1)
    expect(sheet?.owners.map((o) => o.id)).toContain(F.memberA)
  })
})

describe('staff image comments', () => {
  it('refuses an image of a sibling wedding, and writes nothing', async () => {
    const r = await addImageComment(await scopeFor(F.staffA, F.weddingA1), F.fileA2Shared, 'x')
    expect(r).toEqual({ ok: false, reason: 'notFound' })
    const [n] = await asPrincipal(
      h,
      AS.staffA,
      'select count(*)::int as n from file_comments where file_id = $1',
      [F.fileA2Shared],
    )
    expect(n?.n).toBe(0)
  })

  it('adds to and lists an image thread on this wedding', async () => {
    const s = await scopeFor(F.staffA)
    expect((await addImageComment(s, F.imageA1Photo, 'Mooi')).ok).toBe(true)
    expect((await listImageComments(s, F.imageA1Photo))?.map((c) => c.body)).toEqual([
      'Mooi licht',
      'Mooi',
    ])
  })
})

describe('the couple section', () => {
  it('shows partners, pending invites and the shared-task count to the assigned member', async () => {
    const access = await getCoupleAccess(await scopeFor(F.memberA))
    expect(access?.partners.map((p) => p.email)).toEqual(['couple@a1.test'])
    expect(access?.invites.map((i) => i.email)).toEqual(['partner@a1.test'])
    expect(access?.sharedTaskCount).toBe(1)
    expect(await getCoupleAccess(await scopeFor(F.coupleA1))).toBeNull()
  })

  it('removes a partner, who then has no principal', async () => {
    expect(await removeCouplePartner(await scopeFor(F.memberA), F.coupleA1)).toEqual({
      ok: true,
      value: null,
    })
    expect(await couplePrincipalFor(h.db, F.coupleA1, F.weddingA1)).toBeNull()
  })

  it('switching a module off takes it away from the couple', async () => {
    expect(
      (await setCoupleModules(await scopeFor(F.staffA), ['tasks', 'budget', 'nonsense'])).ok,
    ).toBe(true)
    const p = await couplePrincipalFor(h.db, F.coupleA1, F.weddingA1)
    if (!p) throw new Error('fixture')
    expect((await coupleHome(h.db, p))?.modules).toEqual(['tasks', 'budget'])
  })

  it('marking seen clears the unread dot, and only when there was activity', async () => {
    const s = await scopeFor(F.staffA)
    const seen = async () =>
      (
        await asPrincipal(h, AS.staffAOnA1, 'select staff_seen_at from tasks where id = $1', [
          F.taskA1Shared,
        ])
      )[0]?.staff_seen_at
    await markCoupleActivitySeen(s, { kind: 'task', id: F.taskA1Shared })
    expect(await seen()).toBeNull()
    await seedExec(`update tasks set couple_activity_at = now() where id = $1`, [F.taskA1Shared])
    await markCoupleActivitySeen(s, { kind: 'task', id: F.taskA1Shared })
    expect(await seen()).not.toBeNull()
  })
})
