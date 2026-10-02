import 'server-only'
import {
  getCoupleAccess,
  getTask,
  listTaskComments,
  markCoupleActivitySeen,
  type TaskCommentRow,
  type TaskRow,
  type WeddingScope,
} from '@guestnote/db'
import { isUuid } from './uuid.ts'

export type TaskThread = {
  task: TaskRow
  comments: TaskCommentRow[]
  /** Authors to mark with the "Koppel" chip in the thread (spec 0008). */
  coupleUserIds: string[]
}

/**
 * One task, its comments and who of the authors is the couple: what the task page shows, and
 * since spec 0009 B1 the side panel over the checklist as well. One loader for both, so the two
 * cannot drift into reading the task under different rules -- the panel is the same screen in a
 * different frame, not a second reader.
 *
 * `null` for a malformed id, no such task, a task in another wedding, and a wedding the caller
 * may not see, alike: `getTask` already cannot tell them apart, and the callers must not either.
 * The page turns `null` into a 404; the checklist into no panel.
 *
 * Opening the task is reading what the couple did, so the unread dot clears here, on the render
 * (spec 0008). A write on a GET, like the invite page's accept; it only ever moves
 * `staff_seen_at` forward. Rejected: clearing it from the browser after mount -- a second
 * request, and a dot that stays on whenever JavaScript is slow.
 */
export async function loadTaskThread(
  scope: WeddingScope,
  taskId: unknown,
): Promise<TaskThread | null> {
  // A malformed id would reach Postgres as a uuid cast error, a 500 where the rule is a 404.
  if (!isUuid(taskId)) return null
  const task = await getTask(scope, taskId)
  if (!task) return null
  const [comments, couple] = await Promise.all([
    listTaskComments(scope, taskId),
    getCoupleAccess(scope),
    task.coupleUnread ? markCoupleActivitySeen(scope, { kind: 'task', id: taskId }) : null,
  ])
  return { task, comments, coupleUserIds: couple?.partners.map((p) => p.userId) ?? [] }
}
