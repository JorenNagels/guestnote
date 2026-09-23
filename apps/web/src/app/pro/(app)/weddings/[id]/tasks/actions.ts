'use server'

import {
  addTaskComment,
  completeTask,
  createTask,
  type TaskRow,
  type TaskVisibility,
  updateTask,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import {
  COMMENT_MAX,
  parseTaskForm,
  type TaskFormError,
} from '../../../../../../components/tasks/form.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

/**
 * The checklist's writes. Slice S2 of docs/specs/0003.
 *
 * ## Each one does its own authorization
 *
 * A Server Function is a POST to its own route, so `(app)/layout.tsx`'s session gate never runs
 * for it (CLAUDE.md invariant 7). `currentMemberships()` is the "who are you", and the repo
 * re-derives the principal from membership rows for every call and answers `null` for a wedding
 * the caller may not touch. No id in here is trusted: `weddingId` and `taskId` arrive from the
 * client, and a task that is not in that wedding comes back `notFound`, the same answer as a
 * wedding that does not exist.
 *
 * Nothing catches a database error. What can reach one is a bad input, and `parseTaskForm` has
 * already refused those; anything else is an outage, and swallowing it into `failed` would hide it
 * from the logs that Next writes for an uncaught throw.
 */

export type TaskActionError = TaskFormError | 'comment' | 'notFound'
export type TaskActionResult = { ok: true } | { ok: false; error: TaskActionError }

/**
 * `/pro/weddings/[id]/tasks` is the ROUTE FILE path and not the URL: `revalidatePath` works on the
 * file structure, and `proxy.ts` rewrites `app.guestnote.be/weddings/...` to `/pro/weddings/...`
 * (the same trap `(app)/actions.ts` documents for `DASHBOARD_TREE`). `'layout'` so the detail
 * pages below it go stale together with the list, since a task's title shows on both.
 */
const TASKS_TREE = '/pro/weddings/[id]/tasks'
const refresh = () => revalidatePath(TASKS_TREE, 'layout')

async function who(...ids: string[]) {
  if (!ids.every(isUuid)) return null
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  return memberships && orgId ? { memberships, orgId } : null
}

const NOT_FOUND = { ok: false, error: 'notFound' } as const

export async function createTaskAction(
  weddingId: string,
  values: unknown,
): Promise<TaskActionResult & { taskId?: string }> {
  const parsed = parseTaskForm(values)
  if (!parsed.ok) return parsed

  const ctx = await who(weddingId)
  if (!ctx) return NOT_FOUND
  const task = await createTask(getDb(), ctx.memberships, ctx.orgId, weddingId, parsed.input)
  if (!task) return NOT_FOUND
  refresh()
  return { ok: true, taskId: task.id }
}

export async function updateTaskAction(
  weddingId: string,
  taskId: string,
  values: unknown,
): Promise<TaskActionResult> {
  const parsed = parseTaskForm(values)
  if (!parsed.ok) return parsed

  const ctx = await who(weddingId, taskId)
  if (!ctx) return NOT_FOUND
  const task = await updateTask(
    getDb(),
    ctx.memberships,
    ctx.orgId,
    weddingId,
    taskId,
    parsed.input,
  )
  if (!task) return NOT_FOUND
  refresh()
  return { ok: true }
}

/** The tick box. `done` is coerced: the wire can send anything, and only `true` completes. */
export async function setTaskDoneAction(
  weddingId: string,
  taskId: string,
  done: boolean,
): Promise<TaskActionResult> {
  const ctx = await who(weddingId, taskId)
  if (!ctx) return NOT_FOUND
  const task: TaskRow | null = await completeTask(
    getDb(),
    ctx.memberships,
    ctx.orgId,
    weddingId,
    taskId,
    done === true,
  )
  if (!task) return NOT_FOUND
  refresh()
  return { ok: true }
}

/**
 * Its own function and not `updateTaskAction` with a partial: the toggle sends one field, and
 * routing it through the form parser would demand a title. The trigger
 * `tasks_propagate_visibility` moves the comments, so nothing here touches them.
 */
export async function setTaskVisibilityAction(
  weddingId: string,
  taskId: string,
  visibility: TaskVisibility,
): Promise<TaskActionResult> {
  const ctx = await who(weddingId, taskId)
  if (!ctx) return NOT_FOUND
  const task = await updateTask(getDb(), ctx.memberships, ctx.orgId, weddingId, taskId, {
    visibility: visibility === 'internal' ? 'internal' : 'shared',
  })
  if (!task) return NOT_FOUND
  refresh()
  return { ok: true }
}

export async function addCommentAction(
  weddingId: string,
  taskId: string,
  body: unknown,
): Promise<TaskActionResult> {
  const text = typeof body === 'string' ? body.trim() : ''
  if (text.length === 0 || text.length > COMMENT_MAX) return { ok: false, error: 'comment' }

  const ctx = await who(weddingId, taskId)
  if (!ctx) return NOT_FOUND
  const comment = await addTaskComment(getDb(), ctx.memberships, ctx.orgId, weddingId, taskId, text)
  if (!comment) return NOT_FOUND
  refresh()
  return { ok: true }
}
