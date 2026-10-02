import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createRunSheetItem,
  deleteRunSheetItem,
  getRunSheet,
  type Memberships,
  moveRunSheetItem,
  type RunSheetInput,
  resolveMemberships,
  shiftRunSheetTimes,
  updateRunSheetItem,
  WeddingScope,
} from '../src/repos/index.ts'
import { connect, F, type Harness, reseed, seedExec } from './harness.ts'

/**
 * Slice S9: the run sheet repo, through the real policies.
 *
 * As `money-repos.test.ts` says, the repo filters too, so several cases here would pass under a
 * wrong policy; `planner-isolation.test.ts` is where the policies stand alone. What is asserted
 * HERE is what only the repo can do: the parent reads (the foreign keys are plain, so Postgres
 * accepts another wedding's event or vendor), and the ordering. Every cross-wedding case runs as
 * the OWNER of both, whose principal is org-wide and therefore the dangerous shape.
 */

let h: Harness
let owner: Memberships
let member: Memberships
let couple: Memberships
let otherOrgOwner: Memberships

const A1 = F.weddingA1
const A2 = F.weddingA2

const input = (over: Partial<RunSheetInput> = {}): RunSheetInput => ({
  startsAt: '16:30',
  durationMin: 30,
  title: 'Drinks',
  place: null,
  weddingVendorId: null,
  ...over,
})

async function titles(m: Memberships, weddingId: string = A1): Promise<string[]> {
  const data = await getRunSheet(WeddingScope.of(h.db, m, F.orgA, weddingId))
  return (data?.items ?? []).map((i) => i.title)
}

beforeAll(async () => {
  h = connect()
  await reseed()
  owner = await resolveMemberships(h.db, F.staffA)
  member = await resolveMemberships(h.db, F.memberA)
  couple = await resolveMemberships(h.db, F.coupleA1)
  otherOrgOwner = await resolveMemberships(h.db, F.staffB)
})

beforeEach(async () => {
  await reseed()
})

afterAll(async () => {
  await h.end()
})

describe('getRunSheet', () => {
  it("reads one wedding's items and its vendors, with the time cut to HH:MM", async () => {
    const data = await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1))
    expect(data?.items).toHaveLength(1)
    expect(data?.items[0]).toMatchObject({
      id: F.runItemA1,
      eventId: F.eventA1,
      startsAt: '15:30',
      durationMin: 40,
      title: 'Ceremony',
    })
    expect(data?.vendors.map((v) => v.id)).toEqual([F.wedVendorA1])
  })

  it("carries the vendor's phone beside its name, and the wedding's own language (spec 0009)", async () => {
    await seedExec(`update vendors set phone = '+32 470 12 34 56' where id = $1`, [F.vendorA])
    await seedExec(`update weddings set locale_default = 'fr' where id = $1`, [A1])
    const scope = WeddingScope.of(h.db, owner, F.orgA, A1)
    const made = await createRunSheetItem(
      scope,
      F.eventA1,
      input({ weddingVendorId: F.wedVendorA1 }),
    )
    if (!made.ok) throw new Error('setup: the item was not created')
    const data = await getRunSheet(scope)
    expect(data?.items.find((i) => i.id === made.value.id)).toMatchObject({
      vendorName: 'Traiteur A',
      vendorPhone: '+32 470 12 34 56',
    })
    expect(data?.items.find((i) => i.id === F.runItemA1)?.vendorPhone).toBeNull()
    expect(data?.locale).toBe('fr')
  })

  it('is null for a wedding the caller cannot see: another org, unassigned member, couple', async () => {
    expect(await getRunSheet(WeddingScope.of(h.db, otherOrgOwner, F.orgA, A1))).toBeNull()
    expect(await getRunSheet(WeddingScope.of(h.db, member, F.orgA, A2))).toBeNull()
    expect(await getRunSheet(WeddingScope.of(h.db, couple, F.orgA, A1))).toBeNull()
  })

  it('reads for an assigned member', async () => {
    expect(await titles(member)).toEqual(['Ceremony'])
  })

  it('hides the items of a removed event without deleting them', async () => {
    await seedExec(`update wedding_events set deleted_at = now() where id = $1`, [F.eventA1])
    expect(await titles(owner)).toEqual([])
    await seedExec(`update wedding_events set deleted_at = null where id = $1`, [F.eventA1])
    expect(await titles(owner)).toEqual(['Ceremony'])
  })
})

describe('createRunSheetItem', () => {
  it('places the item where the clock says', async () => {
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ startsAt: '16:30' }),
    )
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ startsAt: '15:00', title: 'Arrival' }),
    )
    expect(await titles(owner)).toEqual(['Arrival', 'Ceremony', 'Drinks'])
    const data = await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1))
    expect(data?.items.map((i) => i.position)).toEqual([0, 1, 2])
  })

  it('refuses an event of a sibling wedding, even for the org-wide owner', async () => {
    const r = await createRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), F.eventA2, input())
    expect(r).toEqual({ ok: false, reason: 'eventNotFound' })
    expect(await titles(owner, A2)).toEqual(['First dance'])
  })

  it('refuses a vendor link of a sibling wedding', async () => {
    const r = await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ weddingVendorId: F.wedVendorA2 }),
    )
    expect(r).toEqual({ ok: false, reason: 'vendorNotFound' })
    expect(await titles(owner)).toEqual(['Ceremony'])
  })

  it("accepts this wedding's vendor and names it", async () => {
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ weddingVendorId: F.wedVendorA1 }),
    )
    const data = await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1))
    expect(data?.items.find((i) => i.title === 'Drinks')?.vendorName).toBe('Traiteur A')
  })

  it('writes nothing for a caller with no standing', async () => {
    const none = { ok: false, reason: 'notFound' }
    expect(
      await createRunSheetItem(WeddingScope.of(h.db, couple, F.orgA, A1), F.eventA1, input()),
    ).toEqual(none)
    expect(
      await createRunSheetItem(WeddingScope.of(h.db, member, F.orgA, A2), F.eventA2, input()),
    ).toEqual(none)
    expect(
      await createRunSheetItem(
        WeddingScope.of(h.db, otherOrgOwner, F.orgA, A1),
        F.eventA1,
        input(),
      ),
    ).toEqual(none)
    expect(await titles(owner)).toEqual(['Ceremony'])
  })
})

describe('updateRunSheetItem', () => {
  it('will not touch an item of a sibling wedding, even for the org-wide owner', async () => {
    const r = await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA2,
      input(),
    )
    expect(r).toEqual({ ok: false, reason: 'itemNotFound' })
    expect(await titles(owner, A2)).toEqual(['First dance'])
  })

  it('refuses a new vendor from a sibling wedding but keeps an unchanged one that was removed', async () => {
    const bad = await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA1,
      input({ weddingVendorId: F.wedVendorA2 }),
    )
    expect(bad).toEqual({ ok: false, reason: 'vendorNotFound' })

    await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA1,
      input({ startsAt: '15:30', weddingVendorId: F.wedVendorA1 }),
    )
    await seedExec(`update wedding_vendors set deleted_at = now() where id = $1`, [F.wedVendorA1])
    const again = await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA1,
      input({ startsAt: '15:30', title: 'Ceremony, outside', weddingVendorId: F.wedVendorA1 }),
    )
    expect(again.ok).toBe(true)
    const data = await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1))
    expect(data?.items[0]?.vendorName).toBe('Traiteur A')
    expect(data?.vendors).toEqual([])
  })

  it('re-places the item when its time changes, and not when only its title does', async () => {
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ startsAt: '17:00' }),
    )
    await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA1,
      input({ startsAt: '18:00', title: 'Ceremony' }),
    )
    expect(await titles(owner)).toEqual(['Drinks', 'Ceremony'])

    await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA1,
      input({ startsAt: '18:00', title: 'Ceremony (renamed)' }),
    )
    expect(await titles(owner)).toEqual(['Drinks', 'Ceremony (renamed)'])
  })

  it('leaves an item after midnight where it is', async () => {
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ startsAt: '21:00', title: 'Dance' }),
    )
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ startsAt: '01:00', title: 'Last song' }),
    )
    // The 01:00 lands first (the clock cannot tell it from a morning item); the planner moves it.
    expect(await titles(owner)).toEqual(['Last song', 'Ceremony', 'Dance'])
    const last = (await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1)))?.items[0]?.id ?? ''
    await moveRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), last, 'down')
    await moveRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), last, 'down')
    expect(await titles(owner)).toEqual(['Ceremony', 'Dance', 'Last song'])

    // Now after midnight: editing its time to 01:30 must not drag it back to the front.
    await updateRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      last,
      input({ startsAt: '01:30', title: 'Last song' }),
    )
    expect(await titles(owner)).toEqual(['Ceremony', 'Dance', 'Last song'])
  })

  it('refuses a caller with no standing', async () => {
    const r = await updateRunSheetItem(
      WeddingScope.of(h.db, couple, F.orgA, A1),
      F.runItemA1,
      input(),
    )
    expect(r).toEqual({ ok: false, reason: 'notFound' })
    expect(await titles(owner)).toEqual(['Ceremony'])
  })
})

describe('moveRunSheetItem', () => {
  it('swaps with the neighbour, and does nothing past either end', async () => {
    await createRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.eventA1,
      input({ startsAt: '17:00' }),
    )
    expect(await titles(owner)).toEqual(['Ceremony', 'Drinks'])

    await moveRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), F.runItemA1, 'down')
    expect(await titles(owner)).toEqual(['Drinks', 'Ceremony'])

    const end = await moveRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      F.runItemA1,
      'down',
    )
    expect(end.ok).toBe(true)
    expect(await titles(owner)).toEqual(['Drinks', 'Ceremony'])

    await moveRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), F.runItemA1, 'up')
    expect(await titles(owner)).toEqual(['Ceremony', 'Drinks'])
  })

  it('moves one step even when the rows all share position 0', async () => {
    // What the F1 seed and any hand-written row look like: ties everywhere.
    await seedExec(
      `insert into run_sheet_items (id, org_id, wedding_id, event_id, starts_at, duration_min, title, position)
       values ('99999999-0000-0000-0000-0000000000c1', $1, $2, $3, '16:00', 20, 'Photos', 0)`,
      [F.orgA, A1, F.eventA1],
    )
    expect(await titles(owner)).toEqual(['Ceremony', 'Photos'])
    await moveRunSheetItem(
      WeddingScope.of(h.db, owner, F.orgA, A1),
      '99999999-0000-0000-0000-0000000000c1',
      'up',
    )
    expect(await titles(owner)).toEqual(['Photos', 'Ceremony'])
  })

  it('will not move an item of a sibling wedding', async () => {
    const r = await moveRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), F.runItemA2, 'up')
    expect(r).toEqual({ ok: false, reason: 'itemNotFound' })
  })
})

describe('deleteRunSheetItem', () => {
  it('deletes the row', async () => {
    const r = await deleteRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), F.runItemA1)
    expect(r.ok).toBe(true)
    expect(await titles(owner)).toEqual([])
  })

  it('will not delete an item of a sibling wedding, or for a caller with no standing', async () => {
    expect(await deleteRunSheetItem(WeddingScope.of(h.db, owner, F.orgA, A1), F.runItemA2)).toEqual(
      {
        ok: false,
        reason: 'itemNotFound',
      },
    )
    expect(
      await deleteRunSheetItem(WeddingScope.of(h.db, couple, F.orgA, A1), F.runItemA1),
    ).toEqual({
      ok: false,
      reason: 'notFound',
    })
    expect(await titles(owner, A2)).toEqual(['First dance'])
    expect(await titles(owner)).toEqual(['Ceremony'])
  })
})

describe('shiftRunSheetTimes (spec 0009 B2)', () => {
  const DINNER = '99999999-0000-0000-0000-0000000000d1'
  const CAKE = '99999999-0000-0000-0000-0000000000d2'
  const LAST = '99999999-0000-0000-0000-0000000000d3'
  const BRUNCH_DAY = '44444444-0000-0000-0000-0000000000d1'

  /** "title HH:MM" for every item of the wedding, in reading order, events in id order. */
  async function clocks(weddingId: string = A1): Promise<string[]> {
    const data = await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, weddingId))
    return (data?.items ?? [])
      .slice()
      .sort((a, b) => a.eventId.localeCompare(b.eventId))
      .map((i) => `${i.title} ${i.startsAt}`)
  }

  // A sheet that runs past midnight, written with explicit positions so the 00:30 sits where a
  // planner moved it (after the evening) and not where the clock would put a new one; and a
  // second day of the same wedding, whose item starts later than everything shifted.
  beforeEach(async () => {
    await seedExec(
      `insert into run_sheet_items (id, org_id, wedding_id, event_id, starts_at, duration_min, title, position)
       values ($1, $4, $5, $6, '19:00', 120, 'Dinner', 1),
              ($2, $4, $5, $6, '23:50', 20, 'Cake', 2),
              ($3, $4, $5, $6, '00:30', 30, 'Last song', 3)`,
      [DINNER, CAKE, LAST, F.orgA, A1, F.eventA1],
    )
    await seedExec(
      `insert into wedding_events (id, org_id, wedding_id, label, starts_on) values ($1, $2, $3, 'Brunch', '2027-06-13')`,
      [BRUNCH_DAY, F.orgA, A1],
    )
    await seedExec(
      `insert into run_sheet_items (id, org_id, wedding_id, event_id, starts_at, duration_min, title, position)
       values ('99999999-0000-0000-0000-0000000000d4', $1, $2, $3, '20:00', 60, 'Brunch', 0)`,
      [F.orgA, A1, BRUNCH_DAY],
    )
  })

  it('moves this item and every later one in its event, wrapping past midnight, order and length kept', async () => {
    const before = await clocks()
    expect(before).toEqual([
      'Ceremony 15:30',
      'Dinner 19:00',
      'Cake 23:50',
      'Last song 00:30',
      'Brunch 20:00',
    ])
    const r = await shiftRunSheetTimes(WeddingScope.of(h.db, owner, F.orgA, A1), DINNER, 15)
    expect(r).toEqual({ ok: true, value: { id: DINNER, moved: 3 } })
    // The item above is untouched, 23:50 wraps to 00:05, and the other day of the same wedding
    // -- whose 20:00 is "after" by the clock -- is not part of this sheet.
    expect(await clocks()).toEqual([
      'Ceremony 15:30',
      'Dinner 19:15',
      'Cake 00:05',
      'Last song 00:45',
      'Brunch 20:00',
    ])
    const data = await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1))
    const day = (data?.items ?? []).filter((i) => i.eventId === F.eventA1)
    expect(day.map((i) => i.position)).toEqual([0, 1, 2, 3])
    expect(day.map((i) => i.durationMin)).toEqual([40, 120, 20, 30])
    expect(await clocks(A2)).toEqual(['First dance 21:00'])
  })

  it('wraps backwards too, and an assigned member may shift', async () => {
    const r = await shiftRunSheetTimes(WeddingScope.of(h.db, member, F.orgA, A1), CAKE, -60)
    expect(r).toEqual({ ok: true, value: { id: CAKE, moved: 2 } })
    expect(await clocks()).toEqual([
      'Ceremony 15:30',
      'Dinner 19:00',
      'Cake 22:50',
      'Last song 23:30',
      'Brunch 20:00',
    ])
  })

  it('refuses a backward shift that starts the item before the one above it, and allows a tie', async () => {
    const scope = WeddingScope.of(h.db, owner, F.orgA, A1)
    // Dinner 19:00 to 14:55 would sit under a 15:30 ceremony, and the clock would read the
    // whole tail as the next day. Nothing moves.
    expect(await shiftRunSheetTimes(scope, DINNER, -245)).toEqual({
      ok: false,
      reason: 'shiftCrossesPrevious',
    })
    // Across midnight the gap is the 40 minutes it reads as, not -1400: 00:30 may come back to
    // the cake's 23:50 and no further.
    expect(await shiftRunSheetTimes(scope, LAST, -41)).toEqual({
      ok: false,
      reason: 'shiftCrossesPrevious',
    })
    expect(await clocks()).toEqual([
      'Ceremony 15:30',
      'Dinner 19:00',
      'Cake 23:50',
      'Last song 00:30',
      'Brunch 20:00',
    ])

    // An equal start is two things at once, which the sheet already reads as the same day.
    expect((await shiftRunSheetTimes(scope, LAST, -40)).ok).toBe(true)
    expect((await shiftRunSheetTimes(scope, DINNER, -210)).ok).toBe(true)
    expect(await clocks()).toEqual([
      'Ceremony 15:30',
      'Dinner 15:30',
      'Cake 20:20',
      'Last song 20:20',
      'Brunch 20:00',
    ])
  })

  it('pins the order on tied positions, so a tail shifted past midnight stays where it was', async () => {
    // The seed's shape: every row at position 0, so the clock breaks the tie and 00:30 reads
    // first. Shifting Dinner by five hours puts it at 00:00, which a clock tie-break would sort
    // to the top; the shift must write the order it read before it moves a time.
    await seedExec(`update run_sheet_items set position = 0 where event_id = $1`, [F.eventA1])
    const scope = WeddingScope.of(h.db, owner, F.orgA, A1)
    const r = await shiftRunSheetTimes(scope, DINNER, 300)
    expect(r).toEqual({ ok: true, value: { id: DINNER, moved: 2 } })
    const day = ((await getRunSheet(scope))?.items ?? []).filter((i) => i.eventId === F.eventA1)
    expect(day.map((i) => `${i.title} ${i.startsAt}`)).toEqual([
      'Last song 00:30',
      'Ceremony 15:30',
      'Dinner 00:00',
      'Cake 04:50',
    ])
    expect(day.map((i) => i.position)).toEqual([0, 1, 2, 3])
  })

  it('cuts the tail by reading order when the rows share a position', async () => {
    // The seed's shape: every row at position 0, so `ORDER`'s tie-break decides what is after.
    await seedExec(`update run_sheet_items set position = 0 where event_id = $1`, [F.eventA1])
    const order = (await getRunSheet(WeddingScope.of(h.db, owner, F.orgA, A1)))?.items
      .filter((i) => i.eventId === F.eventA1)
      .map((i) => i.id)
    const second = order?.[1] ?? ''
    const r = await shiftRunSheetTimes(WeddingScope.of(h.db, owner, F.orgA, A1), second, 5)
    expect(r.ok && r.value.moved).toBe((order?.length ?? 0) - 1)
  })

  it('will not shift an item of a sibling wedding, even for the org-wide owner', async () => {
    const r = await shiftRunSheetTimes(WeddingScope.of(h.db, owner, F.orgA, A1), F.runItemA2, 30)
    expect(r).toEqual({ ok: false, reason: 'itemNotFound' })
    expect(await clocks(A2)).toEqual(['First dance 21:00'])
  })

  it('writes nothing for a caller with no standing: couple, unassigned member, another org', async () => {
    const none = { ok: false, reason: 'notFound' }
    expect(
      await shiftRunSheetTimes(WeddingScope.of(h.db, couple, F.orgA, A1), F.runItemA1, 30),
    ).toEqual(none)
    expect(
      await shiftRunSheetTimes(WeddingScope.of(h.db, member, F.orgA, A2), F.runItemA2, 30),
    ).toEqual(none)
    expect(
      await shiftRunSheetTimes(WeddingScope.of(h.db, otherOrgOwner, F.orgA, A1), F.runItemA1, 30),
    ).toEqual(none)
    // The other org's owner claiming A1 under its OWN org: a real principal, whose policy hides
    // the row, so the refusal is the repo's "not found" for the item rather than the scope's.
    const own = await shiftRunSheetTimes(
      WeddingScope.of(h.db, otherOrgOwner, F.orgB, A1),
      F.runItemA1,
      30,
    )
    expect(own).toEqual({ ok: false, reason: 'itemNotFound' })
    expect((await clocks())[0]).toBe('Ceremony 15:30')
    expect(await clocks(A2)).toEqual(['First dance 21:00'])
  })

  it('refuses a delta that is zero, fractional or past half a day, before touching the database', async () => {
    const scope = WeddingScope.of(h.db, owner, F.orgA, A1)
    for (const bad of [0, 1.5, 721, -721, Number.NaN]) {
      await expect(shiftRunSheetTimes(scope, F.runItemA1, bad)).rejects.toThrow(RangeError)
    }
    await expect(shiftRunSheetTimes(scope, F.runItemA1, -720)).resolves.toMatchObject({ ok: true })
    expect((await clocks())[0]).toBe('Ceremony 03:30')
  })
})
