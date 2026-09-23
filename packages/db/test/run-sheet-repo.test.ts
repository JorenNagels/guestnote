import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createRunSheetItem,
  deleteRunSheetItem,
  getRunSheet,
  type Memberships,
  moveRunSheetItem,
  type RunSheetInput,
  resolveMemberships,
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
