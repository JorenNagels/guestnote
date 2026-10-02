import { getWedding, listTaskAssignees, listWeddingEvents, WeddingScope } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { Comments } from '../../../../../../../components/tasks/comments.tsx'
import { TasksIntl } from '../../../../../../../components/tasks/provider.tsx'
import { TaskDetail } from '../../../../../../../components/tasks/task-detail.tsx'
import { getDb } from '../../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../../lib/principal.ts'
import { anchorOption } from '../../../../../../../lib/task-form.ts'
import { loadTaskThread } from '../../../../../../../lib/task-thread.ts'
import { todayCivil } from '../../../../../../../lib/tminus.ts'
import { isUuid } from '../../../../../../../lib/uuid.ts'

/**
 * One task and its thread. Slice S2 of docs/specs/0003.
 *
 * A task that is not in this wedding is a 404 and not a 403, for the reason the checklist page
 * gives: `getTask` answers `null` for "no such task", "in another wedding" and "you may not see
 * this wedding" alike, and the page must not be able to tell them apart.
 *
 * Since spec 0009 B1 the checklist opens the same task in a side panel (`?task=`); this page stays
 * for links from Today and from email. Both load through `loadTaskThread`, so they read the task
 * the same way.
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
  const [thread, events, staff] = await Promise.all([
    loadTaskThread(scope, taskId),
    listWeddingEvents(scope),
    listTaskAssignees(scope),
  ])
  if (!thread) notFound()
  const { task, comments, coupleUserIds } = thread

  return (
    <div className="mx-auto max-w-3xl px-6 pt-6 pb-8">
      <TasksIntl>
        <TaskDetail
          task={task}
          weddingDate={wedding.weddingDate}
          events={events.map(anchorOption)}
          staff={staff}
          viewerId={memberships.userId}
          today={todayCivil()}
        />
        <Comments
          weddingId={id}
          taskId={taskId}
          visibility={task.visibility}
          comments={comments}
          coupleUserIds={coupleUserIds}
        />
      </TasksIntl>
    </div>
  )
}
