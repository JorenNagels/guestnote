import { and, asc, eq, isNull } from 'drizzle-orm'
import type { TenantDb } from '../client.ts'
import { newId } from '../id.ts'
import { users } from '../schema/auth.ts'
import { taskComments } from '../schema/tasks.ts'
import { withTenant } from '../tenant.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

import { loadTask, personName, type TaskCommentRow, type TaskVisibility } from './tasks.ts'

/**
 * A task's comment thread (spec 0003, S2), split out of `tasks.ts` (PR #1 review). Same callers,
 * same rules: see that file's header for who may call these and why a couple may not.
 */

const COMMENT_SELECT = {
  id: taskComments.id,
  taskId: taskComments.taskId,
  visibility: taskComments.visibility,
  authorUserId: taskComments.authorUserId,
  authorName: personName,
  body: taskComments.body,
  createdAt: taskComments.createdAt,
}

function selectComments(tx: TenantDb) {
  return tx
    .select(COMMENT_SELECT)
    .from(taskComments)
    .leftJoin(users, eq(users.id, taskComments.authorUserId))
}

const toComment = (r: {
  id: string
  taskId: string
  visibility: string
  authorUserId: string | null
  authorName: string | null
  body: string
  createdAt: Date
}): TaskCommentRow => ({ ...r, visibility: r.visibility as TaskVisibility })

/** A task's thread, oldest first. `[]` for an unreachable wedding and for a thread with nobody in it. */
export async function listTaskComments(
  scope: WeddingScope,
  taskId: string,
): Promise<TaskCommentRow[]> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return []

  const rows = await withTenant(db, principal, (tx) =>
    selectComments(tx)
      .where(
        and(
          eq(taskComments.taskId, taskId),
          eq(taskComments.weddingId, weddingId),
          isNull(taskComments.deletedAt),
        ),
      )
      .orderBy(asc(taskComments.createdAt), asc(taskComments.id)),
  )
  return rows.map(toComment)
}

/**
 * Adds a comment and returns it, or `notFound` when the task is not in that wedding.
 *
 * The task is read under the SAME wedding filter first. The insert trigger looks the task up by
 * id alone and would happily attach a comment to a sibling wedding's task for an org-wide
 * principal, stamping that wedding's id on it -- a foreign key that plain FKs do not stop (spec
 * 0003, "Shared rules"). `org_id`, `wedding_id` and `visibility` are then overwritten by that
 * trigger; the values written here only satisfy NOT NULL.
 */
export async function addTaskComment(
  scope: WeddingScope,
  taskId: string,
  body: string,
): Promise<Result<TaskCommentRow, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')
  const text = body.trim()
  if (!text) throw new RangeError('tasks: a comment needs a body')

  return withTenant(db, principal, async (tx) => {
    if (!(await loadTask(tx, weddingId, taskId))) return fail('notFound')

    const id = newId()
    await tx.insert(taskComments).values({
      id,
      orgId: principal.orgId,
      weddingId,
      taskId,
      authorUserId: principal.userId,
      body: text,
    })
    const rows = await selectComments(tx).where(eq(taskComments.id, id))
    const row = rows[0]
    return row ? ok(toComment(row)) : fail('notFound')
  })
}
