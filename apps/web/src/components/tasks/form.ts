import type { TaskAssigneeRole, TaskDue, TaskInput, TaskVisibility } from '@guestnote/db'

/**
 * The task form's values, and the one parser that turns them into a repo input.
 *
 * Runtime-free of `@guestnote/db` (types only) so the client form and the Server Function share
 * it. The action calls it again on the server: a Server Function is a POST, so the client's
 * copy is a convenience and this one is the check.
 */

export const TITLE_MAX = 200
export const NOTES_MAX = 4000
export const COMMENT_MAX = 4000
/** The repo's own limit (`MAX_OFFSET_DAYS`), restated so the form can say it before the trip. */
export const OFFSET_MAX = 3650

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ids arrive from a URL or a POST body. Postgres throws on a malformed uuid rather than
 * matching nothing, so an unchecked one is a 500 where the rule is a 404.
 */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export type TaskFormValues = {
  title: string
  notes: string
  assigneeRole: TaskAssigneeRole
  visibility: TaskVisibility
  dueKind: 'none' | 'offset' | 'date'
  /** A whole number as typed, always non-negative. The direction is `offsetDirection`. */
  offsetDays: string
  offsetDirection: 'before' | 'after'
  /** `YYYY-MM-DD`, from an `<input type="date">`. */
  date: string
}

export type TaskFormError = 'title' | 'notes' | 'offset' | 'date'

export const EMPTY_FORM: TaskFormValues = {
  title: '',
  notes: '',
  assigneeRole: 'planner',
  visibility: 'shared',
  dueKind: 'none',
  offsetDays: '',
  offsetDirection: 'before',
  date: '',
}

const isCivilDate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

/** Signed offset from what the planner typed: "14 before" is -14, "3 after" is +3. */
export function offsetFromForm(days: string, direction: 'before' | 'after'): number | null {
  if (!/^\d{1,4}$/.test(days.trim())) return null
  const n = Number(days.trim())
  if (n > OFFSET_MAX) return null
  // `0 - n` and not `-n`: `-n` is `-0` for zero, and `Object.is(-0, 0)` is false.
  return direction === 'before' ? 0 - n : n
}

export function parseTaskForm(
  raw: unknown,
): { ok: true; input: TaskInput } | { ok: false; error: TaskFormError } {
  const v = raw as Partial<TaskFormValues> | null
  if (typeof v !== 'object' || v === null) return { ok: false, error: 'title' }

  const title = typeof v.title === 'string' ? v.title.trim() : ''
  if (title.length === 0 || title.length > TITLE_MAX) return { ok: false, error: 'title' }

  const notes = typeof v.notes === 'string' ? v.notes.trim() : ''
  if (notes.length > NOTES_MAX) return { ok: false, error: 'notes' }

  let due: TaskDue = { kind: 'none' }
  if (v.dueKind === 'offset') {
    const days = offsetFromForm(
      String(v.offsetDays ?? ''),
      v.offsetDirection === 'after' ? 'after' : 'before',
    )
    if (days === null) return { ok: false, error: 'offset' }
    due = { kind: 'offset', days }
  } else if (v.dueKind === 'date') {
    if (typeof v.date !== 'string' || !isCivilDate(v.date)) return { ok: false, error: 'date' }
    due = { kind: 'date', date: v.date }
  }

  return {
    ok: true,
    input: {
      title,
      notes: notes || null,
      // Anything that is not the literal 'internal' is shared: the wire can send any string, and
      // the column has a CHECK, so an unknown value would otherwise surface as a database error.
      visibility: v.visibility === 'internal' ? 'internal' : 'shared',
      assigneeRole: v.assigneeRole === 'couple' ? 'couple' : 'planner',
      due,
    },
  }
}

/** The inverse, for the edit form: a stored task back to what the planner would have typed. */
export function formFromTask(task: {
  title: string
  notes: string | null
  visibility: TaskVisibility
  assigneeRole: TaskAssigneeRole | null
  dueOffsetDays: number | null
  dueDate: string | null
}): TaskFormValues {
  const base: TaskFormValues = {
    ...EMPTY_FORM,
    title: task.title,
    notes: task.notes ?? '',
    visibility: task.visibility,
    assigneeRole: task.assigneeRole ?? 'planner',
  }
  if (task.dueOffsetDays !== null) {
    return {
      ...base,
      dueKind: 'offset',
      offsetDays: String(Math.abs(task.dueOffsetDays)),
      offsetDirection: task.dueOffsetDays > 0 ? 'after' : 'before',
    }
  }
  if (task.dueDate !== null) return { ...base, dueKind: 'date', date: task.dueDate }
  return base
}
