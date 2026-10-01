import { coupleTasks } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { commentCounts, threadCopy } from '../../../../../../components/couple/labels.ts'
import {
  type PortalTask,
  type PortalTaskGroup,
  PortalTasks,
} from '../../../../../../components/couple/portal/portal-tasks.tsx'
import { formatCivilDate } from '../../../../../../lib/civil-date.ts'
import { coupleModule, dueCivil } from '../../../../../../lib/couple.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { addTaskComment, deleteTaskComment, taskThread, tickTask } from '../actions.ts'

/**
 * The whole shared plan (spec 0008): "Voor jullie" first -- theirs and not done -- then every
 * shared task by month, undated last. The couple reads each task's stored `due_at`, never its
 * anchor (spec 0004). Three hundred tasks is a long page of short rows, grouped; nothing here
 * collapses, because a phone's scroll is cheaper than a tap per month.
 */
export default async function CouplePlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, ct, locale] = await Promise.all([
    params,
    getTranslations('app.couple.portal'),
    getTranslations('app.couple.planner'),
    getLocale(),
  ])
  const c = await coupleModule(id, 'tasks')
  if (!c) notFound()
  const tasks = await coupleTasks(getDb(), c.principal, c.home.coupleUserIds)
  if (tasks.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('tasksEmpty')}</p>
  }

  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const toRow = (task: (typeof tasks)[number]): PortalTask => {
    const due = dueCivil(task.dueAt)
    return {
      id: task.id,
      title: task.title,
      notes: task.notes,
      due: due ? t('due', { date: formatCivilDate(locale, due) }) : null,
      done: task.done,
      ours: task.ours,
      commentCount: task.commentCount,
    }
  }

  const groups: PortalTaskGroup[] = []
  const forYou = tasks.filter((task) => task.ours && !task.done)
  if (forYou.length > 0) groups.push({ label: t('forYou'), tasks: forYou.map(toRow) })
  const byMonth = new Map<string, PortalTask[]>()
  for (const task of tasks) {
    if (task.ours && !task.done) continue
    const key = task.dueAt ? task.dueAt.toISOString().slice(0, 7) : 'undated'
    byMonth.set(key, [...(byMonth.get(key) ?? []), toRow(task)])
  }
  for (const [key, rows] of [...byMonth].sort(([a], [b]) =>
    a === 'undated' ? 1 : b === 'undated' ? -1 : a.localeCompare(b),
  )) {
    groups.push({
      label: key === 'undated' ? t('undated') : month.format(new Date(`${key}-15T12:00:00Z`)),
      tasks: rows,
    })
  }

  return (
    <PortalTasks
      groups={groups}
      readOnly={c.home.status !== 'live'}
      copy={{
        done: t('done'),
        markDone: String(t.raw('markDone')),
        tickFailed: t('tickFailed'),
        comments: commentCounts(t),
        thread: threadCopy(t, ct),
      }}
      actions={{
        tick: tickTask.bind(null, id),
        thread: taskThread.bind(null, id),
        comment: addTaskComment.bind(null, id),
        remove: deleteTaskComment.bind(null, id),
      }}
    />
  )
}
