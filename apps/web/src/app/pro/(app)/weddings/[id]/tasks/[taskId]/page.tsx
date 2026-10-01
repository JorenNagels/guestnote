import {
  getCoupleAccess,
  getTask,
  getWedding,
  listTaskComments,
  listWeddingEvents,
  markCoupleActivitySeen,
  WeddingScope,
} from '@guestnote/db'
import { notFound } from 'next/navigation'
import { Comments } from '../../../../../../../components/tasks/comments.tsx'
import { TasksIntl } from '../../../../../../../components/tasks/provider.tsx'
import { TaskDetail } from '../../../../../../../components/tasks/task-detail.tsx'
import { getDb } from '../../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../../lib/principal.ts'
import { anchorOption } from '../../../../../../../lib/task-form.ts'
import { todayCivil } from '../../../../../../../lib/tminus.ts'
import { isUuid } from '../../../../../../../lib/uuid.ts'

/**
 * One task and its thread. Slice S2 of docs/specs/0003.
 *
 * A task that is not in this wedding is a 404 and not a 403, for the reason the checklist page
 * gives: `getTask` answers `null` for "no such task", "in another wedding" and "you may not see
 * this wedding" alike, and the page must not be able to tell them apart.
 */
export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>
}) {
  const [{ id, taskId }, memberships, orgId] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
  ])
  if (!memberships || !orgId || !isUuid(id) || !isUuid(taskId)) notFound()

  const scope = WeddingScope.of(getDb(), memberships, orgId, id)
  const wedding = await getWedding(scope)
  if (!wedding) notFound()
  const task = await getTask(scope, taskId)
  if (!task) notFound()
  const [comments, events, couple] = await Promise.all([
    listTaskComments(scope, taskId),
    listWeddingEvents(scope),
    getCoupleAccess(scope),
    // Spec 0008: opening the task is reading what the couple did, so the dot clears here, on
    // the render, rather than through a second request from the browser. A write on a GET, like
    // the invite page's accept; it only ever moves `staff_seen_at` forward.
    task.coupleUnread ? markCoupleActivitySeen(scope, { kind: 'task', id: taskId }) : null,
  ])

  return (
    <div className="mx-auto max-w-3xl px-6 pt-6 pb-8">
      <TasksIntl>
        <TaskDetail
          task={task}
          weddingDate={wedding.weddingDate}
          events={events.map(anchorOption)}
          today={todayCivil()}
        />
        <Comments
          weddingId={id}
          taskId={taskId}
          visibility={task.visibility}
          comments={comments}
          coupleUserIds={couple?.partners.map((p) => p.userId) ?? []}
        />
      </TasksIntl>
    </div>
  )
}
