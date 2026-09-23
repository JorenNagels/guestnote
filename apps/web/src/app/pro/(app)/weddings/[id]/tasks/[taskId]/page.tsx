import { getTask, getWedding, listTaskComments } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { todayCivil } from '../../../../../../../components/tasks/buckets.ts'
import { Comments } from '../../../../../../../components/tasks/comments.tsx'
import { TasksIntl } from '../../../../../../../components/tasks/provider.tsx'
import { TaskDetail } from '../../../../../../../components/tasks/task-detail.tsx'
import { getDb } from '../../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../../lib/principal.ts'
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

  const db = getDb()
  const wedding = await getWedding(db, memberships, orgId, id)
  if (!wedding) notFound()
  const task = await getTask(db, memberships, orgId, id, taskId)
  if (!task) notFound()
  const comments = await listTaskComments(db, memberships, orgId, id, taskId)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <TasksIntl>
        <TaskDetail task={task} weddingDate={wedding.weddingDate} today={todayCivil()} />
        <Comments weddingId={id} taskId={taskId} visibility={task.visibility} comments={comments} />
      </TasksIntl>
    </div>
  )
}
