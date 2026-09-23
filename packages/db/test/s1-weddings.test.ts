import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createWedding,
  createWeddingEvent,
  deleteWeddingEvent,
  getWeddingDetail,
  getWeddingTaskCounts,
  listWeddingEvents,
  listWeddings,
  type Memberships,
  resolveMemberships,
  updateWedding,
  updateWeddingEvent,
  type WeddingInput,
} from '../src/repos/index.ts'
import {
  AS,
  asPrincipal,
  connect,
  F,
  type Harness,
  NOT_FOUND,
  reseed,
  seedExec,
  unwrap,
} from './harness.ts'

/**
 * Slice S1 (spec 0003): the wedding create / update path and the events repo, through the real
 * policies.
 *
 * Each case names the failure it stands in for. The ones about a `couple` are the important
 * ones: `weddings` is the one table whose policy has no role clause, so the application is the
 * only thing keeping a couple out of the planner's notes and out of a write, and only a test
 * against the real policy can show that the answer is not "RLS did it".
 */

let h: Harness
let owner: Memberships
let admin: Memberships
let member: Memberships
let couple: Memberships
let otherOrgOwner: Memberships

beforeAll(async () => {
  h = connect()
})

afterAll(async () => {
  await h.end()
})

// Every case may write, so every case starts from the fixture. `reseed` is a truncate and a
// handful of inserts; the memberships are read again after it because they are rows too.
beforeEach(async () => {
  await reseed()
  ;[owner, admin, member, couple, otherOrgOwner] = await Promise.all([
    resolveMemberships(h.db, F.staffA),
    resolveMemberships(h.db, F.staffDual),
    resolveMemberships(h.db, F.memberA),
    resolveMemberships(h.db, F.coupleA1),
    resolveMemberships(h.db, F.staffB),
  ])
})

const INPUT: WeddingInput = {
  coupleDisplayName: 'Marie & Thomas',
  weddingDate: '2028-05-20',
  venue: 'Kasteel X',
  headcount: 120,
  notes: 'Internal note',
  color: '#a94f4a',
  status: 'draft',
}

describe('createWedding', () => {
  it('lets an owner create one, storing the colour upper-case', async () => {
    const w = unwrap(
      await createWedding(h.db, owner, F.orgA, { ...INPUT, slugBase: 'marie-en-thomas' }),
    )
    expect(w).toMatchObject({
      slug: 'marie-en-thomas',
      coupleDisplayName: 'Marie & Thomas',
      color: '#A94F4A',
      status: 'draft',
    })
    const listed = await listWeddings(h.db, owner, F.orgA)
    expect(listed.map((x) => x.coupleDisplayName)).toContain('Marie & Thomas')
  })

  it('lets an admin create one', async () => {
    expect(
      await createWedding(h.db, admin, F.orgA, { ...INPUT, slugBase: 'admin-made' }),
    ).toMatchObject({ ok: true })
  })

  // principalForOrg is null for a member; an assignedStaff principal is pinned to a wedding
  // that does not exist yet. There is no principal a member could create one as.
  it('refuses a member, a couple, and a user with no standing in the org', async () => {
    expect(await createWedding(h.db, member, F.orgA, { ...INPUT, slugBase: 'nope-1' })).toEqual(
      NOT_FOUND,
    )
    expect(await createWedding(h.db, couple, F.orgA, { ...INPUT, slugBase: 'nope-2' })).toEqual(
      NOT_FOUND,
    )
    expect(
      await createWedding(h.db, otherOrgOwner, F.orgA, { ...INPUT, slugBase: 'nope-3' }),
    ).toEqual(NOT_FOUND)
    expect((await listWeddings(h.db, owner, F.orgA)).map((x) => x.slug)).toEqual(['a-one', 'a-two'])
  })

  it('creates it in the org it was asked for, never another', async () => {
    await createWedding(h.db, owner, F.orgA, { ...INPUT, slugBase: 'in-a' })
    const inB = await listWeddings(h.db, otherOrgOwner, F.orgB)
    expect(inB.map((x) => x.slug)).toEqual(['b-one'])
  })

  // The slug is unique across organisations and a transaction cannot see another org's rows, so
  // the collision has to be resolved by the insert itself. Org B owns 'b-one'; org A asks for it.
  it('gives a taken slug, even one held by another organisation, a suffix', async () => {
    const w = unwrap(await createWedding(h.db, owner, F.orgA, { ...INPUT, slugBase: 'b-one' }))
    expect(w).not.toBeNull()
    expect(w?.slug).toMatch(/^b-one-[0-9a-f]{5}$/)
    // and the other org's wedding is untouched
    expect((await listWeddings(h.db, otherOrgOwner, F.orgB)).map((x) => x.slug)).toEqual(['b-one'])
  })

  it('refuses a colour that is not upper-case hex once it reaches the database', async () => {
    await expect(
      createWedding(h.db, owner, F.orgA, { ...INPUT, color: 'red', slugBase: 'bad-colour' }),
    ).rejects.toThrow()
  })
})

describe('getWeddingDetail', () => {
  it('reads the notes for an owner and for an assigned member', async () => {
    expect((await getWeddingDetail(h.db, owner, F.orgA, F.weddingA1))?.slug).toBe('a-one')
    expect((await getWeddingDetail(h.db, member, F.orgA, F.weddingA1))?.slug).toBe('a-one')
  })

  // The couple can read the row under the policy; the repo is what keeps them off `notes`.
  it('is null for a couple, who may read the row but not the planner notes', async () => {
    expect(await getWeddingDetail(h.db, couple, F.orgA, F.weddingA1)).toBeNull()
  })

  it('is null for a member on a wedding they are not assigned to, and for another org', async () => {
    expect(await getWeddingDetail(h.db, member, F.orgA, F.weddingA2)).toBeNull()
    expect(await getWeddingDetail(h.db, otherOrgOwner, F.orgA, F.weddingA1)).toBeNull()
    expect(await getWeddingDetail(h.db, owner, F.orgA, F.weddingB1)).toBeNull()
  })
})

describe('updateWedding', () => {
  const EDIT: WeddingInput = { ...INPUT, coupleDisplayName: 'Renamed', status: 'live' }

  it('saves every editable field for an owner and an assigned member', async () => {
    const saved = unwrap(await updateWedding(h.db, owner, F.orgA, F.weddingA1, EDIT))
    expect(saved).toMatchObject({
      coupleDisplayName: 'Renamed',
      status: 'live',
      weddingDate: '2028-05-20',
      venue: 'Kasteel X',
      headcount: 120,
      notes: 'Internal note',
      color: '#A94F4A',
    })
    const again = unwrap(
      await updateWedding(h.db, member, F.orgA, F.weddingA1, {
        ...EDIT,
        color: null,
        headcount: null,
      }),
    )
    expect(again).toMatchObject({ color: null, headcount: null })
  })

  it('does not touch the slug', async () => {
    const saved = unwrap(await updateWedding(h.db, owner, F.orgA, F.weddingA1, EDIT))
    expect(saved?.slug).toBe('a-one')
  })

  // The policy on `weddings` would let this write through. The repo is the only refusal.
  it('refuses a couple, and writes nothing', async () => {
    expect(await updateWedding(h.db, couple, F.orgA, F.weddingA1, EDIT)).toEqual(NOT_FOUND)
    expect((await getWeddingDetail(h.db, owner, F.orgA, F.weddingA1))?.coupleDisplayName).toBe(
      'A One',
    )
  })

  it("refuses a member on someone else's wedding and a stranger from another org", async () => {
    expect(await updateWedding(h.db, member, F.orgA, F.weddingA2, EDIT)).toEqual(NOT_FOUND)
    expect(await updateWedding(h.db, otherOrgOwner, F.orgA, F.weddingA1, EDIT)).toEqual(NOT_FOUND)
    expect(await updateWedding(h.db, owner, F.orgA, F.weddingB1, EDIT)).toEqual(NOT_FOUND)
    expect(
      (await getWeddingDetail(h.db, otherOrgOwner, F.orgB, F.weddingB1))?.coupleDisplayName,
    ).toBe('B One')
  })

  it('rejects a negative headcount at the database', async () => {
    await expect(
      updateWedding(h.db, owner, F.orgA, F.weddingA1, { ...EDIT, headcount: -1 }),
    ).rejects.toThrow()
  })
})

describe('getWeddingTaskCounts', () => {
  it('counts what the fixture holds: two open, none done, none late', async () => {
    expect(await getWeddingTaskCounts(h.db, owner, F.orgA, F.weddingA1)).toEqual({
      total: 2,
      open: 2,
      done: 0,
      overdue: 0,
    })
  })

  it('counts done and late separately, and ignores a removed task', async () => {
    await seedExec(
      `insert into tasks (id, org_id, wedding_id, title, status, due_at, deleted_at) values
         (gen_random_uuid(), $1, $2, 'late', 'open', now() - interval '2 days', null),
         (gen_random_uuid(), $1, $2, 'finished late', 'done', now() - interval '2 days', null),
         (gen_random_uuid(), $1, $2, 'future', 'open', now() + interval '2 days', null),
         (gen_random_uuid(), $1, $2, 'removed', 'open', now() - interval '2 days', now())`,
      [F.orgA, F.weddingA1],
    )
    expect(await getWeddingTaskCounts(h.db, owner, F.orgA, F.weddingA1)).toEqual({
      total: 5,
      open: 4,
      done: 1,
      overdue: 1,
    })
  })

  it("is all zeros for a user with no standing, never another wedding's numbers", async () => {
    const zero = { total: 0, open: 0, done: 0, overdue: 0 }
    expect(await getWeddingTaskCounts(h.db, couple, F.orgA, F.weddingA1)).toEqual(zero)
    expect(await getWeddingTaskCounts(h.db, otherOrgOwner, F.orgA, F.weddingA1)).toEqual(zero)
    // A1's tasks must not show up under A2's id for an owner either.
    expect((await getWeddingTaskCounts(h.db, owner, F.orgA, F.weddingA2)).total).toBe(1)
  })
})

describe('events', () => {
  const EVENT = { label: 'Brunch', startsOn: '2027-08-01', startsAt: '11:00', venue: 'Terras' }

  it("lists a wedding's events, trimmed to HH:MM and never another wedding's", async () => {
    const rows = await listWeddingEvents(h.db, owner, F.orgA, F.weddingA1)
    expect(rows).toEqual([
      {
        id: F.eventA1,
        label: 'Ceremony',
        startsOn: '2027-07-31',
        startsAt: '15:30',
        venue: null,
        position: 0,
      },
    ])
  })

  it('orders by date, then time, with no time last', async () => {
    await createWeddingEvent(h.db, owner, F.orgA, F.weddingA1, {
      ...EVENT,
      label: 'No time',
      startsAt: null,
      startsOn: '2027-07-31',
    })
    await createWeddingEvent(h.db, owner, F.orgA, F.weddingA1, {
      ...EVENT,
      label: 'Early',
      startsAt: '09:00',
      startsOn: '2027-07-31',
    })
    await createWeddingEvent(h.db, owner, F.orgA, F.weddingA1, {
      ...EVENT,
      label: 'Before',
      startsOn: '2027-07-30',
    })
    const labels = (await listWeddingEvents(h.db, owner, F.orgA, F.weddingA1)).map((e) => e.label)
    expect(labels).toEqual(['Before', 'Early', 'Ceremony', 'No time'])
  })

  it("appends at the end of the wedding's positions", async () => {
    const a = unwrap(await createWeddingEvent(h.db, owner, F.orgA, F.weddingA1, EVENT))
    const b = unwrap(await createWeddingEvent(h.db, owner, F.orgA, F.weddingA1, EVENT))
    expect([a?.position, b?.position]).toEqual([1, 2])
  })

  it('lets an assigned member create, edit and remove on their wedding', async () => {
    const made = unwrap(await createWeddingEvent(h.db, member, F.orgA, F.weddingA1, EVENT))
    expect(made).not.toBeNull()
    const id = made?.id ?? ''
    expect(
      unwrap(
        await updateWeddingEvent(h.db, member, F.orgA, F.weddingA1, id, {
          ...EVENT,
          label: 'Renamed',
        }),
      )?.label,
    ).toBe('Renamed')
    expect(await deleteWeddingEvent(h.db, member, F.orgA, F.weddingA1, id)).toEqual({
      ok: true,
      value: null,
    })
    expect((await listWeddingEvents(h.db, member, F.orgA, F.weddingA1)).map((e) => e.id)).toEqual([
      F.eventA1,
    ])
  })

  it('removes softly: the row stays, so a run sheet item keeps its event', async () => {
    await deleteWeddingEvent(h.db, owner, F.orgA, F.weddingA1, F.eventA1)
    expect(await listWeddingEvents(h.db, owner, F.orgA, F.weddingA1)).toEqual([])
    const rows = await asPrincipal(
      h,
      AS.staffA,
      'select deleted_at from wedding_events where id = $1',
      [F.eventA1],
    )
    expect(rows).toHaveLength(1)
    expect((rows[0] as { deleted_at: Date | null }).deleted_at).not.toBeNull()
  })

  it('refuses a couple and a member on an unassigned wedding, for every verb', async () => {
    for (const [who, wedding] of [
      [couple, F.weddingA1],
      [member, F.weddingA2],
      [otherOrgOwner, F.weddingA1],
    ] as const) {
      expect(await createWeddingEvent(h.db, who, F.orgA, wedding, EVENT)).toEqual(NOT_FOUND)
      expect(await listWeddingEvents(h.db, who, F.orgA, wedding)).toEqual([])
      expect(await updateWeddingEvent(h.db, who, F.orgA, wedding, F.eventA1, EVENT)).toEqual(
        NOT_FOUND,
      )
      expect(await deleteWeddingEvent(h.db, who, F.orgA, wedding, F.eventA1)).toEqual(NOT_FOUND)
    }
    expect(await listWeddingEvents(h.db, owner, F.orgA, F.weddingA1)).toHaveLength(1)
  })

  // An owner is org-wide, so RLS does not pin them to a wedding. The `wedding_id` in the
  // predicate is what stops A1's URL editing A2's event -- and the parent read is what stops
  // creating an event on another org's wedding, which a plain foreign key would accept.
  it('does not let an owner reach across weddings or orgs through the wrong id', async () => {
    expect(await updateWeddingEvent(h.db, owner, F.orgA, F.weddingA1, F.eventA2, EVENT)).toEqual(
      NOT_FOUND,
    )
    expect(await deleteWeddingEvent(h.db, owner, F.orgA, F.weddingA1, F.eventA2)).toEqual(NOT_FOUND)
    expect(await createWeddingEvent(h.db, owner, F.orgA, F.weddingB1, EVENT)).toEqual(NOT_FOUND)
    expect(await listWeddingEvents(h.db, owner, F.orgA, F.weddingA2)).toHaveLength(1)
    expect(await listWeddingEvents(h.db, otherOrgOwner, F.orgB, F.weddingB1)).toHaveLength(1)
  })

  it('rejects an event on a wedding that does not exist', async () => {
    expect(
      await createWeddingEvent(h.db, owner, F.orgA, '00000000-0000-0000-0000-000000000000', EVENT),
    ).toEqual(NOT_FOUND)
  })
})
