import type { TaskRow } from '@guestnote/db'
import { daysBetween, isOpen } from './buckets.ts'

/**
 * Which message a task's due cell and rule line should use. Pure, so the branching is tested
 * without rendering; the components only turn a key into a string. Keys are relative to
 * `app.tasks`.
 */
export type LabelKey = { key: string; values?: { days: number } }

/**
 * The relative line under a due date. `null` for a done task: "3 days overdue" on something that
 * is finished is noise, and the Done group already says the rest.
 */
export function dueLabel(
  task: Pick<TaskRow, 'status' | 'dueDate' | 'dueOffsetDays'>,
  today: string,
): LabelKey | null {
  if (!isOpen(task)) return null
  // An offset with no wedding date is a distinct state, not a missing date: the planner has done
  // their part and the fix is on the wedding's settings screen.
  if (task.dueDate === null) {
    return { key: task.dueOffsetDays !== null ? 'row.noWeddingDate' : 'row.noDue' }
  }
  const days = daysBetween(today, task.dueDate)
  if (days === 0) return { key: 'due.today' }
  if (days === 1) return { key: 'due.tomorrow' }
  if (days < 0) return { key: 'due.overdueDays', values: { days: -days } }
  // 0 and 1 are handled above, so this is always two or more days and the plural is fixed.
  return { key: 'due.inDays', values: { days } }
}

/** "14 days before the wedding". `null` when the task has no rule to state. */
export function ruleLabel(task: Pick<TaskRow, 'dueOffsetDays' | 'dueAt'>): LabelKey | null {
  if (task.dueOffsetDays === null) return task.dueAt === null ? null : { key: 'rule.fixed' }
  if (task.dueOffsetDays === 0) return { key: 'rule.onDay' }
  const days = Math.abs(task.dueOffsetDays)
  return { key: task.dueOffsetDays < 0 ? 'rule.before' : 'rule.after', values: { days } }
}
