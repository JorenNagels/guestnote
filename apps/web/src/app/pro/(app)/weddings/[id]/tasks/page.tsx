import {
  getWedding,
  listTaskAssignees,
  listTasks,
  listWeddingEvents,
  WeddingScope,
} from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { parseFilter } from '../../../../../../components/tasks/buckets.ts'
import { Checklist } from '../../../../../../components/tasks/checklist.tsx'
import { TasksIntl } from '../../../../../../components/tasks/provider.tsx'
import { TaskPanel } from '../../../../../../components/tasks/task-panel.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { app } from '../../../../../../lib/routes.ts'
import { anchorOption } from '../../../../../../lib/task-form.ts'
import { loadTaskThread } from '../../../../../../lib/task-thread.ts'
import { todayCivil } from '../../../../../../lib/tminus.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

/**
 * Checklist for one wedding. Slice S2 of docs/specs/0003.
 *
 * `listTasks` returns `[]` for a wedding the caller may not see, which is indistinguishable
 * from a wedding with no tasks, so the 404 comes from `getWedding` first. Same rule as the
 * overview page: telling somebody a wedding exists but is not theirs is itself the leak. It also
 * covers a `couple` or outside editor, for whom `listTasks` refuses on purpose.
 *
 * ## `?task=` opens one task beside the list (spec 0009 B1)
 *
 * Loaded by `loadTaskThread`, the task page's own loader, under this request's scope. An id that
 * is malformed, unknown, or in another wedding is simply no panel and not a 404: the list the
 * planner asked for is still the list, and a stale link from a deleted task should land on it.
 */
export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string | string[]; task?: string | string[] }>
}) {
  const [{ id }, query, memberships, orgId, t] = await Promise.all([
    params,
    searchParams,
    currentMemberships(),
    currentOrgId(),
    getTranslations('app.tasks'),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const scope = WeddingScope.of(getDb(), memberships, orgId, id)
  const wedding = await getWedding(scope)
  if (!wedding) notFound()
  const taskId = Array.isArray(query.task) ? query.task[0] : query.task
  const [listed, events, staff, thread] = await Promise.all([
    listTasks(scope),
    listWeddingEvents(scope),
    listTaskAssignees(scope),
    taskId === undefined ? null : loadTaskThread(scope, taskId),
  ])
  // The list was read alongside the panel's task, so before the panel's read cleared the couple's
  // unread dot; the row would keep it until the next render. Patched here rather than read in
  // sequence, which would put the list behind the task on every panel open.
  const tasks = thread
    ? listed.map((row) => (row.id === thread.task.id ? { ...row, coupleUnread: false } : row))
    : listed
  const filter = parseFilter(query.filter)
  const today = todayCivil()
  const anchors = events.map(anchorOption)

  return (
    <div className="mx-auto max-w-5xl px-6 pt-6 pb-8">
      <header className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
      </header>
      <TasksIntl>
        <Checklist
          weddingId={wedding.id}
          weddingDate={wedding.weddingDate}
          events={anchors}
          staff={staff}
          viewerId={memberships.userId}
          tasks={tasks}
          filter={filter}
          today={today}
        />
        {thread && (
          <TaskPanel
            key={thread.task.id}
            task={thread.task}
            comments={thread.comments}
            coupleUserIds={thread.coupleUserIds}
            weddingDate={wedding.weddingDate}
            events={anchors}
            staff={staff}
            viewerId={memberships.userId}
            today={today}
            closeHref={app.weddingTasks(wedding.id, { filter })}
          />
        )}
      </TasksIntl>
    </div>
  )
}
