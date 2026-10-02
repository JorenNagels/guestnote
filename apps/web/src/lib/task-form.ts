import type { TaskAssigneeRole, TaskDue, TaskInput, TaskVisibility } from '@guestnote/db'
import { isUuid } from './uuid.ts'

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

export type TaskFormValues = {
  title: string
  notes: string
  assigneeRole: TaskAssigneeRole
  /**
   * The staff member a planner task goes to (spec 0009 C1), or `''` to leave it to the repo: a new
   * task then goes to whoever saves it, an edit keeps who has it. Ignored when the owner is the
   * couple. One field beside `assigneeRole`, not a union of the two, because the pills post one
   * value and a form state is a bag of strings until `parseTaskForm` makes it an input.
   */
  assigneeUserId: string
  visibility: TaskVisibility
  dueKind: 'none' | 'offset' | 'date'
  /** A whole number as typed, always non-negative. The direction is `offsetDirection`. */
  offsetDays: string
  offsetDirection: 'before' | 'after'
  /** The event the offset counts from, `''` for the main wedding day (spec 0004). */
  anchorEventId: string
  /** `YYYY-MM-DD`, from an `<input type="date">`. */
  date: string
}

/** `owner` is an assignee who is not, or no longer, staff on this wedding (spec 0009 C1). */
export type TaskFormError = 'title' | 'notes' | 'owner' | 'offset' | 'date' | 'anchorGone'

/** One entry in the "Telt vanaf" select: a live event of this wedding. */
export type TaskAnchorOption = { id: string; label: string; startsOn: string }

/** An event as the select needs it: three fields, so the client payload carries no venue or time. */
export const anchorOption = (e: TaskAnchorOption): TaskAnchorOption => ({
  id: e.id,
  label: e.label,
  startsOn: e.startsOn,
})

export const EMPTY_FORM: TaskFormValues = {
  title: '',
  notes: '',
  assigneeRole: 'planner',
  assigneeUserId: '',
  visibility: 'shared',
  dueKind: 'none',
  offsetDays: '',
  offsetDirection: 'before',
  anchorEventId: '',
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

  const assigneeRole = v.assigneeRole === 'couple' ? 'couple' : 'planner'
  // Shape only, as for the anchor below: whether this person is staff on THIS wedding is the
  // repo's read, the check that holds for a hand-built POST. A couple task drops it, because the
  // repo refuses to build a couple task that names a user.
  const assignee =
    assigneeRole === 'planner' && typeof v.assigneeUserId === 'string'
      ? v.assigneeUserId.trim()
      : ''
  if (assignee !== '' && !isUuid(assignee)) return { ok: false, error: 'owner' }

  let due: TaskDue = { kind: 'none' }
  if (v.dueKind === 'offset') {
    const days = offsetFromForm(
      String(v.offsetDays ?? ''),
      v.offsetDirection === 'after' ? 'after' : 'before',
    )
    if (days === null) return { ok: false, error: 'offset' }
    // Only the shape is checked here; whether it is a live event of THIS wedding is the repo's
    // parent read, which is the check that holds for a hand-built POST.
    const anchor = typeof v.anchorEventId === 'string' ? v.anchorEventId.trim() : ''
    // A malformed id would reach Postgres as a uuid cast error and come back a 500; it is no
    // event this wedding has, which is what `anchorGone` already says.
    if (anchor !== '' && !isUuid(anchor)) return { ok: false, error: 'anchorGone' }
    due = { kind: 'offset', days, anchorEventId: anchor === '' ? null : anchor }
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
      assigneeRole,
      ...(assignee === '' ? {} : { assigneeUserId: assignee }),
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
  assigneeUserId: string | null
  dueOffsetDays: number | null
  anchorEventId?: string | null
  dueDate: string | null
}): TaskFormValues {
  const base: TaskFormValues = {
    ...EMPTY_FORM,
    title: task.title,
    notes: task.notes ?? '',
    visibility: task.visibility,
    assigneeRole: task.assigneeRole ?? 'planner',
    assigneeUserId: task.assigneeRole === 'couple' ? '' : (task.assigneeUserId ?? ''),
  }
  if (task.dueOffsetDays !== null) {
    return {
      ...base,
      dueKind: 'offset',
      offsetDays: String(Math.abs(task.dueOffsetDays)),
      offsetDirection: task.dueOffsetDays > 0 ? 'after' : 'before',
      anchorEventId: task.anchorEventId ?? '',
    }
  }
  if (task.dueDate !== null) return { ...base, dueKind: 'date', date: task.dueDate }
  return base
}
