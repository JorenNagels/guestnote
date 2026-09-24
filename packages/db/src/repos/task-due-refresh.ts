import { and, eq, isNull, sql } from 'drizzle-orm'
import { weddingEvents } from '../schema/events.ts'
import { tasks } from '../schema/tasks.ts'
import { weddings } from '../schema/weddings.ts'
import type { TenantDb } from '../tenant.ts'

/**
 * Not in the barrel on purpose, like `staff-principal.ts`: it is a helper for the repos that move
 * a date (`weddings.ts`, `events.ts`), and nothing outside `packages/db` has a reason to rewrite a
 * derived column. It takes a `TenantDb`, so it runs under the caller's policies either way.
 */

/**
 * Rewrites `due_at` for every live offset task of one wedding from what it counts from now: its
 * anchor event's date, else the wedding date (spec 0004). Called in the same transaction as every
 * write that moves one of those dates -- `updateWedding`, `updateWeddingEvent`,
 * `deleteWeddingEvent` -- so the copy that the overview's overdue count, the unreadable-anchor
 * fallback in `resolveTaskDueDate` and a future couple reader use is not stale.
 *
 * In the repo and not a trigger on `weddings`/`wedding_events`: the three writers are all in this
 * package and already hold one transaction, and a trigger would run the rewrite under whatever
 * role and GUCs the writing session had, invisibly to the repo. Cost: a date written by any other
 * path (a hand-run SQL fix, a future import) leaves `due_at` stale until the next repo write --
 * `tasks-repo.test.ts` shows exactly that by moving the date with a raw UPDATE.
 *
 * One statement for the whole wedding rather than the tasks of one event: a wedding has tens to
 * low hundreds of tasks, and one rule for every caller is one rule to get right. The noon-UTC
 * arithmetic must equal `taskDueColumns`; `anchors-owners.test.ts` asserts the exact noon-UTC
 * instant it writes after an event and a wedding date move.
 */
export async function refreshTaskDueAt(tx: TenantDb, weddingId: string): Promise<void> {
  const base = sql`coalesce(
    (select ${weddingEvents.startsOn} from ${weddingEvents}
      where ${weddingEvents.id} = ${tasks.anchorEventId}
        and ${weddingEvents.weddingId} = ${tasks.weddingId}
        and ${weddingEvents.deletedAt} is null),
    (select ${weddings.weddingDate} from ${weddings} where ${weddings.id} = ${tasks.weddingId})
  )`
  await tx
    .update(tasks)
    .set({
      dueAt: sql`((${base} + ${tasks.dueOffsetDays})::timestamp + interval '12 hours') at time zone 'UTC'`,
    })
    .where(
      and(
        eq(tasks.weddingId, weddingId),
        sql`${tasks.dueOffsetDays} is not null`,
        isNull(tasks.deletedAt),
      ),
    )
}
