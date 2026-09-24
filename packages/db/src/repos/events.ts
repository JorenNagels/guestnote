import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { newId } from '../id.ts'
import { weddingEvents } from '../schema/events.ts'
import { tasks } from '../schema/tasks.ts'
import { weddings } from '../schema/weddings.ts'
import { withTenant } from '../tenant.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'
import { refreshTaskDueAt } from './task-due-refresh.ts'

/**
 * Slice S1 of docs/specs/0003-planner-app-screens.md: the events of one wedding.
 *
 * Every function takes the caller's `Memberships` and derives its own principal through
 * `staffPrincipal`, so a `null` / `[]` / `false` return means "no standing or not found" and the
 * page renders 404. A read here does not distinguish the two, for the reason `getWedding` gives.
 */

export type WeddingEvent = {
  readonly id: string
  readonly label: string
  /** `YYYY-MM-DD`, a civil date. */
  readonly startsOn: string
  /** `HH:MM`, a wall-clock time with no zone, or null. Postgres returns `HH:MM:SS`; cut here. */
  readonly startsAt: string | null
  readonly venue: string | null
  readonly position: number
}

export type WeddingEventInput = {
  readonly label: string
  readonly startsOn: string
  readonly startsAt: string | null
  readonly venue: string | null
}

const COLUMNS = {
  id: weddingEvents.id,
  label: weddingEvents.label,
  startsOn: weddingEvents.startsOn,
  startsAt: weddingEvents.startsAt,
  venue: weddingEvents.venue,
  position: weddingEvents.position,
}

type Row = {
  id: string
  label: string
  startsOn: string
  startsAt: string | null
  venue: string | null
  position: number
}

function toEvent(row: Row): WeddingEvent {
  return { ...row, startsAt: row.startsAt === null ? null : row.startsAt.slice(0, 5) }
}

/**
 * Soft-deleted rows are filtered here and not in a policy, as everywhere (`_shared.ts`).
 * S9 lists events for the run sheet and must apply the same filter: a removed event keeps its
 * run sheet items, on purpose, so removing an event is undoable.
 */
export async function listWeddingEvents(scope: WeddingScope): Promise<WeddingEvent[]> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return []

  const rows = await withTenant(db, principal, async (tx) =>
    tx
      .select(COLUMNS)
      .from(weddingEvents)
      .where(and(eq(weddingEvents.weddingId, weddingId), isNull(weddingEvents.deletedAt)))
      // No explicit `nulls last`: ascending order already puts NULL last in Postgres, which is
      // where an event with no time yet belongs ("some time that day"). Measured 2026-09-21: an
      // explicit `nulls last` here changed no result, so it was dropped rather than kept as noise.
      .orderBy(
        asc(weddingEvents.startsOn),
        asc(weddingEvents.startsAt),
        asc(weddingEvents.position),
      ),
  )
  return rows.map(toEvent)
}

/**
 * Adds an event at the end of the wedding's list.
 *
 * ## The parent is read first
 *
 * Foreign keys between the 0006 tables are plain, not composite (spec 0003, measured in the F1
 * audit), and Postgres runs a foreign-key check without row-level security. So for an
 * org-wide principal, whose `app.wedding_id` is unset, RLS alone would accept a `wedding_id`
 * belonging to another organisation with this organisation's `org_id` on the row. Reading the
 * wedding under this principal is what proves it is ours.
 */
export async function createWeddingEvent(
  scope: WeddingScope,
  input: WeddingEventInput,
): Promise<Result<WeddingEvent, 'notFound'>> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const parent = await tx
      .select({ id: weddings.id })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (parent.length === 0) return fail('notFound')

    const last = await tx
      .select({ n: sql<number>`coalesce(max(${weddingEvents.position}), -1)::int` })
      .from(weddingEvents)
      .where(and(eq(weddingEvents.weddingId, weddingId), isNull(weddingEvents.deletedAt)))

    const rows = await tx
      .insert(weddingEvents)
      .values({
        id: newId(),
        orgId,
        weddingId,
        label: input.label,
        startsOn: input.startsOn,
        startsAt: input.startsAt,
        venue: input.venue,
        position: (last[0]?.n ?? -1) + 1,
      })
      .returning(COLUMNS)
    const row = rows[0]
    return row ? ok(toEvent(row)) : fail('notFound')
  })
}

/** `notFound` when the event is not on this wedding, is removed, or the caller has no standing. */
export async function updateWeddingEvent(
  scope: WeddingScope,
  eventId: string,
  input: WeddingEventInput,
): Promise<Result<WeddingEvent, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const rows = await withTenant(db, principal, async (tx) => {
    const updated = await tx
      .update(weddingEvents)
      .set({
        label: input.label,
        startsOn: input.startsOn,
        startsAt: input.startsAt,
        venue: input.venue,
        updatedAt: new Date(),
      })
      // `wedding_id` is in the predicate for the org-wide principal, which RLS does not pin
      // to a wedding: without it an owner could edit any event in the org through any wedding's URL.
      .where(
        and(
          eq(weddingEvents.id, eventId),
          eq(weddingEvents.weddingId, weddingId),
          isNull(weddingEvents.deletedAt),
        ),
      )
      .returning(COLUMNS)
    // The tasks anchored here move with the event's date (spec 0004).
    if (updated[0]) await refreshTaskDueAt(tx, weddingId)
    return updated
  })
  const row = rows[0]
  return row ? ok(toEvent(row)) : fail('notFound')
}

/** Soft delete. `ok` when a row was removed. */
export async function deleteWeddingEvent(
  scope: WeddingScope,
  eventId: string,
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const rows = await withTenant(db, principal, async (tx) => {
    const removed = await tx
      .update(weddingEvents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(weddingEvents.id, eventId),
          eq(weddingEvents.weddingId, weddingId),
          isNull(weddingEvents.deletedAt),
        ),
      )
      .returning({ id: weddingEvents.id })
    if (removed.length === 0) return removed
    // Its tasks fall back to the main date (spec 0004): the anchor is cleared, not left pointing
    // at a removed row, so no reader has to guess what a dangling anchor means. Only after the
    // removal matched, so a wrong-wedding id touches no task either.
    await tx
      .update(tasks)
      .set({ anchorEventId: null, updatedAt: new Date() })
      .where(and(eq(tasks.anchorEventId, eventId), eq(tasks.weddingId, weddingId)))
    await refreshTaskDueAt(tx, weddingId)
    return removed
  })
  return rows.length > 0 ? ok(null) : fail('notFound')
}

/**
 * How many live tasks count from each event of this wedding, by event id; an event with none is
 * absent. What the settings page shows beside Remove ("3 taken tellen vanaf dit moment…", spec
 * 0004). One grouped query for the page, not one per event. Empty for a caller with no standing.
 */
export async function anchoredTaskCounts(scope: WeddingScope): Promise<Record<string, number>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return {}
  const rows = await withTenant(db, principal, (tx) =>
    tx
      .select({ eventId: tasks.anchorEventId, n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.weddingId, weddingId),
          isNull(tasks.deletedAt),
          sql`${tasks.anchorEventId} is not null`,
        ),
      )
      .groupBy(tasks.anchorEventId),
  )
  return Object.fromEntries(rows.flatMap((r) => (r.eventId ? [[r.eventId, r.n]] : [])))
}
