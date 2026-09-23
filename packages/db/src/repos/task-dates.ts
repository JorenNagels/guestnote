import type { TaskDue } from './tasks.ts'

/**
 * A task's due date: the pure arithmetic under `tasks.ts`, split out of it (PR #1 review) so the
 * repo file is queries and this is dates. No database, no principal -- tested without either.
 */

const DAY_MS = 86_400_000

/** Ten years each way. A typo of an extra digit is the failure this catches. */
const MAX_OFFSET_DAYS = 3650

// ---------------------------------------------------------------- pure helpers ----

function assertCivilDate(date: string): number {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN
  // `Date.parse` rolls 2027-02-31 over to March, so the round trip is the real check.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`tasks: "${date}" is not a calendar date (YYYY-MM-DD)`)
  }
  return ms
}

/** `YYYY-MM-DD` plus whole days, in UTC. No DST exists there, so a day is always 86 400 s. */
export function taskAddDays(date: string, days: number): string {
  return new Date(assertCivilDate(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The date a task falls on. Offset first: the whole point of storing T-minus is that a
 * wedding which moves takes its tasks with it, and a stale `due_at` must not outvote that.
 *
 * `weddingDate` is a `date` column, so it arrives as `YYYY-MM-DD` and is read as UTC midnight;
 * it is a civil date and never shifts with a zone (see `weddings.wedding_date`).
 */
export function resolveTaskDueDate(
  task: { dueOffsetDays: number | null; dueAt: Date | null },
  weddingDate: string | null,
): string | null {
  if (task.dueOffsetDays !== null) {
    return weddingDate === null ? null : taskAddDays(weddingDate, task.dueOffsetDays)
  }
  return task.dueAt === null ? null : task.dueAt.toISOString().slice(0, 10)
}

/** 12:00 UTC, the seed's convention: the same civil date in every zone from Honolulu to Auckland. */
const noonUtc = (date: string): Date => new Date(assertCivilDate(date) + DAY_MS / 2)

/**
 * The two stored columns for a `TaskDue`. `dueAt` is written for an offset task too, so the
 * `(org_id, due_at)` index serves the cross-wedding "due this week" screen; reads never trust
 * it (`resolveTaskDueDate`). It goes stale if `wedding_date` changes, until the task is next
 * saved -- the price of not putting a trigger on `weddings`.
 */
export function taskDueColumns(
  due: TaskDue,
  weddingDate: string | null,
): { dueOffsetDays: number | null; dueAt: Date | null } {
  if (due.kind === 'none') return { dueOffsetDays: null, dueAt: null }
  if (due.kind === 'date') return { dueOffsetDays: null, dueAt: noonUtc(due.date) }
  if (!Number.isInteger(due.days) || Math.abs(due.days) > MAX_OFFSET_DAYS) {
    throw new RangeError(`tasks: an offset must be a whole number within ${MAX_OFFSET_DAYS} days`)
  }
  return {
    dueOffsetDays: due.days,
    dueAt: weddingDate === null ? null : noonUtc(taskAddDays(weddingDate, due.days)),
  }
}
