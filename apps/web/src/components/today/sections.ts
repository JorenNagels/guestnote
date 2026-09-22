import type { AssignedTaskRow, WeddingSummary } from '@guestnote/db'
import { addDays, daysBetween, isOpen } from '../tasks/buckets.ts'

/**
 * How the Today screen carves up a planner's open tasks. Pure, with no runtime import of
 * `@guestnote/db` (the `import type` is erased), and every function takes `today` as a
 * `YYYY-MM-DD` argument -- `tasks/buckets.ts` has the argument for that.
 *
 * Every date read here is `TaskRow.dueDate`, which the repo derives from the wedding's date for
 * an offset task. `dueAt` is never looked at: it is a stored copy that goes stale when a wedding
 * moves (`repos/tasks.ts`, `taskDueColumns`), and a screen whose whole job is "what is due" is
 * the one place where a stale date does the most harm.
 */

/** "This week" reaches tomorrow up to and including today + 7. */
export const WEEK_DAYS = 7

/** How many rows the "next" list shows. It is a glance at what is coming, not a second checklist. */
export const NEXT_COUNT = 5

export type TodaySections = {
  /** Due today or already late, most overdue first. */
  readonly needsYou: readonly AssignedTaskRow[]
  /** Tomorrow to today + 7. */
  readonly dueWeek: readonly AssignedTaskRow[]
  /** The next few dated tasks beyond the week. */
  readonly next: readonly AssignedTaskRow[]
  /** Open tasks with no resolvable date, which no list above can show. */
  readonly undated: number
}

/** Date first, then title, then id. The id makes the order total, so a tie never reshuffles a reload. */
function byDue(a: AssignedTaskRow, b: AssignedTaskRow): number {
  // Only called on dated rows: `undated` are split off before sorting.
  const d = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  if (d !== 0) return d
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

export function todaySections(tasks: readonly AssignedTaskRow[], today: string): TodaySections {
  const open = tasks.filter(isOpen)
  const dated = open.filter((t) => t.dueDate !== null).sort(byDue)
  const weekEnd = addDays(today, WEEK_DAYS)

  return {
    needsYou: dated.filter((t) => (t.dueDate ?? '') <= today),
    dueWeek: dated.filter((t) => (t.dueDate ?? '') > today && (t.dueDate ?? '') <= weekEnd),
    next: dated.filter((t) => (t.dueDate ?? '') > weekEnd).slice(0, NEXT_COUNT),
    undated: open.length - dated.length,
  }
}

export type WeddingLoad = { readonly overdue: number; readonly open: number }

/**
 * Per wedding, how many of THIS user's tasks are open and how many of those are late. A wedding
 * with no assigned tasks is simply absent: the caller reads a missing key as zero.
 */
export function weddingLoads(
  tasks: readonly AssignedTaskRow[],
  today: string,
): Record<string, WeddingLoad> {
  const out: Record<string, { overdue: number; open: number }> = {}
  for (const t of tasks) {
    if (!isOpen(t)) continue
    const load = out[t.weddingId] ?? { overdue: 0, open: 0 }
    load.open += 1
    if (t.dueDate !== null && t.dueDate < today) load.overdue += 1
    out[t.weddingId] = load
  }
  return out
}

/**
 * The weddings to draw a card for: not archived, and in the order a planner works them. The ones
 * still ahead come first, soonest first; then any with no date yet; then weddings whose day has
 * passed but which nobody has archived -- they are still real work (the thank-you notes, the
 * final invoices) and must not vanish, but they should not sit above next Saturday's.
 */
export function orderWeddings(
  weddings: readonly WeddingSummary[],
  today: string,
): WeddingSummary[] {
  const rank = (w: WeddingSummary): number => {
    if (w.weddingDate === null) return 1
    return daysBetween(today, w.weddingDate) >= 0 ? 0 : 2
  }
  return weddings
    .filter((w) => w.status !== 'archived')
    .sort((a, b) => {
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      // Past weddings: the most recent first, so last weekend's is above last spring's.
      if (rank(a) === 2) return (b.weddingDate ?? '').localeCompare(a.weddingDate ?? '')
      return (a.weddingDate ?? '').localeCompare(b.weddingDate ?? '') || a.id.localeCompare(b.id)
    })
}
