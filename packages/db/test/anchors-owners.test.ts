import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  anchoredTaskCounts,
  createRunSheetItem,
  createTask,
  createTasks,
  createWeddingEvent,
  deleteWeddingEvent,
  getRunSheet,
  getTask,
  getWeddingDetail,
  type Memberships,
  type RunSheetInput,
  resolveMemberships,
  updateRunSheetItem,
  updateTask,
  updateWedding,
  updateWeddingEvent,
  WeddingScope,
} from '../src/repos/index.ts'
import { connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * Spec 0004 against the real policies: a task anchored to an event, and a run-sheet row with a
 * staff owner.
 *
 * What only the repo can do is asserted here -- the parent reads the plain foreign keys need, the
 * `due_at` rewrite on every date write, and who may be an owner. Every cross-wedding case runs as
 * the org OWNER, whose principal is org-wide and so the shape RLS alone would let through.
 */

let h: Harness
let owner: Memberships
let member: Memberships

const A1 = F.weddingA1
const A2 = F.weddingA2
const a1 = () => WeddingScope.of(h.db, owner, F.orgA, A1)

beforeAll(() => {
  h = connect()
})
afterAll(async () => {
  await h?.end()
})
beforeEach(async () => {
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
})

/** The civil ceremony two weeks before A1's 2027-07-31. */
async function civil(startsOn = '2027-07-16'): Promise<string> {
  const r = await createWeddingEvent(a1(), {
    label: 'Civil',
    startsOn,
    startsAt: null,
    venue: null,
  })
  if (!r.ok) throw new Error('fixture: event')
  return r.value.id
}

async function anchoredTask(eventId: string, days = -14): Promise<string> {
  const r = await createTask(a1(), {
    title: 'Papers',
    due: { kind: 'offset', days, anchorEventId: eventId },
  })
  if (!r.ok) throw new Error(`fixture: task ${r.reason}`)
  return r.value.id
}

describe('a task anchored to an event', () => {
  it('counts from the event, names it, and stores due_at at noon UTC of that day', async () => {
    const ev = await civil()
    const task = await getTask(a1(), await anchoredTask(ev))
    expect(task?.dueDate).toBe('2027-07-02')
    expect(task?.anchorLabel).toBe('Civil')
    expect(task?.dueAt).toEqual(new Date('2027-07-02T12:00:00Z'))
  })

  it("refuses a sibling wedding's event and another org's, even for the org-wide owner", async () => {
    for (const eventId of [F.eventA2, F.eventB1]) {
      const r = await createTask(a1(), {
        title: 'Papers',
        due: { kind: 'offset', days: -14, anchorEventId: eventId },
      })
      expect(r).toEqual({ ok: false, reason: 'anchorNotFound' })
    }
  })

  it('refuses a removed event, on update as well as create', async () => {
    const ev = await civil()
    const id = await anchoredTask(F.eventA1)
    await deleteWeddingEvent(a1(), ev)
    const r = await updateTask(a1(), id, { due: { kind: 'offset', days: -3, anchorEventId: ev } })
    expect(r).toEqual({ ok: false, reason: 'anchorNotFound' })
  })

  it('drops the anchor when the due becomes a fixed date', async () => {
    const id = await anchoredTask(await civil())
    const r = await updateTask(a1(), id, { due: { kind: 'date', date: '2027-05-01' } })
    expect(r.ok && r.value.anchorEventId).toBeNull()
    expect(r.ok && r.value.dueDate).toBe('2027-05-01')
  })
})

describe('due_at follows the date it counts from', () => {
  it('moves with its event, in the stored copy as well as the derived date', async () => {
    const ev = await civil()
    const id = await anchoredTask(ev)
    await updateWeddingEvent(a1(), ev, {
      label: 'Civil',
      startsOn: '2027-07-09',
      startsAt: null,
      venue: null,
    })
    const task = await getTask(a1(), id)
    expect(task?.dueDate).toBe('2027-06-25')
    expect(task?.dueAt).toEqual(new Date('2027-06-25T12:00:00Z'))
  })

  it('falls back to the main date when its event is removed, and says it counted from it', async () => {
    const ev = await civil()
    const id = await anchoredTask(ev)
    expect(await anchoredTaskCounts(a1())).toEqual({ [ev]: 1 })

    await deleteWeddingEvent(a1(), ev)
    const task = await getTask(a1(), id)
    expect(task?.anchorEventId).toBeNull()
    expect(task?.dueDate).toBe('2027-07-17')
    expect(task?.dueAt).toEqual(new Date('2027-07-17T12:00:00Z'))
    expect(await anchoredTaskCounts(a1())).toEqual({})
  })

  it('moves unanchored offset tasks when the wedding date moves, and leaves anchored ones', async () => {
    const plain = await createTask(a1(), { title: 'Menu', due: { kind: 'offset', days: -30 } })
    const anchored = await anchoredTask(await civil())
    const detail = await getWeddingDetail(a1())
    if (!detail || !plain.ok) throw new Error('fixture')

    await updateWedding(a1(), {
      coupleDisplayName: detail.coupleDisplayName,
      weddingDate: '2027-08-07',
      venue: detail.venue,
      headcount: detail.headcount,
      notes: detail.notes,
      color: detail.color,
      status: 'live',
    })
    expect((await getTask(a1(), plain.value.id))?.dueAt).toEqual(new Date('2027-07-08T12:00:00Z'))
    expect((await getTask(a1(), anchored))?.dueAt).toEqual(new Date('2027-07-02T12:00:00Z'))
  })

  it("does not touch a sibling wedding's tasks when an event of this one moves", async () => {
    const other = await createTask(WeddingScope.of(h.db, owner, F.orgA, A2), {
      title: 'Sibling',
      due: { kind: 'offset', days: -1 },
    })
    if (!other.ok) throw new Error('fixture')
    // Stale on purpose: a correct value would come out of an unscoped rewrite unchanged, and the
    // mutation that drops the wedding filter survived this test until the copy was made wrong.
    const before = new Date('2020-01-01T12:00:00Z')
    await seedExec('update tasks set due_at = $1 where id = $2', [before, other.value.id])
    await updateWeddingEvent(a1(), F.eventA1, {
      label: 'Ceremony',
      startsOn: '2027-07-30',
      startsAt: null,
      venue: null,
    })
    const after = await getTask(WeddingScope.of(h.db, owner, F.orgA, A2), other.value.id)
    expect(after?.dueAt).toEqual(before)
  })
})

describe('a run-sheet row owner', () => {
  const row = (over: Partial<RunSheetInput> = {}): RunSheetInput => ({
    startsAt: '16:30',
    durationMin: 30,
    title: 'Drinks',
    place: null,
    weddingVendorId: null,
    ...over,
  })
  const ids = (xs: { id: string }[] | undefined) => (xs ?? []).map((x) => x.id).sort()

  it('offers an owner every owner, admin and assigned member, and a member only themselves', async () => {
    expect(ids((await getRunSheet(a1()))?.owners)).toEqual(
      [F.staffA, F.staffDual, F.memberA].sort(),
    )
    // Not assigned to A2, so not offered there.
    expect(ids((await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A2)))?.owners)).toEqual(
      [F.staffA, F.staffDual].sort(),
    )
    // Cannot discriminate `eligibleOwners`' `assignedStaff` branch: without it the org-wide query
    // runs under the member's pinned principal, and RLS (`own_memberships`) returns their own rows
    // and nobody else's -- the same answer. Measured 2026-09-24 by deleting the branch. The branch
    // stays so the repo does not lean on the policy alone for who a member may name.
    expect(ids((await getRunSheet(WeddingScope.of(h.db, member, F.orgA, A1)))?.owners)).toEqual([
      F.memberA,
    ])
  })

  it('writes an eligible owner and reads their name back', async () => {
    const r = await createRunSheetItem(a1(), F.eventA1, row({ ownerUserId: F.memberA }))
    expect(r.ok).toBe(true)
    const item = (await getRunSheet(a1()))?.items.find((i) => r.ok && i.id === r.value.id)
    expect(item?.ownerUserId).toBe(F.memberA)
    expect(item?.ownerName).toBe('member@a.test')
  })

  it('refuses a couple, another org, and a member not assigned to this wedding', async () => {
    for (const [weddingId, eventId, who] of [
      [A1, F.eventA1, F.coupleA1],
      [A1, F.eventA1, F.staffB],
      [A2, F.eventA2, F.memberA],
    ] as const) {
      const r = await createRunSheetItem(
        WeddingScope.of(h.db, owner, F.orgA, weddingId),
        eventId,
        row({ ownerUserId: who }),
      )
      expect(r).toEqual({ ok: false, reason: 'ownerNotFound' })
    }
  })

  it('lets a member take a row but not hand it to a colleague', async () => {
    const asMember = WeddingScope.of(h.db, member, F.orgA, A1)
    expect(
      (await createRunSheetItem(asMember, F.eventA1, row({ ownerUserId: F.memberA }))).ok,
    ).toBe(true)
    expect(await createRunSheetItem(asMember, F.eventA1, row({ ownerUserId: F.staffA }))).toEqual({
      ok: false,
      reason: 'ownerNotFound',
    })
  })

  it("keeps a colleague's ownership when a member edits the row without changing it", async () => {
    const made = await createRunSheetItem(a1(), F.eventA1, row({ ownerUserId: F.staffA }))
    if (!made.ok) throw new Error('fixture')
    const asMember = WeddingScope.of(h.db, member, F.orgA, A1)
    const r = await updateRunSheetItem(
      asMember,
      made.value.id,
      row({ title: 'Drinks outside', ownerUserId: F.staffA }),
    )
    expect(r.ok).toBe(true)
    const item = (await getRunSheet(a1()))?.items.find((i) => i.id === made.value.id)
    expect(item?.ownerUserId).toBe(F.staffA)
  })
})

describe('spec 0004, the cases commit review found uncovered', () => {
  const row = (over: Partial<RunSheetInput> = {}): RunSheetInput => ({
    startsAt: '16:30',
    durationMin: 30,
    title: 'Drinks',
    place: null,
    weddingVendorId: null,
    ...over,
  })

  it('leaves a fixed-date task alone when the wedding date moves', async () => {
    const fixed = await createTask(a1(), {
      title: 'Venue',
      due: { kind: 'date', date: '2027-05-01' },
    })
    const detail = await getWeddingDetail(a1())
    if (!fixed.ok || !detail) throw new Error('fixture')
    await updateWedding(a1(), {
      coupleDisplayName: detail.coupleDisplayName,
      weddingDate: '2027-08-07',
      venue: detail.venue,
      headcount: detail.headcount,
      notes: detail.notes,
      color: detail.color,
      status: 'live',
    })
    expect((await getTask(a1(), fixed.value.id))?.dueAt).toEqual(new Date('2027-05-01T12:00:00Z'))
  })

  it('creates a batch of tasks sharing one anchor', async () => {
    const ev = await civil()
    const t = { title: 'x', due: { kind: 'offset', days: -1, anchorEventId: ev } } as const
    const r = await createTasks(a1(), [t, t])
    expect(r.ok && r.value).toHaveLength(2)
  })

  it("counts only this wedding's live anchored tasks", async () => {
    const ev = await civil()
    await anchoredTask(ev)
    const gone = await anchoredTask(ev)
    await seedExec('update tasks set deleted_at = now() where id = $1', [gone])
    await createTask(WeddingScope.of(h.db, owner, F.orgA, A2), {
      title: 'Sibling',
      due: { kind: 'offset', days: -1, anchorEventId: F.eventA2 },
    })
    expect(await anchoredTaskCounts(a1())).toEqual({ [ev]: 1 })
  })

  it('checks a changed owner on update, not only on create', async () => {
    const made = await createRunSheetItem(a1(), F.eventA1, row())
    if (!made.ok) throw new Error('fixture')
    expect(await updateRunSheetItem(a1(), made.value.id, row({ ownerUserId: F.staffB }))).toEqual({
      ok: false,
      reason: 'ownerNotFound',
    })
    const asMember = WeddingScope.of(h.db, member, F.orgA, A1)
    expect(
      await updateRunSheetItem(asMember, made.value.id, row({ ownerUserId: F.staffA })),
    ).toEqual({ ok: false, reason: 'ownerNotFound' })
  })

  it('keeps the owner when an update does not mention one', async () => {
    const made = await createRunSheetItem(a1(), F.eventA1, row({ ownerUserId: F.memberA }))
    if (!made.ok) throw new Error('fixture')
    await updateRunSheetItem(a1(), made.value.id, row({ title: 'Drinks outside' }))
    const item = (await getRunSheet(a1()))?.items.find((i) => i.id === made.value.id)
    expect(item?.ownerUserId).toBe(F.memberA)
  })
})
