import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { newId } from '../id.ts'
import { runSheetItems, weddingEvents } from '../schema/events.ts'
import { vendors, weddingVendors } from '../schema/vendors.ts'
import { weddings } from '../schema/weddings.ts'
import { type TenantDb, withTenant } from '../tenant.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

/**
 * Slice S9 of docs/specs/0003-planner-app-screens.md: the run sheet, one list of items per event.
 *
 * Who may reach it is `staffPrincipal`'s answer, as for every slice: owner, admin, an assigned
 * member, never a couple. A `null` or a refusal means "no standing or not found", which the
 * page renders as 404.
 *
 * ## Order is `position`, and the clock only decides where a new item starts
 *
 * `starts_at` is a bare `time`, so a sheet that runs past midnight cannot be sorted by it
 * (`schema/events.ts`). The order is therefore the stored `position`, and the list is read in that
 * order. `clockInsertIndex` is the one place the clock is consulted: it puts an item where a
 * planner typing times in would expect it. Rejected: sorting by `starts_at` on read, which
 * would put 01:30 before the 09:00 it follows; and a `day_offset` column, which is a migration
 * this slice may not write and one more field on a form that has to stay faster than a spreadsheet.
 *
 * ## Parent-read rule (spec 0003, "Shared rules")
 *
 * The foreign keys are plain, so Postgres accepts an `event_id` or `wedding_vendor_id` the caller
 * cannot read, and an org-wide principal's policy admits any wedding in the org. Every write
 * therefore reads the event and the vendor link under the same transaction and refuses when
 * either is not a live row of THIS wedding.
 */

export type RunSheetItem = {
  readonly id: string
  readonly eventId: string
  /** `HH:MM`, a wall-clock time. Postgres returns `HH:MM:SS`; cut here. */
  readonly startsAt: string
  readonly durationMin: number
  readonly title: string
  readonly place: string | null
  /** A `wedding_vendors` id, which is what the row stores. */
  readonly weddingVendorId: string | null
  /** The vendor's directory name, even if the vendor was later removed from the wedding. */
  readonly vendorName: string | null
  readonly position: number
}

/** One entry in the vendor picker. `id` is the `wedding_vendors` id. */
export type RunSheetVendor = {
  readonly id: string
  readonly name: string
  readonly category: string
}

export type RunSheetInput = {
  /** `HH:MM`. */
  readonly startsAt: string
  /** At least 1; the table's CHECK is `duration_min > 0`. */
  readonly durationMin: number
  readonly title: string
  readonly place: string | null
  readonly weddingVendorId: string | null
}

export type RunSheetFailure = 'notFound' | 'eventNotFound' | 'vendorNotFound' | 'itemNotFound'

export type RunSheetResult = Result<{ readonly id: string }, RunSheetFailure>

/**
 * Where a new time goes among the items already there, as the index to insert at.
 *
 * "Among the items before the first midnight rollover": the first item whose clock is earlier than
 * its predecessor's marks where the list wraps past midnight, and nothing after it is compared.
 * So 22:30 goes after 21:00 and before a 01:30 that is already there, instead of being sorted
 * in front of it. Equal times go after the existing ones, so entering a run of items keeps the
 * order they were typed in.
 *
 * `HH:MM` strings compare correctly as text, which is why this takes them and not minutes.
 */
export function clockInsertIndex(startsAts: readonly string[], clock: string): number {
  const dayEnd = firstRolloverIndex(startsAts)
  for (let i = 0; i < dayEnd; i++) {
    if ((startsAts[i] ?? '') > clock) return i
  }
  return dayEnd
}

/** The index of the first item whose clock is earlier than its predecessor's, else the length. */
export function firstRolloverIndex(startsAts: readonly string[]): number {
  for (let i = 1; i < startsAts.length; i++) {
    if ((startsAts[i] ?? '') < (startsAts[i - 1] ?? '')) return i
  }
  return startsAts.length
}

const COLUMNS = {
  id: runSheetItems.id,
  eventId: runSheetItems.eventId,
  startsAt: runSheetItems.startsAt,
  durationMin: runSheetItems.durationMin,
  title: runSheetItems.title,
  place: runSheetItems.place,
  weddingVendorId: runSheetItems.weddingVendorId,
  position: runSheetItems.position,
}

/**
 * `position` first, then the clock and the id: rows the F1 seed wrote all carry position 0, and
 * a tie must resolve the same way on every read or a move would swap the wrong pair.
 */
const ORDER = [asc(runSheetItems.position), asc(runSheetItems.startsAt), asc(runSheetItems.id)]

/**
 * Everything the run sheet draws for one wedding: the items of every live event, and the
 * vendors to pick from. One transaction. `null` is a 404.
 *
 * Items of a soft-deleted event are left out by the join and kept in the table, so restoring
 * an event restores its sheet (S1's `listWeddingEvents` says the same from its side).
 */
export async function getRunSheet(
  scope: WeddingScope,
): Promise<{ items: RunSheetItem[]; vendors: RunSheetVendor[] } | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const wedding = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (wedding.length === 0) return null

    const rows = await tx
      .select({ ...COLUMNS, vendorName: vendors.name })
      .from(runSheetItems)
      .innerJoin(
        weddingEvents,
        and(eq(weddingEvents.id, runSheetItems.eventId), isNull(weddingEvents.deletedAt)),
      )
      .leftJoin(weddingVendors, eq(weddingVendors.id, runSheetItems.weddingVendorId))
      .leftJoin(vendors, eq(vendors.id, weddingVendors.vendorId))
      .where(eq(runSheetItems.weddingId, weddingId))
      .orderBy(...ORDER)

    const options = await tx
      .select({ id: weddingVendors.id, name: vendors.name, category: vendors.category })
      .from(weddingVendors)
      .innerJoin(vendors, eq(vendors.id, weddingVendors.vendorId))
      .where(
        and(
          eq(weddingVendors.weddingId, weddingId),
          isNull(weddingVendors.deletedAt),
          isNull(vendors.deletedAt),
        ),
      )
      .orderBy(asc(sql`lower(${vendors.name})`), asc(weddingVendors.id))

    return {
      items: rows.map((r) => ({ ...r, startsAt: r.startsAt.slice(0, 5) })),
      vendors: options,
    }
  })
}

async function liveWedding(tx: TenantDb, weddingId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: weddings.id })
    .from(weddings)
    .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
  return rows.length > 0
}

async function liveEvent(tx: TenantDb, weddingId: string, eventId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: weddingEvents.id })
    .from(weddingEvents)
    .where(
      and(
        eq(weddingEvents.id, eventId),
        eq(weddingEvents.weddingId, weddingId),
        isNull(weddingEvents.deletedAt),
      ),
    )
  return rows.length > 0
}

/** A vendor link of THIS wedding that is not removed. */
async function liveVendorLink(tx: TenantDb, weddingId: string, linkId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: weddingVendors.id })
    .from(weddingVendors)
    .where(
      and(
        eq(weddingVendors.id, linkId),
        eq(weddingVendors.weddingId, weddingId),
        isNull(weddingVendors.deletedAt),
      ),
    )
  return rows.length > 0
}

type Slot = { id: string; startsAt: string; position: number }

/** The event's items in reading order, as the minimum the ordering code needs. */
async function slotsOf(tx: TenantDb, weddingId: string, eventId: string): Promise<Slot[]> {
  const rows = await tx
    .select({
      id: runSheetItems.id,
      startsAt: runSheetItems.startsAt,
      position: runSheetItems.position,
    })
    .from(runSheetItems)
    .where(and(eq(runSheetItems.weddingId, weddingId), eq(runSheetItems.eventId, eventId)))
    .orderBy(...ORDER)
  return rows.map((r) => ({ ...r, startsAt: r.startsAt.slice(0, 5) }))
}

/**
 * Writes `ids` back as positions 0..n-1, touching only the rows whose position is not already
 * right. One statement however many rows moved, so a middle insert in a long sheet is one round
 * trip and not thirty. The `::int` is load-bearing: an untyped parameter in a `case` resolves
 * to text and Postgres refuses to assign it to an integer column.
 */
async function writeOrder(
  tx: TenantDb,
  weddingId: string,
  ids: readonly string[],
  current: ReadonlyMap<string, number>,
): Promise<void> {
  const changed = ids
    .map((id, index) => ({ id, index }))
    .filter((c) => current.get(c.id) !== c.index)
  if (changed.length === 0) return
  const cases = sql.join(
    changed.map((c) => sql`when ${c.id}::uuid then ${c.index}::int`),
    sql` `,
  )
  await tx
    .update(runSheetItems)
    .set({ position: sql`case ${runSheetItems.id} ${cases} end`, updatedAt: new Date() })
    .where(
      and(
        eq(runSheetItems.weddingId, weddingId),
        inArray(
          runSheetItems.id,
          changed.map((c) => c.id),
        ),
      ),
    )
}

const positions = (slots: readonly Slot[]) => new Map(slots.map((s) => [s.id, s.position]))

export async function createRunSheetItem(
  scope: WeddingScope,
  eventId: string,
  input: RunSheetInput,
): Promise<RunSheetResult> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    if (!(await liveWedding(tx, weddingId))) return fail('notFound')
    if (!(await liveEvent(tx, weddingId, eventId))) return fail('eventNotFound')
    if (input.weddingVendorId && !(await liveVendorLink(tx, weddingId, input.weddingVendorId))) {
      return fail('vendorNotFound')
    }

    const slots = await slotsOf(tx, weddingId, eventId)
    const index = clockInsertIndex(
      slots.map((s) => s.startsAt),
      input.startsAt,
    )
    const id = newId()
    // The new row goes in first at its final index and the rows behind it shift after, so the
    // list has no moment with two items at one position that another reader could see.
    await tx.insert(runSheetItems).values({
      id,
      orgId,
      weddingId,
      eventId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      title: input.title,
      place: input.place,
      weddingVendorId: input.weddingVendorId,
      position: index,
    })
    const order = slots.map((s) => s.id)
    order.splice(index, 0, id)
    await writeOrder(tx, weddingId, order, new Map([...positions(slots), [id, index]]))
    return ok({ id })
  })
}

/**
 * The event is never changed by an edit: moving an item between days is delete and add.
 *
 * A change of start time re-places the item by the clock when it sits before the first
 * midnight rollover. An item after midnight keeps its place, because re-placing it by its
 * bare `HH:MM` would drag it back in front of the evening. Other edits never move it.
 */
export async function updateRunSheetItem(
  scope: WeddingScope,
  itemId: string,
  input: RunSheetInput,
): Promise<RunSheetResult> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const found = await tx
      .select({
        eventId: runSheetItems.eventId,
        startsAt: runSheetItems.startsAt,
        weddingVendorId: runSheetItems.weddingVendorId,
      })
      .from(runSheetItems)
      .where(and(eq(runSheetItems.id, itemId), eq(runSheetItems.weddingId, weddingId)))
    const existing = found[0]
    if (!existing) return fail('itemNotFound')

    // An unchanged vendor is not re-checked: it may have been removed from the wedding since,
    // and refusing the save would make every other edit to that row impossible.
    if (
      input.weddingVendorId &&
      input.weddingVendorId !== existing.weddingVendorId &&
      !(await liveVendorLink(tx, weddingId, input.weddingVendorId))
    ) {
      return fail('vendorNotFound')
    }

    // Read the order BEFORE the update: the rollover test is about where the item sits now, and
    // its new time would move the rollover it is being tested against.
    const timeChanged = existing.startsAt.slice(0, 5) !== input.startsAt
    const slots = timeChanged ? await slotsOf(tx, weddingId, existing.eventId) : []

    await tx
      .update(runSheetItems)
      .set({
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        title: input.title,
        place: input.place,
        weddingVendorId: input.weddingVendorId,
        updatedAt: new Date(),
      })
      .where(and(eq(runSheetItems.id, itemId), eq(runSheetItems.weddingId, weddingId)))

    const at = slots.findIndex((s) => s.id === itemId)
    if (timeChanged && at !== -1 && at < firstRolloverIndex(slots.map((s) => s.startsAt))) {
      const others = slots.filter((s) => s.id !== itemId)
      const index = clockInsertIndex(
        others.map((s) => s.startsAt),
        input.startsAt,
      )
      const order = others.map((s) => s.id)
      order.splice(index, 0, itemId)
      await writeOrder(tx, weddingId, order, positions(slots))
    }
    return ok({ id: itemId })
  })
}

/** Hard delete: the table has no `deleted_at`, and a run sheet line is cheap to type again. */
export async function deleteRunSheetItem(
  scope: WeddingScope,
  itemId: string,
): Promise<RunSheetResult> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .delete(runSheetItems)
      .where(and(eq(runSheetItems.id, itemId), eq(runSheetItems.weddingId, weddingId)))
      .returning({ id: runSheetItems.id }),
  )
  return rows.length === 0 ? fail('itemNotFound') : ok({ id: itemId })
}

/**
 * Swaps an item with its neighbour. At the end of the list it is a no-op that still answers ok,
 * so a double tap on the last row is not an error. The whole event is renumbered from its read
 * order, which is what makes a tie in `position` (the seed's, all zero) move one step and not none.
 */
export async function moveRunSheetItem(
  scope: WeddingScope,
  itemId: string,
  direction: 'up' | 'down',
): Promise<RunSheetResult> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const found = await tx
      .select({ eventId: runSheetItems.eventId })
      .from(runSheetItems)
      .where(and(eq(runSheetItems.id, itemId), eq(runSheetItems.weddingId, weddingId)))
    const eventId = found[0]?.eventId
    if (!eventId) return fail('itemNotFound')

    const slots = await slotsOf(tx, weddingId, eventId)
    const order = slots.map((s) => s.id)
    const at = order.indexOf(itemId)
    const to = direction === 'up' ? at - 1 : at + 1
    const a = order[at]
    const b = order[to]
    if (a === undefined || b === undefined) return ok({ id: itemId })
    order[at] = b
    order[to] = a
    await writeOrder(tx, weddingId, order, positions(slots))
    return ok({ id: itemId })
  })
}
