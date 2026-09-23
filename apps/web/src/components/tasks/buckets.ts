import type { TaskRow } from '@guestnote/db'

/**
 * The checklist's grouping and filtering, pure and with no import of `@guestnote/db` at runtime
 * (the `import type` above is erased): a client component uses this file, and the barrel drags
 * `postgres` into any bundle that touches it.
 *
 * ## "Today" is the Brussels civil date, and it is an argument
 *
 * Every function takes `today` as `YYYY-MM-DD` instead of reading a clock. A Lambda runs in UTC
 * and a laptop does not, so a clock read in here makes the same wedding disagree with itself
 * between staging and a dev machine (`lib/tminus.ts` argues the same for the sidebar
 * countdown). The page reads the clock once, with `lib/tminus.ts`'s `todayCivil`, and passes it down.
 *
 * Task DATES are UTC civil dates (`TaskRow.dueDate`); only "which day is it now" is Brussels.
 * Those two only disagree for the two hours around midnight, and then a task due "today" flips
 * bucket at Belgian midnight, which is what a Belgian planner expects.
 */

export const BUCKETS = ['overdue', 'soon', 'later', 'undated', 'done'] as const
export type Bucket = (typeof BUCKETS)[number]

export const FILTERS = ['all', 'open', 'overdue', 'internal', 'shared'] as const
export type Filter = (typeof FILTERS)[number]

/** How far ahead "soon" reaches, inclusive: today up to and including today + 14. */
export const SOON_DAYS = 14

const DAY_MS = 86_400_000

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
}

/** `YYYY-MM-DD` plus whole days, in UTC. The web-side twin of `taskAddDays` in the repo. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

type Dated = Pick<TaskRow, 'status' | 'dueDate'>

export function isOpen(task: Pick<TaskRow, 'status'>): boolean {
  return task.status !== 'done'
}

export function isOverdue(task: Dated, today: string): boolean {
  return isOpen(task) && task.dueDate !== null && task.dueDate < today
}

export function bucketOf(task: Dated, today: string): Bucket {
  if (!isOpen(task)) return 'done'
  if (task.dueDate === null) return 'undated'
  if (task.dueDate < today) return 'overdue'
  return task.dueDate <= addDays(today, SOON_DAYS) ? 'soon' : 'later'
}

/** An unknown or missing `?filter=` is `all`: a stale link should show the list, not nothing. */
export function parseFilter(value: unknown): Filter {
  const v = Array.isArray(value) ? value[0] : value
  return (FILTERS as readonly unknown[]).includes(v) ? (v as Filter) : 'all'
}

export function matchesFilter(task: TaskRow, filter: Filter, today: string): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'open':
      return isOpen(task)
    case 'overdue':
      return isOverdue(task, today)
    case 'internal':
      return task.visibility === 'internal'
    case 'shared':
      return task.visibility === 'shared'
  }
}

/** Counts are always for the whole wedding, never the filtered view. */
export function filterCounts(tasks: readonly TaskRow[], today: string): Record<Filter, number> {
  const counts: Record<Filter, number> = { all: 0, open: 0, overdue: 0, internal: 0, shared: 0 }
  for (const filter of FILTERS) {
    counts[filter] = tasks.filter((t) => matchesFilter(t, filter, today)).length
  }
  return counts
}

export type TaskGroup = { readonly bucket: Bucket; readonly tasks: TaskRow[] }

/**
 * The filtered tasks in bucket order. Empty buckets are dropped. Order inside a bucket is the
 * repo's `compareTasks` order, which `listTasks` already applied: this keeps it by walking the
 * input once and never sorting again.
 */
export function groupTasks(tasks: readonly TaskRow[], filter: Filter, today: string): TaskGroup[] {
  const groups = new Map<Bucket, TaskRow[]>(BUCKETS.map((b) => [b, []]))
  for (const task of tasks) {
    if (matchesFilter(task, filter, today)) groups.get(bucketOf(task, today))?.push(task)
  }
  return BUCKETS.map((bucket) => ({ bucket, tasks: groups.get(bucket) ?? [] })).filter(
    (g) => g.tasks.length > 0,
  )
}
